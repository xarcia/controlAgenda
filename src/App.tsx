import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAppData } from './hooks/useAppData';
import { useAuth } from './hooks/useAuth';
import { useToast, ToastProvider } from './hooks/useToast';
import { TopBar } from './components/shared/TopBar';
import { AuthGate } from './components/shared/AuthGate';
import { AgendaReunionTab } from './tabs/AgendaReunion/AgendaReunionTab';
import { SessionModal } from './tabs/AgendaReunion/SessionModal';
import { GanttTab } from './tabs/Gantt/GanttTab';
import { ReporteRoles } from './tabs/RolesSap/ReporteRoles';
import { supabaseClient } from './lib/supabaseClient';
import { deleteParticipantesRemote, describeSupabaseError, nextIdsFromDb } from './lib/persistence';
import { computeRowSessionId, esValorUtil } from './lib/conflictEngine';
import type { RegistroRow, Empleado, UsuarioSap, RolLiberado } from './types/domain';
import empleadosJson from './data/empleados.json';
import usuariosSapJson from './data/usuariosSap.json';
import rolesLiberadosJson from './data/rolesLiberados.json';
import './App.css';

const EMPLEADOS = empleadosJson as Empleado[];
const USUARIOS_SAP_SEED = usuariosSapJson as UsuarioSap[];
const ROLES_LIBERADOS_SEED = rolesLiberadosJson as RolLiberado[];

