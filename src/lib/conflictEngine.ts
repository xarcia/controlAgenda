import type { RegistroRow, Sesion, ConflictItem, Attendee, Sala } from '../types/domain';

export function timeToMin(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function overlaps(aStart: number | null, aEnd: number | null, bStart: number | null, bEnd: number | null): boolean {
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return false;
  return aStart < bEnd && bStart < aEnd;
}

export function uniqueSorted(arr: (string | null | undefined)[]): string[] {
  return Array.from(new Set(arr.filter((v): v is string => !!v))).sort();
}

/** Un grupo/tramo es "HÍBRIDA" cuando mezcla asistentes presenciales y virtuales —
 *  cada persona conserva su propia modalidad, esto solo resume el conjunto. */
/**
 * Modalidad REAL de la reunión, según esta regla:
 *
 *   - Si el capacitador y TODOS los participantes coinciden -> esa modalidad
 *     (PRESENCIAL o VIRTUAL).
 *   - Si hay cualquier mezcla -> HÍBRIDA. Da igual de qué lado venga: una sesión
 *     declarada presencial con participantes virtuales es híbrida, y una virtual
 *     con alguien presencial también.
 *
 * `modalidadCapacitador` es la modalidad con la que asiste quien dicta (el campo
 * de modalidad de la sesión). Se incluye a propósito en la comparación: antes solo
 * se miraban los participantes, así que una sesión presencial con todos los
 * asistentes virtuales se mostraba como "VIRTUAL" en vez de híbrida.
 */
export function computeModalidad(attendees: Attendee[], modalidadCapacitador?: string | null): string {
  const norm = (v: string | null | undefined) => (v || '').toUpperCase().trim();
  const esValida = (v: string) => v === 'PRESENCIAL' || v === 'VIRTUAL';

  const vals = new Set<string>();
  const cap = norm(modalidadCapacitador);
  if (esValida(cap)) vals.add(cap);
  for (const a of attendees) {
    const v = norm(a.modalidad);
    if (esValida(v)) vals.add(v);
  }

  if (vals.size > 1) return 'HÍBRIDA';
  if (vals.size === 1) return [...vals][0];
  // Nadie tiene una modalidad clara (ej. "POR CONFIRMAR"): se muestra tal cual.
  return cap || norm(attendees[0]?.modalidad) || '—';
}

export function computeRowSessionId(row: RegistroRow): string {
  return [row.capacitador, row.modulo, row.tema, row.fecha, row.hora, row.horaFin, row.lugar].join('§');
}

export function buildSessions(registro: RegistroRow[]): Sesion[] {
  const map = new Map<string, Sesion>();
  for (const row of registro) {
    const key = computeRowSessionId(row);
    if (!map.has(key)) {
      map.set(key, {
        sessionId: key,
        _sesionId: row._sesionId,
        capacitador: row.capacitador, modulo: row.modulo, tema: row.tema,
        fecha: row.fecha, hora: row.hora, horaFin: row.horaFin,
        horaMin: timeToMin(row.hora), horaFinMin: timeToMin(row.horaFin),
        lugar: row.lugar, localidad: row.localidad,
        // Modalidad del capacitador; si la columna aún no existe se usa la del
        // participante para no cambiar el comportamiento anterior.
        modalidad: row.modalidadSesion ?? row.modalidad,
        sala: row.sala, estado: row.estado,
        requisitos: row.requisitos, observaciones: row.observaciones,
        attendees: [], rowIds: [],
      });
    }
    const s = map.get(key)!;
    s.attendees.push({ id: row.id, nombre: row.nombre, codigo: row.codigo, unidad: row.unidad, localidad: row.localidad, modalidad: row.modalidad });
    s.rowIds.push(row.id);
  }
  return Array.from(map.values());
}

export function computeConflicts(sessions: Sesion[], salas: Sala[] = []): ConflictItem[] {
  const conflicts: ConflictItem[] = [];
  const capacidadPorSala = new Map(salas.filter(s => s.capacidad != null).map(s => [s.nombre, s.capacidad as number]));
  const byFecha = new Map<string, Sesion[]>();
  for (const s of sessions) {
    if (!s.fecha) continue;
    if (!byFecha.has(s.fecha)) byFecha.set(s.fecha, []);
    byFecha.get(s.fecha)!.push(s);
  }

  for (const [fecha, list] of byFecha) {
    // capacitador en 2 lugares / solape
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (!a.capacitador || a.capacitador !== b.capacitador) continue;
        if (!overlaps(a.horaMin, a.horaFinMin, b.horaMin, b.horaFinMin)) continue;
        const sameLugar = a.lugar === b.lugar;
        conflicts.push({
          type: sameLugar ? 'capacitador_solape' : 'capacitador_2_lugares',
          severity: sameLugar ? 'medio' : 'critico',
          fecha, sessionIds: [a.sessionId, b.sessionId], capacitador: a.capacitador,
          label: sameLugar ? `${a.capacitador}: se solapa consigo mismo` : `${a.capacitador}: en 2 lugares a la vez`,
          detail: `"${a.tema}" (${a.hora}–${a.horaFin}) choca con "${b.tema}" (${b.hora}–${b.horaFin})`,
        });
      }
    }
    // persona citada 2 veces
    const porPersona = new Map<string, Sesion[]>();
    for (const s of list) {
      for (const att of s.attendees) {
        if (att.codigo == null) continue;
        const key = String(att.codigo);
        if (!porPersona.has(key)) porPersona.set(key, []);
        if (!porPersona.get(key)!.includes(s)) porPersona.get(key)!.push(s);
      }
    }
    for (const [codigo, sesionesPersona] of porPersona) {
      for (let i = 0; i < sesionesPersona.length; i++) {
        for (let j = i + 1; j < sesionesPersona.length; j++) {
          const a = sesionesPersona[i], b = sesionesPersona[j];
          if (!overlaps(a.horaMin, a.horaFinMin, b.horaMin, b.horaFinMin)) continue;
          const att = a.attendees.find(x => String(x.codigo) === codigo);
          conflicts.push({
            type: 'persona_choque', severity: 'critico', fecha,
            sessionIds: [a.sessionId, b.sessionId], nombre: att?.nombre, codigo: att?.codigo,
            label: `${att?.nombre}: 2 capacitaciones a la vez`,
            detail: `Persona citada a 2 capacitaciones: "${a.tema}" (${a.hora}–${a.horaFin}) con "${b.tema}" (${b.hora}–${b.horaFin})`,
          });
        }
      }
    }
    // sala doble reserva
    const porSala = new Map<string, Sesion[]>();
    for (const s of list) {
      if (!s.sala || s.sala === 'POR CONFIRMAR' || s.sala === 'VIRTUAL') continue;
      if (!porSala.has(s.sala)) porSala.set(s.sala, []);
      porSala.get(s.sala)!.push(s);
    }
    for (const [sala, sesionesSala] of porSala) {
      for (let i = 0; i < sesionesSala.length; i++) {
        for (let j = i + 1; j < sesionesSala.length; j++) {
          const a = sesionesSala[i], b = sesionesSala[j];
          if (!overlaps(a.horaMin, a.horaFinMin, b.horaMin, b.horaFinMin)) continue;
          conflicts.push({
            type: 'sala_doble', severity: 'critico', fecha,
            sessionIds: [a.sessionId, b.sessionId], sala,
            label: `Sala "${sala}": doble reserva`,
            detail: `"${a.tema}" (${a.hora}–${a.horaFin}) choca con "${b.tema}" (${b.hora}–${b.horaFin})`,
          });
        }
      }
    }
  }
  // capacidad de sala insuficiente (no depende de fecha compartida con otra sesión)
  for (const s of sessions) {
    if (!s.sala) continue;
    const cap = capacidadPorSala.get(s.sala);
    if (cap != null && s.attendees.length > cap) {
      conflicts.push({
        type: 'capacidad', severity: 'alto', fecha: s.fecha || '', sessionIds: [s.sessionId], sala: s.sala,
        label: `Sala "${s.sala}": capacidad insuficiente`,
        detail: `${s.sala}: capacidad ${cap}, asistentes ${s.attendees.length}`,
      });
    }
  }
  return conflicts;
}

