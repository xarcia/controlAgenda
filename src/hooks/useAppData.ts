import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabaseClient } from '../lib/supabaseClient';
import {
  ensureSeededAndFetch, saveDirty, deleteParticipantesRemote, deleteSesionesRemote,
  buildSesionDbRowFromState, nextParticipanteId, nextSesionId, participanteToDbRow,
  describeSupabaseError, decodeSeed,
} from '../lib/persistence';
import { withTimeout } from '../lib/withTimeout';
import { buildSessions, computeConflicts, computeRowSessionId } from '../lib/conflictEngine';
import type { RegistroRow, Sesion, ConflictItem, Sala } from '../types/domain';
import lookupsJson from '../data/lookups.json';

const LOOKUPS = lookupsJson as { usuarios: { nombre: string; modulo: string | null; temas: string | null }[]; salas: Sala[] };

export type SyncMode = 'supabase' | 'local';

export function useAppData() {
  const [registro, setRegistroState] = useState<RegistroRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncMode, setSyncMode] = useState<SyncMode>('local');
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // registroRef siempre tiene el valor MÁS RECIENTE, sin depender del ciclo de
  // render de React. Esto evita un bug real: si persist() se llama justo después
  // de setRegistro(...) en la misma función, leer el "registro" del estado (closure)
  // todavía da el valor VIEJO en ese mismo instante — persist() guardaba lo de antes
  // del cambio, no lo que la persona acababa de editar.
  const registroRef = useRef<RegistroRow[]>([]);
  const setRegistro = (updater: RegistroRow[] | ((prev: RegistroRow[]) => RegistroRow[])) => {
    const next = typeof updater === 'function' ? (updater as (p: RegistroRow[]) => RegistroRow[])(registroRef.current) : updater;
    registroRef.current = next;
    setRegistroState(next);
  };

  const dirtyIds = useRef<Set<number>>(new Set());
  const dirtySesionIds = useRef<Set<number>>(new Set());
  const persistInFlight = useRef(false);
  const persistPending = useRef(false);

  // useMemo es CRÍTICO aquí: buildSessions recorre las 2.727 filas y computeConflicts
  // compara todas las sesiones entre sí (miles de comparaciones). Sin memoizar, esto
  // se recalculaba en CADA render — o sea, en cada tecla que se escribe en el buscador
  // de temas — y por eso la app se quedaba colgada al filtrar. Ahora solo se recalcula
  // cuando los datos realmente cambian.
  const sessions: Sesion[] = useMemo(() => buildSessions(registro), [registro]);
  const conflicts: ConflictItem[] = useMemo(() => computeConflicts(sessions, LOOKUPS.salas), [sessions]);
  const conflictsBySession = useMemo(() => {
    const map = new Map<string, ConflictItem[]>();
    for (const c of conflicts) {
      for (const sid of c.sessionIds) {
        if (!map.has(sid)) map.set(sid, []);
        map.get(sid)!.push(c);
      }
    }
    return map;
  }, [conflicts]);
  const fechas = useMemo(
    () => Array.from(new Set(registro.map(r => r.fecha).filter((f): f is string => !!f))).sort(),
    [registro]
  );

  const LOCAL_KEY = 'adelca_registro_v1';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Si Supabase no responde en 45s (red corporativa lenta, VPN, etc.), se cae al
      // respaldo local para que la app siga usable. 45s en vez de 12s: traer la
      // tabla completa son varias peticiones y en redes lentas 12s no alcanzaba.
      const rows = supabaseClient ? await withTimeout(ensureSeededAndFetch(), 45000, null) : decodeSeed();
      if (rows === null) {
        // OJO: NO se cargan los datos originales del Excel aquí. Hacerlo daba la
        // falsa impresión de que se habían perdido todas las ediciones. Se deja la
        // tabla vacía con un aviso claro para que la persona reintente.
        setSyncMode('local');
        setLastSaveError('Supabase no respondió a tiempo. NO se perdió nada: tus datos siguen en la nube. Revisa tu conexión y usa el botón "⟳ Actualizar" para reintentar.');
      } else {
        setRegistro(rows);
        setSyncMode(supabaseClient ? 'supabase' : 'local');
        setLastSaveError(null);
      }
      if (!supabaseClient) {
        // Sin Supabase: si ya había algo guardado en este navegador (localStorage),
        // se respeta eso en vez de la siembra original — para no perder ediciones
        // hechas en una sesión anterior en el mismo navegador.
        try {
          const saved = localStorage.getItem(LOCAL_KEY);
          if (saved) setRegistro(JSON.parse(saved));
        } catch { /* localStorage no disponible o corrupto: se ignora */ }
      }
    } catch (e) {
      console.error('No se pudo cargar desde Supabase:', describeSupabaseError(e));
      setRegistro(decodeSeed());
      setLastSaveError(describeSupabaseError(e));
      setSyncMode('local');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: cambios en sesiones o sesion_participantes hechos desde otra pestaña/persona.
  useEffect(() => {
    if (!supabaseClient) return;
    const chS = supabaseClient.channel('sesiones-changes').on(
      'postgres_changes', { event: '*', schema: 'public', table: 'sesiones' },
      (payload: any) => {
        setRegistro(prev => {
          if (payload.eventType === 'DELETE') {
            const id = payload.old?.id;
            return id == null ? prev : prev.filter(r => r._sesionId !== id);
          }
          const nr = payload.new;
          if (!nr) return prev;
          return prev.map(r => r._sesionId === nr.id ? {
            ...r, capacitador: nr.capacitador, modulo: nr.modulo, tema: nr.tema,
            fecha: nr.fecha, hora: nr.hora, horaFin: nr.hora_fin, lugar: nr.lugar,
            sala: nr.sala, estado: nr.estado, requisitos: nr.requisitos, observaciones: nr.observaciones,
          } : r);
        });
      }
    ).subscribe();

    const chP = supabaseClient.channel('participantes-changes').on(
      'postgres_changes', { event: '*', schema: 'public', table: 'sesion_participantes' },
      (payload: any) => {
        setRegistro(prev => {
          if (payload.eventType === 'DELETE') {
            const id = payload.old?.id;
            return id == null ? prev : prev.filter(r => r.id !== id);
          }
          const nr = payload.new;
          if (!nr) return prev;
          const idx = prev.findIndex(r => r.id === nr.id);
          if (idx === -1) {
            const sesionRow = prev.find(r => r._sesionId === nr.sesion_id);
            if (!sesionRow) return prev;
            return [...prev, {
              id: nr.id, _sesionId: nr.sesion_id,
              capacitador: sesionRow.capacitador, modulo: sesionRow.modulo, tema: sesionRow.tema,
              nombre: nr.nombre, codigo: nr.codigo, unidad: nr.unidad, localidad: nr.localidad,
              lugar: sesionRow.lugar, modalidad: nr.modalidad, fecha: sesionRow.fecha, hora: sesionRow.hora,
              horaFin: sesionRow.horaFin, requisitos: sesionRow.requisitos, observaciones: sesionRow.observaciones,
              estado: sesionRow.estado, sala: sesionRow.sala,
            }];
          }
          const copy = [...prev];
          copy[idx] = { ...copy[idx], nombre: nr.nombre, codigo: nr.codigo, unidad: nr.unidad, localidad: nr.localidad, modalidad: nr.modalidad };
          return copy;
        });
      }
    ).subscribe();

    return () => { chS.unsubscribe(); chP.unsubscribe(); };
  }, []);

  const persist = useCallback(async (): Promise<boolean> => {
    if (persistInFlight.current) { persistPending.current = true; return true; }
    persistInFlight.current = true;
    setSaving(true);
    let ok = true;
    const currentRegistro = registroRef.current;
    try {
      if (!supabaseClient) {
        // Sin Supabase configurado: se guarda en localStorage del navegador (funciona
        // de verdad en una app web normal, a diferencia del archivo HTML suelto de antes).
        try { localStorage.setItem(LOCAL_KEY, JSON.stringify(currentRegistro)); }
        catch (e) { console.error('No se pudo guardar en localStorage:', e); }
        dirtySesionIds.current.clear();
        dirtyIds.current.clear();
        setLastSaveError(null);
      } else {
        // IMPORTANTE: la lista de pendientes se limpia SOLO después de que el
        // guardado se confirma. Antes se limpiaba de entrada, así que si Supabase
        // fallaba, el cambio quedaba marcado como "ya guardado" y se perdía para
        // siempre, sin reintento — la app se veía bien pero la base nunca lo recibía.
        if (dirtySesionIds.current.size) {
          const ids = [...dirtySesionIds.current];
          const rows = ids.map(id => buildSesionDbRowFromState(currentRegistro, id)).filter((r): r is NonNullable<typeof r> => !!r);
          if (rows.length) await saveDirty(rows, []);
          ids.forEach(id => dirtySesionIds.current.delete(id));
        }
        if (dirtyIds.current.size) {
          const ids = [...dirtyIds.current];
          const rows = currentRegistro.filter(r => ids.includes(r.id)).map(participanteToDbRow);
          if (rows.length) await saveDirty([], rows);
          ids.forEach(id => dirtyIds.current.delete(id));
        }
        setLastSaveError(null);
      }
    } catch (e) {
      // Se marca el fallo Y se devuelve false, para que quien llamó (por ejemplo el
      // modal de sesión) NO dé por bueno el guardado. Antes se avisaba "guardado"
      // aunque hubiera fallado, y el cambio se perdía sin que nadie se enterara.
      console.error('No se pudo guardar:', describeSupabaseError(e));
      setLastSaveError(describeSupabaseError(e));
      ok = false;
    }
    setSaving(false);
    persistInFlight.current = false;
    if (persistPending.current) { persistPending.current = false; persist(); }
    return ok;
  }, []);

  const markDirty = (id: number) => dirtyIds.current.add(id);
  const unmarkDirty = (id: number) => dirtyIds.current.delete(id);
  const markSesionDirty = (id: number | null) => { if (id != null) dirtySesionIds.current.add(id); };

  /** Edita campos de una fila-participante puntual (nombre/localidad/modalidad). */
  const updateParticipantField = useCallback((id: number, field: keyof RegistroRow, value: string | null) => {
    setRegistro(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    markDirty(id);
    persist();
  }, [persist]);

  /** Cambia la sala de TODA una sesión (una sola fila en la tabla "sesiones"). */
  const updateSessionSala = useCallback((sessionId: string, sala: string) => {
    const found = sessions.find(s => s.sessionId === sessionId);
    const sesionId = found ? found._sesionId : null;
    setRegistro(prev => prev.map(r => computeRowSessionId(r) === sessionId ? { ...r, sala } : r));
    markSesionDirty(sesionId);
    persist();
  }, [persist, sessions]);

  const duplicateRow = useCallback((id: number) => {
    const row = registro.find(r => r.id === id);
    if (!row) return;
    const newId = nextParticipanteId(registro);
    const newRow = { ...row, id: newId };
    setRegistro(prev => {
      const idx = prev.findIndex(r => r.id === id);
      const copy = [...prev];
      copy.splice(idx + 1, 0, newRow);
      return copy;
    });
    markDirty(newId);
    persist();
  }, [registro, persist]);

  const deleteRow = useCallback(async (id: number) => {
    setRegistro(prev => prev.filter(r => r.id !== id));
    dirtyIds.current.delete(id);
    const ok = await deleteParticipantesRemote([id]);
    if (!ok) setLastSaveError('No se pudo confirmar el borrado');
    return ok;
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    const matching = registro.filter(r => computeRowSessionId(r) === sessionId);
    const removedIds = matching.map(r => r.id);
    const sesionId = matching[0]?._sesionId ?? null;
    setRegistro(prev => prev.filter(r => computeRowSessionId(r) !== sessionId));
    removedIds.forEach(id => dirtyIds.current.delete(id));
    if (sesionId != null) dirtySesionIds.current.delete(sesionId);
    const okP = await deleteParticipantesRemote(removedIds);
    const okS = sesionId != null ? await deleteSesionesRemote([sesionId]) : true;
    return okP && okS;
  }, [registro]);

  const manualRefresh = useCallback(async () => {
    await load();
  }, [load]);

  return {
    registro, setRegistro, sessions, conflicts, conflictsBySession, fechas,
    loading, saving, syncMode, lastSaveError, setLastSaveError, LOOKUPS,
    markDirty, markSesionDirty, unmarkDirty, persist,
    updateParticipantField, updateSessionSala, duplicateRow, deleteRow, deleteSession,
    manualRefresh, nextParticipanteId: () => nextParticipanteId(registro), nextSesionId: () => nextSesionId(registro),
  };
}