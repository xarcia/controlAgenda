import { useCallback, useMemo, useState } from 'react';
import type { Sesion, ConflictItem, RegistroRow, Sala, UsuarioSap, RolLiberado } from '../../types/domain';
import { buildRolesResolver } from '../../lib/rolesLookup';
import { FilterCombo } from '../../components/shared/FilterCombo';
import { DateCalendar } from '../../components/shared/DateCalendar';
import { DateOverview } from '../../components/shared/DateOverview';

/* Misma paleta que el Gantt, para que un módulo tenga el mismo color en toda la app. */
const PALETTE = ['#4C8DFF', '#F2A93B', '#3FB27F', '#A78BFA', '#22D3EE', '#38BDF8', '#F472B6', '#FBBF24', '#34D399', '#FB923C', '#818CF8', '#2DD4BF', '#94A3B8', '#C084FC', '#4ADE80', '#FCD34D'];
const moduloColorMap = new Map<string, string>();
function moduloColor(mod: string | null): string {
  const key = mod || '—';
  if (!moduloColorMap.has(key)) moduloColorMap.set(key, PALETTE[moduloColorMap.size % PALETTE.length]);
  return moduloColorMap.get(key)!;
}
import { uniqueSorted, uniqueSortedOpciones, computeModalidad, shortConflictText, minToTime } from '../../lib/conflictEngine';
import { fmtFechaLarga } from '../../lib/format';

interface Props {
  registro: RegistroRow[];
  sessions: Sesion[];
  conflicts: ConflictItem[];
  conflictsBySession: Map<string, ConflictItem[]>;
  fechas: string[];
  salas: Sala[];
  usuariosSap: UsuarioSap[];
  rolesLiberados: RolLiberado[];
  canEdit: boolean;
  /** false en el perfil "visualizador 2": oculta ID Cap. y User liberado */
  verRolesSap: boolean;
  onFieldChange: (id: number, field: keyof RegistroRow, value: string) => void;
  onDeleteAttendee: (id: number) => void;
  onSalaChange: (sessionId: string, sala: string) => void;
  onOpenSession: (sessionId: string | 'new') => void;
}

function salaOptions(current: string | null, localidad: string | null, salas: Sala[]) {
  let opts = salas.filter(s => !localidad || s.localidad === localidad || !s.localidad);
  if (!opts.length) opts = salas;
  const names = uniqueSorted(['POR CONFIRMAR', ...opts.map(s => s.nombre), current || '']);
  return names;
}