export function shortConflictText(c: ConflictItem, currentSessionId: string, sessions: Sesion[]): string {
  const otherId = c.sessionIds.find(id => id !== currentSessionId) ?? c.sessionIds[0];
  const other = sessions.find(s => s.sessionId === otherId);
  const when = other ? `${other.hora}–${other.horaFin}` : '';
  const otherTema = other ? other.tema : '';
  switch (c.type) {
    case 'persona_choque': return `${c.nombre}: choca con "${otherTema}" (${when})`;
    case 'capacitador_2_lugares': return `También en "${otherTema}" (${when}${other ? ', ' + other.lugar : ''})`;
    case 'capacitador_solape': return `Solape con "${otherTema}" (${when})`;
    case 'sala_doble': return `Sala también reservada para "${otherTema}" (${when})`;
    case 'capacidad': return c.detail;
    default: return c.label;
  }
}

/* Valores que en los datos significan "nada" y por tanto no sirven como opción
   para elegir. Vienen de años de captura manual en Excel: cada persona escribió
   lo mismo a su manera. Se comparan normalizados (sin tildes, sin puntos, sin
   espacios de más) para atrapar todas las variantes de una sola vez.
   OJO: "POR CONFIRMAR" NO está en la lista, porque ahí sí es un estado real. */
const VALORES_VACIOS = new Set([
  '', '-', '--', '---', '.', '/', 'X', '0',
  'NA', 'N A', 'NAA', 'NO APLICA', 'NOAPLICA',
  'ND', 'N D', 'NINGUNO', 'NINGUNA', 'NINGUN',
  'SIN REQUISITOS', 'SIN REQUISITO', 'SIN DATO', 'SIN DATOS',
  'SIN ESPECIFICAR', 'NO DEFINIDO', 'POR DEFINIR', 'PENDIENTE DEFINIR',
  'NULL', 'NULO', 'VACIO', 'S/N', 'SN', 'NINGUNO.',
]);

/** ¿Este valor sirve como opción elegible por una persona? */
export function esValorUtil(v: string | null | undefined): boolean {
  if (!v) return false;
  const n = v
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.\-_/\\#]/g, ' ')    // N/A, N.A., N-A, #N/D -> "N A" / "N D"
    .replace(/\s+/g, ' ')
    .trim();
  if (!n) return false;
  if (VALORES_VACIOS.has(n)) return false;
  if (n.replace(/\s/g, '') === 'NA') return false;   // "N A", "N/A", "N.A."
  if (n.replace(/\s/g, '') === 'ND') return false;   // "#N/D" -> "N D"
  return true;
}

/** Como uniqueSorted, pero descartando los valores que no sirven para elegir. */
export function uniqueSortedOpciones(arr: (string | null | undefined)[]): string[] {
  return uniqueSorted(arr).filter(esValorUtil);
}