# Centro de Control · ADELCA — Planificación de Capacitaciones SAP

Proyecto React + TypeScript + Vite, dividido por pestañas, conectado a Supabase.

## Estructura

```
src/
  types/domain.ts          Tipos del dominio (Sesion, RegistroRow, ConflictItem, etc.)
  lib/
    conflictEngine.ts      Motor de conflictos (choques de capacitador/persona/sala/capacidad)
    persistence.ts         Carga/guardado contra Supabase (sesiones + sesion_participantes)
    supabaseClient.ts      Cliente de Supabase (usa variables de entorno)
    withTimeout.ts         Evita que la app se quede cargando para siempre si Supabase no responde
    format.ts               Formato de fechas/duración
  hooks/
    useAppData.ts           Estado central: registro, sesiones, conflictos, guardado
    useAuth.ts               Login por código (editor / solo lectura)
    useToast.tsx             Notificaciones
  components/shared/
    TopBar.tsx, AuthGate.tsx
  tabs/
    AgendaReunion/           Pestaña Agenda Reunión (Grupo → Tramo → Persona) + modal de sesión
    Gantt/                   Pestaña Gantt (vista día / mes, filtros de localidad y tema)
    RolesSap/                 Panel de cruce Capacitación vs. Roles SAP liberados
  data/                      Datos de siembra (nómina, sesiones iniciales, usuarios SAP, roles)
  App.tsx                    Componente raíz
```

## Desarrollo local

```bash
npm install
cp .env.example .env     # y pon tus credenciales reales de Supabase
npm run dev
```

Sin `.env` configurado, la app funciona igual pero en modo local (guarda en el
navegador con `localStorage`, no en la nube).

## Variables de entorno

| Variable | De dónde sale |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public key |

**Nunca subas el archivo `.env` a git** — ya está en `.gitignore`. La llave "anon"
es pública por diseño (así funciona Supabase desde el navegador), pero igual es
buena práctica no versionarla directamente en el repo.

## Base de datos (Supabase)

Este proyecto asume que ya tienes corridos, en tu proyecto de Supabase:
- `supabase_schema_v2.sql` (crea las 7 tablas)
- `supabase_seed_reference_tables.sql` (siembra empleados/capacitadores/salas/usuarios SAP/roles)

Las tablas `sesiones` y `sesion_participantes` se siembran solas la primera vez
que la app se conecta (usa los datos de `src/data/`).

## Desplegar en Vercel

**Opción rápida (sin git):**
```bash
npm install -g vercel
vercel          # sigue las instrucciones, pide iniciar sesión
vercel --prod   # cada vez que quieras actualizar la misma URL
```
Después de `vercel`, agrega las variables de entorno en el dashboard de Vercel
(Project → Settings → Environment Variables) con los mismos nombres del `.env`,
y vuelve a desplegar (`vercel --prod`) para que las tome.

**Opción con GitHub (recomendada si vas a seguir iterando):**
1. Sube este proyecto a un repositorio en GitHub.
2. En vercel.com → "Add New Project" → importa el repositorio.
3. Vercel detecta Vite automáticamente — no hay que tocar nada de configuración.
4. Antes de desplegar, agrega las variables de entorno (mismo panel de "Environment Variables").
5. Cada `git push` despliega solo.

## Scripts

```bash
npm run dev       # servidor de desarrollo
npm run build     # build de producción (dist/)
npm run preview   # sirve el build de producción localmente, para probarlo antes de desplegar
```