export function AgendaReunionTab({
  registro, sessions, conflicts, conflictsBySession, fechas, salas, usuariosSap, rolesLiberados, canEdit, verRolesSap,
  onFieldChange, onDeleteAttendee, onSalaChange, onOpenSession,
}: Props) {
  /* Por defecto NO se fija ningún día: se arranca en "Todas las fechas" para que
     los demás filtros (tema, capacitador, usuario) busquen en todo el calendario
     y no queden atados al primer día. */
  const [fecha, setFecha] = useState<string>('');
  const [onlyConflicts, setOnlyConflicts] = useState(false);
  const [modulo, setModulo] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [estado, setEstado] = useState('');
  const [temaSearch, setTemaSearch] = useState('');
  const [capacitadorF, setCapacitadorF] = useState('');
  const [participanteF, setParticipanteF] = useState('');
  // Días desplegados cuando se ven "todas las fechas". Por defecto todo viene
  // plegado: mostrar las 22 fechas completas de golpe generaba una página
  // enorme (más de 3.000 filas) y muy lenta de recorrer.

  // fecha === '' significa "todas las fechas": el alcance pasa a ser todo el
  // calendario. Así se puede dejar la fecha en "todas" y escribir un tema para
  // ver ese tema en TODAS las fechas donde exista.
  const todasLasFechas = fecha === '';
  const fechaActual = todasLasFechas ? '' : (fechas.includes(fecha) ? fecha : (fechas[0] || ''));

  // Sesiones dentro del alcance de fecha (un día concreto, o todas).
  const sessionsScope = useMemo(
    () => todasLasFechas ? sessions : sessions.filter(s => s.fecha === fechaActual),
    [sessions, todasLasFechas, fechaActual]
  );

  // Opciones de los desplegables: siempre calculadas sobre el alcance actual,
  // así el desplegable de Tema ofrece exactamente los temas que se ven.
  const modulosHoy = useMemo(() => uniqueSortedOpciones(sessionsScope.map(s => s.modulo)), [sessionsScope]);
  const localidadesHoy = useMemo(() => uniqueSortedOpciones(sessionsScope.map(s => s.localidad)), [sessionsScope]);
  const estadosHoy = useMemo(() => uniqueSortedOpciones(sessionsScope.map(s => s.estado)), [sessionsScope]);

  const temaFiltro = temaSearch.trim().toUpperCase();
  const hayFiltros = [temaSearch, modulo, localidad, estado, capacitadorF, participanteF].filter(Boolean).length
    + (onlyConflicts ? 1 : 0);


  /* Cada filtro es un predicado independiente. Así se pueden combinar todos entre
     sí, y además calcular las opciones de cada desplegable aplicando TODOS los
     demás filtros menos el propio (comportamiento en cascada: al elegir un módulo,
     el desplegable de capacitador solo ofrece los de ese módulo, y así). */
  const pTema = useCallback((s: Sesion) => !temaFiltro || (s.tema || '').toUpperCase().includes(temaFiltro), [temaFiltro]);
  const pModulo = useCallback((s: Sesion) => !modulo || s.modulo === modulo, [modulo]);
  const pLocalidad = useCallback((s: Sesion) => !localidad || s.localidad === localidad, [localidad]);
  const pEstado = useCallback((s: Sesion) => !estado || s.estado === estado, [estado]);
  const pConflictos = useCallback((s: Sesion) => !onlyConflicts || conflictsBySession.has(s.sessionId), [onlyConflicts, conflictsBySession]);
  // El campo capacitador puede traer VARIOS nombres separados por " / ", por eso
  // se compara contra cada uno por separado y no con el texto completo.
  const pCapacitador = useCallback((s: Sesion) => !capacitadorF ||
    (s.capacitador || '').split('/').map(x => x.trim()).some(x => x === capacitadorF), [capacitadorF]);
  const pParticipante = useCallback((s: Sesion) => !participanteF ||
    s.attendees.some(a => a.nombre === participanteF), [participanteF]);

  const matchesFilters = useCallback((s: Sesion) => (
    pConflictos(s) && pModulo(s) && pLocalidad(s) && pEstado(s) && pTema(s) && pCapacitador(s) && pParticipante(s)
  ), [pConflictos, pModulo, pLocalidad, pEstado, pTema, pCapacitador, pParticipante]);
  /* Cuántas sesiones tiene cada fecha, para pintar el calendario. Se calcula
     con los demás filtros aplicados, así el calendario refleja lo que se vería
     al elegir cada día (si filtras por un capacitador, el calendario muestra
     solo los días en que ese capacitador tiene sesiones). */
  const conteoPorFecha = useMemo(() => {
    const m = new Map<string, number>();
    sessions
      .filter(s => s.fecha && pConflictos(s) && pModulo(s) && pLocalidad(s) && pEstado(s) && pTema(s) && pCapacitador(s) && pParticipante(s))
      .forEach(s => m.set(s.fecha!, (m.get(s.fecha!) || 0) + 1));
    return m;
  }, [sessions, pConflictos, pModulo, pLocalidad, pEstado, pTema, pCapacitador, pParticipante]);

  /* Opciones de cada desplegable: se aplican todos los filtros MENOS el propio,
     para que las listas se vayan acotando entre ellas sin dejar al usuario
     atrapado (si se aplicara también el propio filtro, la lista se reduciría a
     un solo elemento y no se podría cambiar de selección). */
  const temasHoy = useMemo(() => uniqueSortedOpciones(
    sessionsScope.filter(s => pConflictos(s) && pModulo(s) && pLocalidad(s) && pEstado(s) && pCapacitador(s) && pParticipante(s)).map(s => s.tema)
  ), [sessionsScope, pConflictos, pModulo, pLocalidad, pEstado, pCapacitador, pParticipante]);

  const capacitadoresHoy = useMemo(() => uniqueSortedOpciones(
    sessionsScope
      .filter(s => pConflictos(s) && pModulo(s) && pLocalidad(s) && pEstado(s) && pTema(s) && pParticipante(s))
      .flatMap(s => (s.capacitador || '').split('/').map(x => x.trim()))
  ), [sessionsScope, pConflictos, pModulo, pLocalidad, pEstado, pTema, pParticipante]);

  const participantesHoy = useMemo(() => uniqueSortedOpciones(
    sessionsScope
      .filter(s => pConflictos(s) && pModulo(s) && pLocalidad(s) && pEstado(s) && pTema(s) && pCapacitador(s))
      .flatMap(s => s.attendees.map(a => a.nombre))
  ), [sessionsScope, pConflictos, pModulo, pLocalidad, pEstado, pTema, pCapacitador]);

  // Sesiones que finalmente se muestran, y las fechas que hay que dibujar.
  const sessionsShown = useMemo(() => sessionsScope.filter(matchesFilters), [sessionsScope, matchesFilters]);
  const fechasARenderizar = useMemo(() => {
    if (!todasLasFechas) return [fechaActual];
    return uniqueSorted(sessionsShown.map(s => s.fecha));
  }, [todasLasFechas, fechaActual, sessionsShown]);

  // Estadísticas del alcance visible
  /* Con "Todas las fechas" y muchos resultados no se dibuja la tabla completa
     (serían miles de filas): se muestra un resumen en tarjetas, una por fecha.
     Si al filtrar el resultado ya es pequeño, se pasa directo a la tabla, que es
     lo que realmente se quiere ver en ese momento. */
  const RESUMEN_LIMITE = 25;
  const mostrarResumen = todasLasFechas && sessionsShown.length > RESUMEN_LIMITE;

  /** Agrupa por capacitador las sesiones de un día concreto ya filtradas. */
  const buildGroups = useCallback((fechaDia: string) => {
    const delDia = sessionsScope.filter(s => s.fecha === fechaDia);
    const caps = uniqueSorted(delDia.map(s => s.capacitador));
    return caps.map(cap => {
      const sessAll = delDia.filter(s => s.capacitador === cap).sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
      const sessShown = sessAll.filter(matchesFilters);
      const ref = sessShown.length ? sessShown : sessAll;
      const minH = Math.min(...ref.map(s => s.horaMin ?? 9999));
      return { cap, sessAll, sessShown, minH };
    }).filter(g => g.sessShown.length > 0).sort((a, b) => a.minH - b.minH);
  }, [sessionsScope, matchesFilters]);

  // Cruce nombre -> ID de usuario SAP -> ¿rol liberado? Memoizado porque construye
  // un índice sobre los 654 usuarios de DEV110 y no debe rehacerse en cada render.
  const resolveRol = useMemo(
    () => buildRolesResolver(usuariosSap, rolesLiberados),
    [usuariosSap, rolesLiberados]
  );

  return (
    <section className="tab-panel active">
      {/* Barra de filtros unificada: todos los filtros son del mismo tipo de control
          (FilterCombo: buscador + lista) y del mismo tamaño, en una cuadrícula que
          se reacomoda sola. Antes cada filtro era un control distinto y de ancho
          distinto, y quedaban desalineados. */}
      <div className="filtros-barra">
        <div className="filtros-grid">
          <DateCalendar value={fechaActual} conteoPorFecha={conteoPorFecha} onChange={setFecha} />
          <FilterCombo label="Tema" value={temaSearch} options={temasHoy} onChange={setTemaSearch}
            allLabel="Todos los temas" span={2} />
          <FilterCombo label="Capacitador" value={capacitadorF} options={capacitadoresHoy} onChange={setCapacitadorF}
            allLabel="Todos los capacitadores" span={2} />
          <FilterCombo label="Usuario a capacitar" value={participanteF} options={participantesHoy} onChange={setParticipanteF}
            allLabel="Todos los usuarios" span={2} />
          <FilterCombo label="Módulo" value={modulo} options={modulosHoy} onChange={setModulo}
            allLabel="Todos" />
          <FilterCombo label="Localidad" value={localidad} options={localidadesHoy} onChange={setLocalidad}
            allLabel="Todas" />
          {canEdit && (
            <FilterCombo label="Estado" value={estado} options={estadosHoy} onChange={setEstado}
              allLabel="Todos" />
          )}
        </div>

        <div className="filtros-pie">
          <span className="filtros-resumen">
            {todasLasFechas
              ? `${sessionsShown.length} sesión(es) en ${fechasARenderizar.length} fecha(s)`
              : `${sessionsShown.length} sesión(es) este día`}
            {hayFiltros > 0 && ` · ${hayFiltros} filtro(s) activo(s)`}
          </span>
          <div className="filtros-acciones">
            {canEdit && (
              <button className={`btn btn-ghost btn-sm btn-incidencias ${onlyConflicts ? 'active' : ''}`} onClick={() => setOnlyConflicts(v => !v)}>
                ⚠ Solo incidencias
              </button>
            )}
            <button className="btn btn-ghost btn-sm" title="Quitar todos los filtros" disabled={!hayFiltros}
              onClick={() => { setTemaSearch(''); setModulo(''); setLocalidad(''); setEstado(''); setCapacitadorF(''); setParticipanteF(''); setOnlyConflicts(false); }}>
              ✕ Limpiar filtros
            </button>
            {canEdit && <button className="btn btn-amber btn-sm" onClick={() => onOpenSession('new')}>+ Nueva sesión</button>}
          </div>
        </div>
      </div>

      <>
          {mostrarResumen ? (
            <DateOverview sessions={sessionsShown} conflicts={conflicts} moduloColor={moduloColor}
              hint="Elige una fecha para ver el detalle, o afina los filtros para verlo todo aquí mismo"
              onPickFecha={f => setFecha(f)} />
          ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Grp.</th><th>Horario</th><th>Mód.</th><th>Capacitador · Tema · Asistente</th>
                  {verRolesSap && <><th className="th-idcap">ID Cap.</th><th className="th-liberado">User liberado</th></>}
                  <th>Pers.</th><th>Localidad</th><th>Modalidad</th><th>Lugar</th><th className="th-sala">Sala específica</th><th>Alertas</th>
                </tr>
              </thead>
              <tbody>
                {!sessionsShown.length && (
                  <tr><td colSpan={verRolesSap ? 12 : 10} className="empty-state">
                    Sin sesiones que coincidan con estos filtros{todasLasFechas ? ' en ninguna fecha' : ' para esta fecha'}.
                  </td></tr>
                )}
                {fechasARenderizar.map(fechaDia => {
                  const grupos = buildGroups(fechaDia);
                  if (!grupos.length) return null;
                  return (
                  <>
                  {/* Separador por día cuando se ven varias fechas seguidas. */}
                  {todasLasFechas && (
                    <tr key={`d-${fechaDia}`} className="arow-fecha">
                      <td colSpan={verRolesSap ? 12 : 10}>
                        {fmtFechaLarga(fechaDia)}
                        <span className="af-meta">
                          {grupos.length} grupo(s) · {grupos.reduce((n, g) => n + g.sessShown.length, 0)} sesión(es)
                        </span>
                      </td>
                    </tr>
                  )}
                  {grupos.map((g, gi) => {
                  const maxH = Math.max(...g.sessAll.map(s => s.horaFinMin ?? 0));
                  const minH = Math.min(...g.sessAll.map(s => s.horaMin ?? 9999));
                  const nPers = new Set(g.sessAll.flatMap(s => s.attendees.map(a => a.codigo))).size;
                  const allAtt = g.sessAll.flatMap(s => s.attendees);
                  const modal = computeModalidad(allAtt, g.sessAll[0]?.modalidad);
                  const mods = uniqueSorted(g.sessAll.map(s => s.modulo)).join('/');
                  const groupConflict = g.sessAll.some(s => conflictsBySession.has(s.sessionId));
                  return (
                    <>
                      <tr key={`g-${gi}`} className={`arow-grupo ${groupConflict ? 'has-conflict' : ''}`}>
                        <td className="mono">{gi + 1}</td>
                        <td className="mono">{minToTime(minH)} - {minToTime(maxH)}</td>
                        <td>{mods}</td>
                        <td className="acap-cell">{g.cap || 'Sin capacitador asignado'}</td>
                        {verRolesSap && (() => { const r = resolveRol(g.cap); return (<>
                          <td className="mono cell-idcap">{r.idUsuario || '—'}</td>
                          <td><span className={`lib-chip lib-${r.estado === 'SI' ? 'si' : r.estado === 'NO' ? 'no' : 'nr'}`}>{r.estado}</span></td>
                        </>); })()}
                        {/* La fila del grupo (oscura) es solo un encabezado del capacitador.
                            Para el visualizador se deja limpia: personas, localidad, modalidad
                            y lugar ya se ven en la fila del tema, que es donde está el detalle. */}
                        {canEdit ? (<>
                          <td className="mono">{nPers}</td>
                          <td>{g.sessAll[0]?.localidad || '—'}</td>
                          <td className="amodal-cell">{modal}</td>
                          <td>{g.sessAll[0]?.lugar || '—'}</td>
                        </>) : (<>
                          <td></td><td></td><td></td><td></td>
                        </>)}
                        <td></td>
                        <td>{canEdit && groupConflict && <span className="chip-conflict">⚠ con cruces</span>}</td>
                      </tr>
                      {g.sessShown.map(s => {
                        const tramoNum = g.sessAll.indexOf(s) + 1;
                        const cs = conflictsBySession.get(s.sessionId) || [];
                        const tramoModal = computeModalidad(s.attendees, s.modalidad);
                        return (
                          <>
                            <tr key={s.sessionId} className={`arow-tramo ${cs.length ? 'has-conflict' : ''}`}>
                              <td></td>
                              <td className="mono">{s.hora} - {s.horaFin}</td>
                              <td>{s.modulo || '—'}</td>
                              <td className="atema-cell" title={`Doble clic para ${canEdit ? 'editar' : 'ver'} esta sesión`} onDoubleClick={() => onOpenSession(s.sessionId)}>
                                {tramoNum}) {s.tema}
                                {cs.map((c, ci) => (
                                  <div key={ci} className="tramo-warn" title={c.detail}>⚠ {shortConflictText(c, s.sessionId, sessions)}</div>
                                ))}
                              </td>
                              {verRolesSap && <><td></td><td></td></>}
                              <td className="mono">{s.attendees.length}</td>
                              <td>{s.localidad || '—'}</td>
                              <td>{tramoModal}</td>
                              <td>{s.lugar || '—'}</td>
                              <td>
                                <select className="cell-input cell-sala sala-quick" disabled={!canEdit} value={s.sala || 'POR CONFIRMAR'}
                                  onChange={e => onSalaChange(s.sessionId, e.target.value)}>
                                  {salaOptions(s.sala, s.localidad, salas).map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                              </td>
                              <td>{cs.length ? <span className="chip-conflict">⚠ {cs.length}</span> : <span className="mono" style={{ color: 'var(--green)' }}>OK</span>}</td>
                            </tr>
                            {s.attendees.map(att => {
                              const attRow = registro.find(r => r.id === att.id);
                              const attConflict = attRow ? conflictsBySession.has(s.sessionId) && conflicts.some(c => c.type === 'persona_choque' && c.codigo === att.codigo) : false;
                              return (
                                <tr key={att.id} className={`arow-persona ${attConflict ? 'has-conflict' : ''}`}>
                                  <td></td><td></td><td></td>
                                  <td className="apersona-cell">
                                    <div className="persona-name-wrap">
                                      • <input className="cell-input" disabled={!canEdit} defaultValue={att.nombre || ''}
                                        onBlur={e => e.target.value !== att.nombre && onFieldChange(att.id, 'nombre', e.target.value)} />
                                    </div>
                                  </td>
                                  {verRolesSap && (() => { const r = resolveRol(att.nombre); return (<>
                                    <td className="mono cell-idcap">{r.idUsuario || '—'}</td>
                                    <td><span className={`lib-chip lib-${r.estado === 'SI' ? 'si' : r.estado === 'NO' ? 'no' : 'nr'}`}>{r.estado}</span></td>
                                  </>); })()}
                                  <td></td>
                                  {/* En el perfil de solo lectura la localidad se muestra
                                      únicamente a nivel de tema/tramo, no repetida en cada
                                      persona — así la tabla queda mucho más limpia de leer. */}
                                  {canEdit ? (
                                    <td><input className="cell-input" defaultValue={att.localidad || ''}
                                      onBlur={e => e.target.value !== att.localidad && onFieldChange(att.id, 'localidad', e.target.value)} /></td>
                                  ) : (
                                    <td></td>
                                  )}
                                  {/* Igual que Localidad: en solo lectura la modalidad se
                                      muestra únicamente a nivel de tema/tramo. */}
                                  {canEdit ? (
                                    <td>
                                      <select className="cell-input" defaultValue={att.modalidad || 'PRESENCIAL'}
                                        onChange={e => onFieldChange(att.id, 'modalidad', e.target.value)}>
                                        <option value="PRESENCIAL">PRESENCIAL</option>
                                        <option value="VIRTUAL">VIRTUAL</option>
                                        <option value="POR CONFIRMAR">POR CONFIRMAR</option>
                                      </select>
                                    </td>
                                  ) : (
                                    <td></td>
                                  )}
                                  <td></td><td></td>
                                  <td className="row-actions">
                                    {canEdit && <button className="icon-btn" title="Quitar de esta sesión" onClick={() => onDeleteAttendee(att.id)}>✕</button>}
                                  </td>
                                </tr>
                              );
                            })}
                          </>
                        );
                      })}
                    </>
                  );
                  })}
                  </>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
      </>
    </section>
  );
}
