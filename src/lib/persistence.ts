import { supabaseClient } from './supabaseClient';
import type { RegistroRow, SesionDb, ParticipanteDb } from '../types/domain';
import sesionesSeed from '../data/sesiones.json';
import participantesSeed from '../data/sesionParticipantes.json';

const SESIONES_SEED = sesionesSeed as SesionDb[];
const PARTICIPANTES_SEED = participantesSeed as ParticipanteDb[];

export function describeSupabaseError(e: unknown): string {
  if (!e) return 'error desconocido';
  if (typeof e === 'string') return e;
  const err = e as { message?: string; hint?: string; details?: string };
  const base = err.message || err.hint || err.details || JSON.stringify(e);
  if (/postmessage|dataclone|could not be cloned/i.test(base)) {
    return base + ' → esto suele deberse a una extensión del navegador interceptando la conexión.';
  }
  return base;
}

export function mergeSesionParticipante(sesion: SesionDb, part: ParticipanteDb): RegistroRow {
  let codigo = part.codigo;
  if (typeof codigo !== 'number' || !Number.isFinite(codigo)) codigo = null;
  return {
    id: part.id,
    _sesionId: sesion.id,
    capacitador: sesion.capacitador, modulo: sesion.modulo, tema: sesion.tema,
    nombre: part.nombre, codigo, unidad: part.unidad,
    localidad: part.localidad, lugar: sesion.lugar, modalidad: part.modalidad,
    fecha: sesion.fecha, hora: sesion.hora, horaFin: sesion.hora_fin,
    requisitos: sesion.requisitos, observaciones: sesion.observaciones,
    estado: sesion.estado, sala: sesion.sala,
    modalidadSesion: sesion.modalidad ?? null,
  };
}

export function joinToFlat(sesionesRows: SesionDb[], participantesRows: ParticipanteDb[]): RegistroRow[] {
  const byId = new Map(sesionesRows.map(s => [s.id, s]));
  const flat: RegistroRow[] = [];
  for (const p of participantesRows) {
    const s = byId.get(p.sesion_id);
    if (!s) continue;
    flat.push(mergeSesionParticipante(s, p));
  }
  return flat;
}

export function decodeSeed(): RegistroRow[] {
  return joinToFlat(SESIONES_SEED, PARTICIPANTES_SEED);
}

export function sesionToDbRow(s: RegistroRow): SesionDb {
  return {
    id: s._sesionId, capacitador: s.capacitador, modulo: s.modulo, tema: s.tema,
    fecha: s.fecha || null, hora: s.hora || null, hora_fin: s.horaFin || null,
    lugar: s.lugar, sala: s.sala, estado: s.estado,
    requisitos: s.requisitos, observaciones: s.observaciones,
    modalidad: s.modalidadSesion ?? null,
  };
}
export function participanteToDbRow(r: RegistroRow): ParticipanteDb {
  let codigo = r.codigo;
  if (typeof codigo !== 'number' || !Number.isFinite(codigo)) codigo = null;
  return { id: r.id, sesion_id: r._sesionId, codigo, nombre: r.nombre, unidad: r.unidad, localidad: r.localidad, modalidad: r.modalidad };
}

async function isSeedComplete(): Promise<boolean> {
  if (!supabaseClient) return false;
  try {
    const { data, error } = await supabaseClient.from('app_meta').select('value').eq('key', 'seed_complete_v2').maybeSingle();
    if (error) throw error;
    return !!(data && (data as { value: string }).value === 'true');
  } catch {
    return false;
  }
}
async function markSeedComplete(): Promise<void> {
  if (!supabaseClient) return;
  try { await supabaseClient.from('app_meta').upsert({ key: 'seed_complete_v2', value: 'true' }, { onConflict: 'key' }); }
  catch (e) { console.error('No se pudo marcar la siembra como completa:', describeSupabaseError(e)); }
}

