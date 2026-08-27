import type { UsuarioSap, RolLiberado } from '../types/domain';

export type EstadoLiberacion = 'SI' | 'NO' | 'NO REMITIDO A CREACION';

export interface ResultadoRol {
  /** ID de usuario SAP (ej. "JSOLORZANO"), o null si la persona no está en DEV110 */
  idUsuario: string | null;
  estado: EstadoLiberacion;
}

/** Normaliza "APELLIDOS Y NOMBRES" para poder cruzarlos: mayúsculas, sin espacios
 *  dobles, sin tildes y sin signos de puntuación. Los nombres vienen escritos a
 *  mano en hojas distintas, así que sin esto muchos no cruzarían por diferencias
 *  mínimas (una tilde, un espacio de más, un punto). */
export function normName(s: string | null | undefined): string {
  return (s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes/diéresis
    .replace(/[^A-ZÑ0-9 ]/g, ' ')    // deja solo letras, números y espacios
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Devuelve una función que, dado un nombre tal como aparece en la hoja de
 * registro, resuelve su ID de usuario SAP y su estado de liberación:
 *
 *  - Está en DEV110 y su ID aparece en Roles Liberados  -> 'SI'
 *  - Está en DEV110 pero NO aparece en Roles Liberados  -> 'NO'
 *  - No está en DEV110                                   -> 'NO REMITIDO A CREACION'
 */
export function buildRolesResolver(
  usuariosSap: UsuarioSap[],
  rolesLiberados: RolLiberado[]
): (nombre: string | null | undefined) => ResultadoRol {
  // Índice por nombre completo normalizado -> id de usuario SAP
  const porNombre = new Map<string, string>();
  for (const u of usuariosSap) {
    const claves = [
      u.nombre_completo,
      // Respaldo: algunas fichas traen apellidos y nombres en campos separados
      u.apellidos && u.nombres ? `${u.apellidos} ${u.nombres}` : null,
    ];
    for (const clave of claves) {
      const k = normName(clave);
      if (k && !porNombre.has(k)) porNombre.set(k, u.id_usuario);
    }
  }

  // Set de ids que YA fueron liberados (estado que contiene "LISTO", o "SI")
  const liberados = new Set<string>();
  for (const r of rolesLiberados) {
    const estado = normName(r.estado);
    if (!r.id_usuario) continue;
    if (estado.includes('LISTO') || estado === 'SI' || estado === '') {
      // La hoja "ROLES LIBERADOS" lista únicamente a quienes ya están listos;
      // si el estado viniera vacío se asume liberado por estar en esa hoja.
      liberados.add(normName(r.id_usuario));
    }
  }

  const cache = new Map<string, ResultadoRol>();

  return (nombre) => {
    const key = normName(nombre);
    if (!key) return { idUsuario: null, estado: 'NO REMITIDO A CREACION' };
    const enCache = cache.get(key);
    if (enCache) return enCache;

    const idUsuario = porNombre.get(key) ?? null;
    let resultado: ResultadoRol;
    if (!idUsuario) {
      resultado = { idUsuario: null, estado: 'NO REMITIDO A CREACION' };
    } else {
      resultado = { idUsuario, estado: liberados.has(normName(idUsuario)) ? 'SI' : 'NO' };
    }
    cache.set(key, resultado);
    return resultado;
  };
}
