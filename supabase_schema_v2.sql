-- ============================================================
-- ADELCA · Esquema segmentado para Agenda Reunión (v2)
-- Reemplaza la tabla plana "registro" por 7 tablas relacionadas.
-- Corre esto UNA vez en el SQL Editor de Supabase, de arriba a abajo.
-- ============================================================

-- 1) EMPLEADOS — nómina completa (hoja BD)
create table if not exists empleados (
  codigo    bigint primary key,
  nombre    text not null,
  unidad    text,
  localidad text
);

-- 2) CAPACITADORES — quién da qué módulo (hoja USUARIOS)
create table if not exists capacitadores (
  id     bigserial primary key,
  nombre text not null,
  modulo text,
  temas  text
);

-- 3) SALAS — catálogo de salas con su capacidad
create table if not exists salas (
  id        bigserial primary key,
  nombre    text unique not null,
  localidad text,
  capacidad integer
);

-- 4) SESIONES — nivel TRAMO: una fila por sesión de capacitación
create table if not exists sesiones (
  id            bigint primary key,
  capacitador   text,
  modulo        text,
  tema          text,
  fecha         date,
  hora          text,
  hora_fin      text,
  lugar         text,
  sala          text,
  estado        text,
  requisitos    text,
  observaciones text,
  modificado    text,   -- de REGISTRO NUEVO: quién modificó por última vez
  cambios       text,   -- de REGISTRO NUEVO: qué cambió
  fecha_cambio  text,   -- de REGISTRO NUEVO: cuándo
  updated_at    timestamptz default now()
);

-- 5) SESION_PARTICIPANTES — nivel PERSONA: un asistente por fila
create table if not exists sesion_participantes (
  id         bigint primary key,
  sesion_id  bigint references sesiones(id) on delete cascade,
  codigo     bigint,
  nombre     text,
  unidad     text,
  localidad  text,
  modalidad  text,
  updated_at timestamptz default now()
);
create index if not exists idx_participantes_sesion on sesion_participantes(sesion_id);

-- 6) USUARIOS_SAP — directorio de usuarios SAP (Matriz DEV110)
--    SIN "Clave" ni "Clave QAS" — esas columnas del Excel original tenían
--    contraseñas en texto plano y quedaron fuera a propósito.
create table if not exists usuarios_sap (
  id_usuario     text primary key,
  nombres        text,
  apellidos      text,
  nombre_completo text,
  rol_compuesto  text,
  cargo          text,
  departamento   text,
  localidad      text,
  correo         text
);

-- 7) ROLES_LIBERADOS — a quién ya se le activó su rol SAP
--    Sin llave foránea forzada hacia usuarios_sap: 3 de 256 usuarios de esta
--    hoja no tienen ficha en Matriz DEV110 en el Excel original (dato real,
--    no error de carga) — el cruce se hace en la consulta, no a la fuerza aquí.
create table if not exists roles_liberados (
  id_usuario text primary key,
  estado     text
);

-- app_meta ya existía (marca de siembra, códigos de acceso) — se mantiene igual.
create table if not exists app_meta (
  key   text primary key,
  value text
);

-- ============================================================
-- Row Level Security: mismas políticas abiertas que usa el resto de la app
-- (acceso con la llave anónima pública; ver la nota de seguridad de siempre).
-- ============================================================
do $$
declare
  t text;
begin
  for t in select unnest(array['empleados','capacitadores','salas','sesiones','sesion_participantes','usuarios_sap','roles_liberados','app_meta'])
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "select_all" on %I;', t);
    execute format('create policy "select_all" on %I for select using (true);', t);
    execute format('drop policy if exists "insert_all" on %I;', t);
    execute format('create policy "insert_all" on %I for insert with check (true);', t);
    execute format('drop policy if exists "update_all" on %I;', t);
    execute format('create policy "update_all" on %I for update using (true) with check (true);', t);
    execute format('drop policy if exists "delete_all" on %I;', t);
    execute format('create policy "delete_all" on %I for delete using (true);', t);
  end loop;
end $$;

-- Verificación: deben aparecer las 8 tablas
select tablename from pg_tables where schemaname='public'
  and tablename in ('empleados','capacitadores','salas','sesiones','sesion_participantes','usuarios_sap','roles_liberados','app_meta')
order by tablename;
