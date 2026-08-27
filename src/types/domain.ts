/// ============================================================
// Tipos del dominio · Centro de Control ADELCA
// ============================================================

export type Modalidad = 'PRESENCIAL' | 'VIRTUAL' | 'POR CONFIRMAR' | 'HÍBRIDA';
export type Estado = 'PROGRAMADA' | 'POR CONFIRMAR';
export type Rol = 'editor' | 'viewer';

/** Fila de la tabla "sesiones" en Supabase (nivel TRAMO) */
export interface SesionDb {
  id: number;
  capacitador: string | null;
  modulo: string | null;
  tema: string | null;
  fecha: string | null; // YYYY-MM-DD
  hora: string | null; // HH:MM
  hora_fin: string | null;
  lugar: string | null;
  sala: string | null;
  estado: string | null;
  requisitos: string | null;
  observaciones: string | null;
  /** Modalidad con la que asiste el capacitador. Vive a nivel de sesión porque
   *  es independiente de la de cada participante: comparar ambas es lo que
   *  determina si la reunión es híbrida. */
  modalidad?: string | null;
  modificado?: string | null;
  cambios?: string | null;
  fecha_cambio?: string | null;
}

/** Fila de la tabla "sesion_participantes" en Supabase (nivel PERSONA) */
export interface ParticipanteDb {
  id: number;
  sesion_id: number;
  codigo: number | null;
  nombre: string | null;
  unidad: string | null;
  localidad: string | null;
  modalidad: string | null;
}

/** Fila "plana" que usa la UI — una por asistente, con los campos de su sesión
 *  ya combinados (equivalente a lo que era antes la tabla "registro"). */
export interface RegistroRow {
  id: number;
  _sesionId: number;
  capacitador: string | null;
  modulo: string | null;
  tema: string | null;
  nombre: string | null;
  codigo: number | null;
  unidad: string | null;
  localidad: string | null;
  lugar: string | null;
  modalidad: string | null;
  fecha: string | null;
  hora: string | null;
  horaFin: string | null;
  requisitos: string | null;
  observaciones: string | null;
  estado: string | null;
  sala: string | null;
  /** Modalidad del capacitador (de la tabla sesiones). `modalidad` a secas es la
   *  del participante de esta fila. */
  modalidadSesion?: string | null;
}

export interface Attendee {
  id: number;
  nombre: string | null;
  codigo: number | null;
  unidad: string | null;
  localidad: string | null;
  modalidad: string | null;
}

/** Sesión agrupada (nivel TRAMO), con todos sus asistentes */
export interface Sesion {
  sessionId: string; // clave compuesta (compatibilidad con lógica existente)
  _sesionId: number; // id real en Supabase
  capacitador: string | null;
  modulo: string | null;
  tema: string | null;
  fecha: string | null;
  hora: string | null;
  horaFin: string | null;
  horaMin: number | null;
  horaFinMin: number | null;
  lugar: string | null;
  localidad: string | null;
  modalidad: string | null;
  sala: string | null;
  estado: string | null;
  requisitos: string | null;
  observaciones: string | null;
  attendees: Attendee[];
  rowIds: number[];
}

export type ConflictType = 'capacitador_2_lugares' | 'capacitador_solape' | 'persona_choque' | 'sala_doble' | 'capacidad';
export type Severity = 'critico' | 'medio' | 'alto';

export interface ConflictItem {
  type: ConflictType;
  severity: Severity;
  fecha: string;
  sessionIds: string[];
  label: string;
  detail: string;
  capacitador?: string;
  nombre?: string | null;
  codigo?: number | null;
  sala?: string | null;
}

export interface Empleado {
  codigo: number | null;
  nombre: string;
  unidad: string | null;
  localidad: string | null;
}

export interface Capacitador {
  nombre: string;
  modulo: string | null;
  temas: string | null;
}

export interface Sala {
  nombre: string;
  localidad: string | null;
  capacidad: number | null;
}

export interface UsuarioSap {
  id_usuario: string;
  nombres: string | null;
  apellidos: string | null;
  nombre_completo: string | null;
  rol_compuesto: string | null;
  cargo: string | null;
  departamento: string | null;
  localidad: string | null;
  correo: string | null;
}

export interface RolLiberado {
  id_usuario: string;
  estado: string | null;
}

export interface Lookups {
  usuarios: Capacitador[];
  salas: Sala[];
}