async function upsertSesionesRemote(rows: SesionDb[]): Promise<void> {
  if (!supabaseClient || !rows.length) return;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabaseClient.from('sesiones').upsert(chunk, { onConflict: 'id' });
    if (error) throw error;
  }
}
async function upsertParticipantesRemote(rows: ParticipanteDb[]): Promise<void> {
  if (!supabaseClient || !rows.length) return;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabaseClient.from('sesion_participantes').upsert(chunk, { onConflict: 'id' });
    if (error) throw error;
  }
}

/** Siembra todo-o-nada: si algo falla a mitad de camino, deshace lo insertado en
 *  ambas tablas para no dejarlas "medio sembradas". */
async function seedRemote(sesionesRows: SesionDb[], participantesRows: ParticipanteDb[]): Promise<void> {
  if (!supabaseClient) return;
  const insertedSesionIds: number[] = [];
  const insertedParticipanteIds: number[] = [];
  try {
    for (let i = 0; i < sesionesRows.length; i += 500) {
      const chunk = sesionesRows.slice(i, i + 500);
      const { error } = await supabaseClient.from('sesiones').upsert(chunk, { onConflict: 'id' });
      if (error) throw error;
      insertedSesionIds.push(...chunk.map(r => r.id));
    }
    for (let i = 0; i < participantesRows.length; i += 500) {
      const chunk = participantesRows.slice(i, i + 500);
      const { error } = await supabaseClient.from('sesion_participantes').upsert(chunk, { onConflict: 'id' });
      if (error) throw error;
      insertedParticipanteIds.push(...chunk.map(r => r.id));
    }
  } catch (e) {
    if (insertedParticipanteIds.length) {
      try { await supabaseClient.from('sesion_participantes').delete().in('id', insertedParticipanteIds); } catch { /* best effort */ }
    }
    if (insertedSesionIds.length) {
      try { await supabaseClient.from('sesiones').delete().in('id', insertedSesionIds); } catch { /* best effort */ }
    }
    throw e;
  }
}

/** Supabase/PostgREST devuelve como MÁXIMO 1000 filas por consulta. Con 2.727
 *  participantes, un select('*') normal traía solo las primeras 1000 — y entonces
 *  la app creía que la tabla estaba incompleta y volvía a escribir los datos
 *  originales del Excel encima, borrando las ediciones reales.
 *  Aquí se pide primero el total y luego TODAS las páginas EN PARALELO, para que
 *  traer la tabla completa cueste casi lo mismo que una sola petición (pedirlas
 *  una tras otra hacía que en redes lentas se agotara el tiempo de espera). */
async function fetchAllRows<T>(table: string): Promise<T[]> {
  if (!supabaseClient) return [];
  const pageSize = 1000;

  const { count, error: countError } = await supabaseClient
    .from(table)
    .select('id', { count: 'exact', head: true });
  if (countError) throw countError;

  const total = count ?? 0;
  if (total === 0) return [];

  const pages: Promise<T[]>[] = [];
  for (let from = 0; from < total; from += pageSize) {
    const to = Math.min(from + pageSize - 1, total - 1);
    pages.push(
      (async () => {
        const { data, error } = await supabaseClient!
          .from(table)
          .select('*')
          .order('id')
          .range(from, to);
        if (error) throw error;
        return (data || []) as T[];
      })()
    );
  }
  const results = await Promise.all(pages);
  return results.flat();
}

/** Todo-o-nada, con auto-reparación: nunca pisa filas que ya existen (respeta
 *  ediciones reales); solo rellena lo que falte del Excel original. */
