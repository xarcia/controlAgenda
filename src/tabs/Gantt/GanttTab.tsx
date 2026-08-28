import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Sesion, ConflictItem } from '../../types/domain';
import { uniqueSorted, uniqueSortedOpciones } from '../../lib/conflictEngine';
import { fmtFechaLarga } from '../../lib/format';
import { FilterCombo } from '../../components/shared/FilterCombo';
import { DateCalendar } from '../../components/shared/DateCalendar';
import { DateOverview } from '../../components/shared/DateOverview';

interface Props {
  sessions: Sesion[];
  conflicts: ConflictItem[];
  fechas: string[];
  onOpenSession: (sessionId: string) => void;
}

const PALETTE = ['#4C8DFF', '#F2A93B', '#3FB27F', '#A78BFA', '#22D3EE', '#38BDF8', '#F472B6', '#FBBF24', '#34D399', '#FB923C', '#818CF8', '#2DD4BF', '#94A3B8', '#C084FC', '#4ADE80', '#FCD34D'];
const moduloColorMap = new Map<string, string>();
function moduloColor(mod: string | null): string {
  const key = mod || '—';
  if (!moduloColorMap.has(key)) moduloColorMap.set(key, PALETTE[moduloColorMap.size % PALETTE.length]);
  return moduloColorMap.get(key)!;
}

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function startOfWeek(fecha: string): Date {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  dt.setDate(dt.getDate() + (dow === 0 ? -6 : 1 - dow));
  return dt;
}
function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function GanttTab({ sessions, conflicts, fechas, onOpenSession }: Props) {
  /* El Gantt guarda su estado EN LA DIRECCIÓN (#/gantt, #/gantt/FECHA,
     #/gantt/FECHA/semana). Así, al entrar a un día desde las tarjetas y pulsar
     "atrás", el navegador devuelve al resumen de tarjetas en vez de salirse de la
     app — que era lo que pasaba cuando el estado vivía solo en memoria. */
  const leerRuta = (): { fecha: string; view: 'dia' | 'semana' } => {
    const partes = window.location.hash.replace(/^#\/?/, '').split('/');  // ['gantt', fecha?, view?]
    const f = partes[1] && /^\d{4}-\d{2}-\d{2}$/.test(partes[1]) ? partes[1] : '';
    const v = partes[2] === 'semana' ? 'semana' : 'dia';
    return { fecha: f, view: v };
  };
  const [ruta, setRuta] = useState(leerRuta);
  const fecha = ruta.fecha;
  const view = ruta.view;

  const irA = useCallback((f: string, v: 'dia' | 'semana', reemplazar = false) => {
    const destino = f ? `#/gantt/${f}${v === 'semana' ? '/semana' : ''}` : '#/gantt';
    if (window.location.hash !== destino) {
      if (reemplazar) window.history.replaceState(null, '', destino);
      else window.history.pushState(null, '', destino);
    }
    setRuta({ fecha: f, view: v });
  }, []);

  const setFecha = useCallback((f: string) => irA(f, f ? view : 'dia'), [irA, view]);
  const setView = useCallback((v: 'dia' | 'semana') => irA(fecha, v, true), [irA, fecha]);

  // Atrás/adelante del navegador
  useEffect(() => {
    const onPop = () => setRuta(leerRuta());
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('hashchange', onPop); };
  }, []);

  const [lane, setLane] = useState<'sala' | 'capacitador'>('sala');
  const [semanaOffset, setSemanaOffset] = useState(0);

  // Los mismos filtros que en Agenda Reunión
  const [tema, setTema] = useState('');
  const [capacitadorF, setCapacitadorF] = useState('');
  const [participanteF, setParticipanteF] = useState('');
  const [modulo, setModulo] = useState('');
  const [localidad, setLocalidad] = useState('');

  // fecha === '' -> "Todas las fechas": el Gantt muestra el resumen del calendario,
  // desde donde se entra a un día concreto.
  const todasLasFechas = fecha === '';
  const fechaActual = todasLasFechas ? '' : (fechas.includes(fecha) ? fecha : (fechas[0] || ''));

  const conteoPorFecha = useMemo(() => {
    const m = new Map<string, number>();
    sessions.forEach(s => { if (s.fecha) m.set(s.fecha, (m.get(s.fecha) || 0) + 1); });
    return m;
  }, [sessions]);

  /* El alcance depende de la vista: en "día" es ese día; en "semana" son los 7
     días de la semana que contiene la fecha elegida. Los desplegables ofrecen
     opciones de ese alcance, no de todo el calendario. */
  const diasSemana = useMemo(() => {
    const base = fechaActual || toYmd(new Date());
    const lunes = startOfWeek(base);
    lunes.setDate(lunes.getDate() + semanaOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(lunes);
      d.setDate(lunes.getDate() + i);
      return toYmd(d);
    });
  }, [fechaActual, semanaOffset]);

  const scope = useMemo(
    () => todasLasFechas
      ? sessions.filter(s => !!s.fecha)
      : view === 'dia'
        ? sessions.filter(s => s.fecha === fechaActual)
        : sessions.filter(s => s.fecha && diasSemana.includes(s.fecha)),
    [sessions, todasLasFechas, view, fechaActual, diasSemana]
  );

  // Predicados independientes, para que los filtros se acoten entre sí
  const temaQ = tema.trim().toUpperCase();
  const pTema = useCallback((s: Sesion) => !temaQ || (s.tema || '').toUpperCase().includes(temaQ), [temaQ]);
  const pModulo = useCallback((s: Sesion) => !modulo || s.modulo === modulo, [modulo]);
  const pLocalidad = useCallback((s: Sesion) => !localidad || s.localidad === localidad, [localidad]);
  const pCap = useCallback((s: Sesion) => !capacitadorF ||
    (s.capacitador || '').split('/').map(x => x.trim()).some(x => x === capacitadorF), [capacitadorF]);
  const pPart = useCallback((s: Sesion) => !participanteF ||
    s.attendees.some(a => a.nombre === participanteF), [participanteF]);

  const matchFilters = useCallback((s: Sesion) => pTema(s) && pModulo(s) && pLocalidad(s) && pCap(s) && pPart(s),
    [pTema, pModulo, pLocalidad, pCap, pPart]);

  // Opciones en cascada: cada lista aplica todos los filtros MENOS el propio
  const temasOpt = useMemo(() => uniqueSortedOpciones(scope.filter(s => pModulo(s) && pLocalidad(s) && pCap(s) && pPart(s)).map(s => s.tema)), [scope, pModulo, pLocalidad, pCap, pPart]);
  const capsOpt = useMemo(() => uniqueSortedOpciones(scope.filter(s => pTema(s) && pModulo(s) && pLocalidad(s) && pPart(s)).flatMap(s => (s.capacitador || '').split('/').map(x => x.trim()))), [scope, pTema, pModulo, pLocalidad, pPart]);
  const partsOpt = useMemo(() => uniqueSortedOpciones(scope.filter(s => pTema(s) && pModulo(s) && pLocalidad(s) && pCap(s)).flatMap(s => s.attendees.map(a => a.nombre))), [scope, pTema, pModulo, pLocalidad, pCap]);
  const modulosOpt = useMemo(() => uniqueSortedOpciones(scope.filter(s => pTema(s) && pLocalidad(s) && pCap(s) && pPart(s)).map(s => s.modulo)), [scope, pTema, pLocalidad, pCap, pPart]);
  const localidadesOpt = useMemo(() => uniqueSortedOpciones(scope.filter(s => pTema(s) && pModulo(s) && pCap(s) && pPart(s)).map(s => s.localidad)), [scope, pTema, pModulo, pCap, pPart]);

  const shown = useMemo(() => scope.filter(matchFilters), [scope, matchFilters]);
  const nFiltros = [tema, capacitadorF, participanteF, modulo, localidad].filter(Boolean).length;

  // Leyenda: solo los módulos que realmente se están viendo
  const modulosVisibles = useMemo(() => uniqueSorted(shown.map(s => s.modulo)), [shown]);

  function limpiar() {
    setTema(''); setCapacitadorF(''); setParticipanteF(''); setModulo(''); setLocalidad('');
  }

  return (
    <section className="tab-panel active">
      <div className="filtros-barra">
        <div className="filtros-grid">
          <DateCalendar value={fechaActual} conteoPorFecha={conteoPorFecha} onChange={setFecha} />
          <FilterCombo label="Tema" value={tema} options={temasOpt} onChange={setTema} allLabel="Todos los temas" span={2} />
          <FilterCombo label="Capacitador" value={capacitadorF} options={capsOpt} onChange={setCapacitadorF} allLabel="Todos los capacitadores" span={2} />
          <FilterCombo label="Usuario a capacitar" value={participanteF} options={partsOpt} onChange={setParticipanteF} allLabel="Todos los usuarios" span={2} />
          <FilterCombo label="Módulo" value={modulo} options={modulosOpt} onChange={setModulo} allLabel="Todos" />
          <FilterCombo label="Localidad" value={localidad} options={localidadesOpt} onChange={setLocalidad} allLabel="Todas" />
        </div>

        <div className="filtros-pie">
          <span className="filtros-resumen">
            {shown.length} sesión(es) {todasLasFechas ? 'en todo el calendario' : view === 'dia' ? 'este día' : 'esta semana'}
            {nFiltros > 0 && ` · ${nFiltros} filtro(s) activo(s)`}
          </span>
          <div className="filtros-acciones">
            {!todasLasFechas && (
              <>
                <div className="view-toggle" role="group">
                  <button className={`gt-btn ${view === 'dia' ? 'active' : ''}`} onClick={() => setView('dia')}>Vista día</button>
                  <button className={`gt-btn ${view === 'semana' ? 'active' : ''}`} onClick={() => { setSemanaOffset(0); setView('semana'); }}>Vista semana</button>
                </div>
                <div className="view-toggle" role="group">
                  <button className={`gl-btn ${lane === 'sala' ? 'active' : ''}`} onClick={() => setLane('sala')}>Por sala</button>
                  <button className={`gl-btn ${lane === 'capacitador' ? 'active' : ''}`} onClick={() => setLane('capacitador')}>Por capacitador</button>
                </div>
              </>
            )}
            <button className="btn btn-ghost btn-sm" onClick={limpiar} disabled={!nFiltros} title="Quitar todos los filtros">
              ✕ Limpiar filtros
            </button>
          </div>
        </div>
      </div>

      {modulosVisibles.length > 0 && (
        <div className="gantt-legend">
          {modulosVisibles.map(m => <span key={m} className="legend-swatch"><i style={{ background: moduloColor(m) }} />{m}</span>)}
          <span className="legend-swatch"><i style={{ background: 'transparent', border: '2px solid var(--red)' }} />Conflicto</span>
        </div>
      )}

      {todasLasFechas
        ? <DateOverview sessions={shown} conflicts={conflicts} moduloColor={moduloColor}
            hint="Elige una fecha para ver su Gantt por día o por semana"
            onPickFecha={f => irA(f, 'dia')} />
        : view === 'dia'
        ? <GanttDia shown={shown} scope={scope} lane={lane} conflicts={conflicts} fecha={fechaActual} onOpenSession={onOpenSession} />
        : <GanttSemana shown={shown} dias={diasSemana} lane={lane} conflicts={conflicts}
            offset={semanaOffset} setOffset={setSemanaOffset}
            onPickFecha={f => { setSemanaOffset(0); irA(f, 'dia'); }} onOpenSession={onOpenSession} />}
    </section>
  );
}