function AppInner() {
  const data = useAppData();
  const auth = useAuth();
  const toast = useToast();

  /* Cada pestaña tiene su propia dirección (#/agenda, #/gantt). Así se puede
     compartir el enlace, usar atrás/adelante del navegador y volver a la pestaña
     donde estabas — todo SIN recargar la app (no se vuelve a pedir Supabase). */
  const tabDesdeUrl = (): 'agenda' | 'gantt' =>
    window.location.hash.replace(/^#\/?/, '').toLowerCase().startsWith('gantt') ? 'gantt' : 'agenda';
  const [activeTab, setActiveTabState] = useState<'agenda' | 'gantt'>(tabDesdeUrl);

  const setActiveTab = useCallback((t: 'agenda' | 'gantt') => {
    setActiveTabState(t);
    const nuevo = `#/${t}`;
    if (window.location.hash !== nuevo) window.history.pushState(null, '', nuevo);
  }, []);

  // Botones atrás/adelante del navegador (y cambios de dirección escritos a mano)
  const necesitaLoginRef = useRef(false);
  necesitaLoginRef.current = auth.needsGate;

  useEffect(() => {
    const onPop = () => {
      // Si ya hay sesión y la dirección apunta al login, se corrige sola: quedarse
      // en #/login con la sesión abierta dejaría la URL diciendo algo que no es.
      if (window.location.hash.toLowerCase().startsWith('#/login') && !necesitaLoginRef.current) {
        window.history.replaceState(null, '', '#/agenda');
        setActiveTabState('agenda');
        return;
      }
      setActiveTabState(tabDesdeUrl());
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('hashchange', onPop); };
  }, []);

  /* El acceso tiene su propia dirección: #/login.
     - Si hace falta iniciar sesión, la URL pasa a #/login (con replace, para que
       "atrás" no devuelva a una pantalla que no se puede ver sin sesión).
     - Al entrar, se vuelve a la pestaña que se estaba pidiendo; si se llegó
       directo a #/login, se va a #/agenda.
     - Con sesión abierta, #/login redirige solo a la pestaña actual: no tiene
       sentido quedarse en una pantalla de acceso ya superada. */
  const rutaPrevia = useRef<string>('#/agenda');

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, '', '#/agenda');
  }, []);

  /* El visualizador 2 solo tiene Gantt: si intenta llegar a la agenda (por enlace
     antiguo o escribiendo la dirección), se le redirige. */
  useEffect(() => {
    if (!auth.verAgenda && activeTab === 'agenda') {
      window.history.replaceState(null, '', '#/gantt');
      setActiveTabState('gantt');
    }
  }, [auth.verAgenda, activeTab]);

  useEffect(() => {
    if (auth.resolving) return;
    const hash = window.location.hash.toLowerCase();
    const enLogin = hash.startsWith('#/login');

    if (auth.needsGate) {
      if (!enLogin) {
        // Se recuerda a dónde quería ir para volver ahí tras iniciar sesión.
        rutaPrevia.current = window.location.hash || '#/agenda';
        window.history.replaceState(null, '', '#/login');
      }
    } else if (enLogin) {
      let destino = rutaPrevia.current.startsWith('#/login') ? '#/agenda' : rutaPrevia.current;
      if (!auth.verAgenda) destino = '#/gantt';
      window.history.replaceState(null, '', destino);
      setActiveTabState(destino.toLowerCase().includes('gantt') ? 'gantt' : 'agenda');
    }
  }, [auth.needsGate, auth.resolving, auth.verAgenda]);
  const [modalSessionId, setModalSessionId] = useState<string | 'new' | null>(null);
  const [showReporte, setShowReporte] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [usuariosSap, setUsuariosSap] = useState<UsuarioSap[]>(USUARIOS_SAP_SEED);
  const [rolesLiberados, setRolesLiberados] = useState<RolLiberado[]>(ROLES_LIBERADOS_SEED);

  useEffect(() => {
    (async () => {
      if (!supabaseClient) return;
      try {
        const [selU, selR] = await Promise.all([
          supabaseClient.from('usuarios_sap').select('*'),
          supabaseClient.from('roles_liberados').select('*'),
        ]);
        if (!selU.error && selU.data?.length) setUsuariosSap(selU.data as UsuarioSap[]);
        if (!selR.error && selR.data?.length) setRolesLiberados(selR.data as RolLiberado[]);
      } catch (e) {
        console.error('No se pudo cargar usuarios_sap/roles_liberados:', describeSupabaseError(e));
      }
    })();
  }, []);

  const handleFieldChange = useCallback((id: number, field: keyof RegistroRow, value: string) => {
    data.updateParticipantField(id, field, value);
  }, [data]);

  const handleDeleteAttendee = useCallback(async (id: number) => {
    if (!confirm('¿Eliminar esta fila del Registro?')) return;
    const ok = await data.deleteRow(id);
    toast(ok ? 'Fila eliminada y confirmada' : 'No se pudo confirmar el borrado — revisa la conexión');
  }, [data, toast]);

  const handleSalaChange = useCallback((sessionId: string, sala: string) => {
    data.updateSessionSala(sessionId, sala);
    toast('Sala guardada y confirmada en Supabase');
  }, [data, toast]);


  /* Opciones de los desplegables del formulario, sacadas de los datos que ya
     existen: así se mantiene la consistencia (mismos nombres de módulo, misma
     escritura de las localidades) en vez de depender de que se teclee igual. */
  const modulosDisponibles = useMemo(
    () => Array.from(new Set(data.sessions.map(s => s.modulo).filter((v): v is string => esValorUtil(v)))).sort(),
    [data.sessions]
  );
  const localidadesDisponibles = useMemo(() => {
    const set = new Set<string>();
    data.registro.forEach(r => { if (esValorUtil(r.localidad)) set.add(r.localidad!); });
    EMPLEADOS.forEach(e => { if (esValorUtil(e.localidad)) set.add(e.localidad!); });
    return Array.from(set).sort();
  }, [data.registro]);
  const requisitosDisponibles = useMemo(
    () => Array.from(new Set(data.sessions.map(s => s.requisitos).filter((v): v is string => esValorUtil(v)))).sort(),
    [data.sessions]
  );

  const currentSession = modalSessionId && modalSessionId !== 'new' ? data.sessions.find(s => s.sessionId === modalSessionId) || null : null;

  async function handleSaveSession(fields: Record<string, string | null>, attendees: { id?: number; nombre: string; codigo: number | null; unidad: string | null; localidad?: string | null }[]) {
    const isNew = modalSessionId === 'new';
    try {
      // Los ids se piden a la BASE, no solo a la memoria: así nunca choca con una
      // fila existente (lo que antes sobrescribía a otro participante).
      const dbIds = await nextIdsFromDb();
      /* La modalidad del modal es la DEL CAPACITADOR: va a la sesión, no debe
         sobrescribir la de cada participante (si lo hiciera, nunca podría haber
         mezcla y la regla de híbrida no tendría sentido). */
      const modalidadCap = fields.modalidad ?? null;
      const camposSesion = { ...fields };
      delete camposSesion.modalidad;
      if (isNew) {
        const newSesionId = Math.max(data.nextSesionId(), dbIds.sesion);
        let pid = Math.max(data.nextParticipanteId(), dbIds.participante);
        const newRows: RegistroRow[] = (attendees.length ? attendees : [{ nombre: null as any, codigo: null, unidad: null, localidad: null }]).map(a => ({
          id: pid++, _sesionId: newSesionId,
          capacitador: fields.capacitador, modulo: fields.modulo, tema: fields.tema,
          nombre: a.nombre, codigo: a.codigo, unidad: a.unidad, localidad: a.localidad || fields.localidad,
          lugar: fields.lugar, modalidad: modalidadCap, fecha: fields.fecha, hora: fields.hora, horaFin: fields.horaFin,
          requisitos: fields.requisitos, observaciones: fields.observaciones, estado: fields.estado, sala: fields.sala,
          modalidadSesion: modalidadCap,
        }));
        data.setRegistro(prev => [...prev, ...newRows]);
        newRows.forEach(r => data.markDirty(r.id));
        data.markSesionDirty(newSesionId);
        // Solo se confirma si Supabase respondió bien. Si falla, se devuelve false:
        // el modal queda abierto con lo escrito y el banner rojo muestra el motivo.
        const ok = await data.persist();
        if (!ok) {
          toast('NO se pudo guardar la sesión. Revisa el mensaje rojo arriba — tus datos siguen aquí.');
          return false;
        }
        toast('Sesión creada y guardada');
      } else {
        const sessionId = modalSessionId as string;
        const originalRows = data.registro.filter(r => computeRowSessionId(r) === sessionId);
        const originalIds = new Set(originalRows.map(r => r.id));
        const existingSesionId = originalRows[0]?._sesionId ?? Math.max(data.nextSesionId(), dbIds.sesion);
        const keptIds = new Set(attendees.filter(a => a.id != null).map(a => a.id));
        const removedIds = [...originalIds].filter(id => !keptIds.has(id));

        let nextNewId = Math.max(data.nextParticipanteId(), dbIds.participante);
        const updatedRows: RegistroRow[] = [];
        const newRows: RegistroRow[] = [];
        for (const a of attendees) {
          if (a.id != null && originalIds.has(a.id)) {
            const row = data.registro.find(r => r.id === a.id);
            if (row) updatedRows.push({ ...row, ...camposSesion, modalidadSesion: modalidadCap, nombre: a.nombre, codigo: a.codigo, unidad: a.unidad, localidad: a.localidad || fields.localidad } as RegistroRow);
          } else {
            newRows.push({
              id: nextNewId++, _sesionId: existingSesionId,
              capacitador: fields.capacitador, modulo: fields.modulo, tema: fields.tema,
              nombre: a.nombre, codigo: a.codigo, unidad: a.unidad, localidad: a.localidad || fields.localidad,
              lugar: fields.lugar, modalidad: modalidadCap, fecha: fields.fecha, hora: fields.hora, horaFin: fields.horaFin,
              requisitos: fields.requisitos, observaciones: fields.observaciones, estado: fields.estado, sala: fields.sala,
              modalidadSesion: modalidadCap,
            });
          }
        }
        if (!attendees.length) {
          newRows.push({
            id: nextNewId++, _sesionId: existingSesionId,
            capacitador: fields.capacitador, modulo: fields.modulo, tema: fields.tema,
            nombre: null, codigo: null, unidad: null, localidad: fields.localidad,
            lugar: fields.lugar, modalidad: modalidadCap, fecha: fields.fecha, hora: fields.hora, horaFin: fields.horaFin,
            requisitos: fields.requisitos, observaciones: fields.observaciones, estado: fields.estado, sala: fields.sala,
            modalidadSesion: modalidadCap,
          });
        }

        data.setRegistro(prev => {
          const byId = new Map(prev.map(r => [r.id, r]));
          for (const r of updatedRows) byId.set(r.id, r);
          let out = prev.map(r => byId.get(r.id) || r).filter(r => !removedIds.includes(r.id));
          out = [...out, ...newRows];
          return out;
        });

        [...updatedRows, ...newRows].forEach(r => data.markDirty(r.id));
        data.markSesionDirty(existingSesionId);
        removedIds.forEach(id => data.unmarkDirty(id));
        if (removedIds.length) await deleteParticipantesRemote(removedIds);
        const ok = await data.persist();
        if (!ok) {
          toast('NO se pudieron guardar los cambios. Revisa el mensaje rojo arriba — tus datos siguen aquí.');
          return false;
        }
        toast('Cambios guardados y confirmados');
      }
      return true;
    } catch (e) {
      console.error('No se pudo guardar la sesión:', describeSupabaseError(e));
      toast('No se pudo confirmar el guardado — revisa la conexión e intenta de nuevo.');
      return false;
    }
  }

  async function handleDeleteSession() {
    if (!modalSessionId || modalSessionId === 'new') return false;
    const ok = await data.deleteSession(modalSessionId);
    toast(ok ? 'Sesión eliminada y confirmada' : 'No se pudo confirmar el borrado — revisa la conexión');
    return ok;
  }

  async function handleRefresh() {
    setRefreshing(true);
    await data.manualRefresh();
    setRefreshing(false);
    toast(`Actualizado desde Supabase — ${data.registro.length} filas.`);
  }

  if (auth.resolving || data.loading) {
    return <div className="boot-loading">Cargando…</div>;
  }
  if (auth.needsGate) {
    return <AuthGate onSubmit={auth.submitCode} />;
  }

  return (
    <div id="app">
      <TopBar
        activeTab={activeTab} onTabChange={setActiveTab}
        alertsCount={data.conflicts.length} role={auth.role} supabaseConfigured={auth.supabaseConfigured}
        saving={data.saving} lastSaveError={data.lastSaveError}
        canEdit={auth.canEdit} verAgenda={auth.verAgenda}
        onLogout={auth.logout} onOpenReporte={() => setShowReporte(true)}
        onRefresh={handleRefresh} refreshing={refreshing}
      />
      {data.lastSaveError && (
        <div className="save-error-banner">
          <span>⚠ No se pudo guardar en Supabase: <strong>{data.lastSaveError}</strong></span>
          <button onClick={() => data.setLastSaveError(null)}>Cerrar</button>
        </div>
      )}
      <main>
        {activeTab === 'agenda' ? (
          <AgendaReunionTab
            registro={data.registro} sessions={data.sessions} conflicts={data.conflicts}
            conflictsBySession={data.conflictsBySession} fechas={data.fechas} salas={data.LOOKUPS.salas}
            usuariosSap={usuariosSap} rolesLiberados={rolesLiberados}
            canEdit={auth.canEdit} verRolesSap={auth.verRolesSap}
            onFieldChange={handleFieldChange} onDeleteAttendee={handleDeleteAttendee}
            onSalaChange={handleSalaChange} onOpenSession={setModalSessionId}
          />
        ) : (
          <GanttTab sessions={data.sessions} conflicts={data.conflicts} fechas={data.fechas} onOpenSession={setModalSessionId} />
        )}
      </main>

      {modalSessionId && (
        <SessionModal
          sessionId={modalSessionId} session={currentSession} registro={data.registro}
          empleados={EMPLEADOS} salas={data.LOOKUPS.salas} capacitadoresDisponibles={data.LOOKUPS.usuarios}
          modulosDisponibles={modulosDisponibles} localidadesDisponibles={localidadesDisponibles}
          requisitosDisponibles={requisitosDisponibles} canEdit={auth.canEdit}
          defaultFecha={data.fechas[0] || ''}
          onClose={() => setModalSessionId(null)}
          onSave={handleSaveSession} onDeleteSession={handleDeleteSession}
        />
      )}
      {showReporte && (
        <ReporteRoles registro={data.registro} usuariosSap={usuariosSap} rolesLiberados={rolesLiberados} onClose={() => setShowReporte(false)} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