export async function ensureSeededAndFetch(): Promise<RegistroRow[]> {
  if (!supabaseClient) return decodeSeed();
  const [dataS, dataP] = await Promise.all([
    fetchAllRows<SesionDb>('sesiones'),
    fetchAllRows<ParticipanteDb>('sesion_participantes'),
  ]);

  const seeded = await isSeedComplete();
  if (seeded) return joinToFlat(dataS, dataP);

  if (dataS.length >= SESIONES_SEED.length && dataP.length >= PARTICIPANTES_SEED.length) {
    markSeedComplete().catch(() => {});
    return joinToFlat(dataS, dataP);
  }

  const existingSesionIds = new Set(dataS.map(r => r.id));
  const existingPartIds = new Set(dataP.map(r => r.id));
  const missingSesiones = SESIONES_SEED.filter(s => !existingSesionIds.has(s.id));
  const missingParticipantes = PARTICIPANTES_SEED.filter(p => !existingPartIds.has(p.id));

  if (missingSesiones.length || missingParticipantes.length) {
    await seedRemote(missingSesiones, missingParticipantes);
  }
  await markSeedComplete();
  return joinToFlat([...dataS, ...missingSesiones], [...dataP, ...missingParticipantes]);
}

export async function saveDirty(sesionRows: SesionDb[], participanteRows: ParticipanteDb[]): Promise<void> {
  if (sesionRows.length) await upsertSesionesRemote(sesionRows);
  if (participanteRows.length) await upsertParticipantesRemote(participanteRows);
}

export async function deleteParticipantesRemote(ids: number[]): Promise<boolean> {
  if (!supabaseClient || !ids.length) return true;
  try {
    const { error } = await supabaseClient.from('sesion_participantes').delete().in('id', ids);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('No se pudo borrar participantes:', describeSupabaseError(e));
    return false;
  }
}
export async function deleteSesionesRemote(ids: number[]): Promise<boolean> {
  if (!supabaseClient || !ids.length) return true;
  try {
    const { error } = await supabaseClient.from('sesiones').delete().in('id', ids);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('No se pudo borrar la sesión:', describeSupabaseError(e));
    return false;
  }
}

export function buildSesionDbRowFromState(registro: RegistroRow[], sesionId: number): SesionDb | null {
  const row = registro.find(r => r._sesionId === sesionId);
  if (!row) return null;
  return sesionToDbRow(row);
}

export function nextParticipanteId(registro: RegistroRow[]): number {
  return registro.reduce((m, r) => Math.max(m, r.id || 0), 0) + 1;
}
export function nextSesionId(registro: RegistroRow[]): number {
  return registro.reduce((m, r) => Math.max(m, r._sesionId || 0), 0) + 1;
}

/**
 * Pide a la base el siguiente id libre de cada tabla.
 *
 * Antes los ids de filas nuevas se calculaban con el máximo de lo que había
 * cargado en memoria. Si por cualquier motivo la memoria no tenía todas las filas
 * (otra persona creó algo desde otra pestaña, una carga que no terminó, etc.), el
 * id calculado ya existía en la base y el "upsert" SOBRESCRIBÍA esa fila en vez de
 * crear una nueva: la persona que ya estaba ahí desaparecía y se movía a la sesión
 * nueva. Se veía exactamente como "la sesión no se guardó".
 *
 * Consultar el máximo real de la base evita ese choque por completo.
 */
export async function nextIdsFromDb(): Promise<{ sesion: number; participante: number }> {
  if (!supabaseClient) return { sesion: 0, participante: 0 };
  try {
    const [s, p] = await Promise.all([
      supabaseClient.from('sesiones').select('id').order('id', { ascending: false }).limit(1),
      supabaseClient.from('sesion_participantes').select('id').order('id', { ascending: false }).limit(1),
    ]);
    const maxS = !s.error && s.data?.length ? (s.data[0] as { id: number }).id : 0;
    const maxP = !p.error && p.data?.length ? (p.data[0] as { id: number }).id : 0;
    return { sesion: maxS + 1, participante: maxP + 1 };
  } catch (e) {
    console.error('No se pudo consultar el último id, se usará el local:', describeSupabaseError(e));
    return { sesion: 0, participante: 0 };
  }
}