/* ---------------- Vista día ---------------- */
function GanttDia({ shown, scope, lane, conflicts, fecha, onOpenSession }: {
  shown: Sesion[]; scope: Sesion[]; lane: 'sala' | 'capacitador'; conflicts: ConflictItem[];
  fecha: string; onOpenSession: (id: string) => void;
}) {
  if (!scope.length) return <div className="gantt-empty-lanes">No hay sesiones registradas para {fmtFechaLarga(fecha)}.</div>;
  if (!shown.length) return <div className="gantt-empty-lanes">Ninguna sesión de este día coincide con los filtros activos.</div>;

  const conflictIds = new Set(conflicts.flatMap(c => c.sessionIds));
  let minM = Math.min(...shown.map(s => s.horaMin ?? 420));
  let maxM = Math.max(...shown.map(s => s.horaFinMin ?? 1080));
  minM = Math.floor(minM / 60) * 60; maxM = Math.ceil(maxM / 60) * 60;
  if (maxM - minM < 120) maxM = minM + 120;
  const totalMin = maxM - minM;
  const hours: number[] = [];
  for (let h = minM; h <= maxM; h += 60) hours.push(h);

  const laneKeys = uniqueSorted(shown.map(s => (lane === 'sala' ? (s.sala || 'Sin sala asignada') : s.capacitador)));

  return (
    <div className="gantt-dia">
      <div className="gantt-grid">
        <div className="gantt-hours" style={{ gridTemplateColumns: `260px repeat(${hours.length - 1}, 1fr)` }}>
          <div className="gantt-hour-label gantt-hour-corner">
            {lane === 'sala' ? 'Sala' : 'Capacitador'}
            <span className="gh-sub">{laneKeys.length} carril(es)</span>
          </div>
          {hours.slice(0, -1).map(h => (
            <div key={h} className="gantt-hour-label">{String(Math.floor(h / 60)).padStart(2, '0')}:00</div>
          ))}
        </div>

        {laneKeys.map((key, li) => {
          const rows = shown.filter(s => (lane === 'sala' ? (s.sala || 'Sin sala asignada') : s.capacitador) === key);
          const nPers = rows.reduce((a, s) => a + s.attendees.length, 0);
          const conConflicto = rows.some(s => conflictIds.has(s.sessionId));
          const sinSala = lane === 'sala' && key === 'Sin sala asignada';
          return (
            <div key={key} className={`gantt-lane-row ${li % 2 ? 'alt' : ''}`}>
              <div className={`gantt-lane-label ${sinSala ? 'lane-sin-sala' : ''}`}>
                <div className="gl-nombre">{key}</div>
                <div className="gl-meta">
                  <span>{rows.length} ses.</span>
                  <span>{nPers} pers.</span>
                  {conConflicto && <span className="gl-alerta">⚠</span>}
                </div>
              </div>
              <div className="gantt-track">
                {hours.slice(1, -1).map(h => (
                  <div key={h} className="gantt-vline" style={{ left: `${((h - minM) / totalMin) * 100}%` }} />
                ))}
                {rows.map(s => {
                  const left = (((s.horaMin ?? minM) - minM) / totalMin) * 100;
                  const width = Math.max(2, (((s.horaFinMin ?? minM + 60) - (s.horaMin ?? minM)) / totalMin) * 100);
                  return (
                    <div key={s.sessionId} className={`gantt-bar ${conflictIds.has(s.sessionId) ? 'conflict' : ''}`}
                      style={{ left: `${left}%`, width: `${width}%`, background: moduloColor(s.modulo) }}
                      title={`${s.tema}\n${s.modulo} · ${s.capacitador}\n${s.hora}–${s.horaFin} · ${s.attendees.length} persona(s)\n${s.lugar || ''}`}
                      onClick={() => onOpenSession(s.sessionId)}>
                      <div className="gantt-bar-tema">{s.tema}</div>
                      <div className="gantt-bar-cap">
                        <span className="gb-tag">{s.modulo || '—'}</span>
                        {s.hora}–{s.horaFin} · {s.attendees.length}p · {(s.capacitador || '—').split('/')[0].trim()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Vista semana ---------------- */
function GanttSemana({ shown, dias, lane, conflicts, offset, setOffset, onPickFecha, onOpenSession }: {
  shown: Sesion[]; dias: string[]; lane: 'sala' | 'capacitador'; conflicts: ConflictItem[];
  offset: number; setOffset: React.Dispatch<React.SetStateAction<number>>;
  onPickFecha: (f: string) => void; onOpenSession: (id: string) => void;
}) {
  const conflictIds = new Set(conflicts.flatMap(c => c.sessionIds));
  const laneKeys = uniqueSorted(shown.map(s => (lane === 'sala' ? (s.sala || 'Sin sala asignada') : s.capacitador)));

  return (
    <div>
      <div className="gs-nav">
        <button className="btn btn-ghost btn-sm" onClick={() => setOffset(o => o - 1)}>‹ Semana anterior</button>
        <span className="gs-rango">{fmtFechaLarga(dias[0])} → {fmtFechaLarga(dias[6])}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setOffset(o => o + 1)}>Semana siguiente ›</button>
        {offset !== 0 && <button className="btn btn-ghost btn-sm" onClick={() => setOffset(0)}>Volver</button>}
      </div>

      {!shown.length ? (
        <div className="gantt-empty-lanes">No hay sesiones en esta semana con los filtros activos.</div>
      ) : (
        <div className="gs-scroll">
          <div className="gs-grid">
            <div className="gs-cell gs-corner">{lane === 'sala' ? 'Sala' : 'Capacitador'}</div>
            {dias.map((d, i) => {
              const n = shown.filter(s => s.fecha === d).length;
              return (
                <div key={d} className={`gs-cell gs-head ${n ? '' : 'gs-head-vacio'}`}
                  onClick={() => n && onPickFecha(d)} title={n ? 'Ver este día en la vista día' : 'Sin sesiones'}>
                  <div className="gs-dow">{DOW[i]}</div>
                  <div className="gs-fecha">{d.slice(8, 10)}/{d.slice(5, 7)}</div>
                  {n > 0 && <div className="gs-count">{n}</div>}
                </div>
              );
            })}
            {laneKeys.map((key, li) => (
              <div key={key} style={{ display: 'contents' }}>
                <div className={`gs-cell gs-lane ${li % 2 ? 'alt' : ''}`}>{key}</div>
                {dias.map(d => {
                  const items = shown
                    .filter(s => s.fecha === d && (lane === 'sala' ? (s.sala || 'Sin sala asignada') : s.capacitador) === key)
                    .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
                  return (
                    <div key={`${key}-${d}`} className={`gs-cell gs-slot ${li % 2 ? 'alt' : ''}`}>
                      {items.map(s => (
                        <div key={s.sessionId} className={`gs-chip ${conflictIds.has(s.sessionId) ? 'conflict' : ''}`}
                          style={{ background: moduloColor(s.modulo) }}
                          title={`${s.tema}\n${s.modulo} · ${s.capacitador}\n${s.hora}–${s.horaFin} · ${s.attendees.length} persona(s)`}
                          onClick={() => onOpenSession(s.sessionId)}>
                          <span className="gs-chip-hora">{s.hora}–{s.horaFin} · {s.attendees.length}p</span>
                          <span className="gs-chip-tema">{s.tema}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
