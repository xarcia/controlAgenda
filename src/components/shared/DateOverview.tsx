import { useMemo } from 'react';
import type { Sesion, ConflictItem } from '../../types/domain';
import { fmtFechaLarga } from '../../lib/format';
import { uniqueSorted } from '../../lib/conflictEngine';

interface Props {
  /** Sesiones ya filtradas que se van a resumir */
  sessions: Sesion[];
  conflicts: ConflictItem[];
  /** Al elegir una fecha se salta al detalle de ese día */
  onPickFecha: (fecha: string) => void;
  moduloColor: (m: string | null) => string;
  /** Texto de ayuda bajo el título */
  hint?: string;
}

/**
 * Resumen del calendario en tarjetas, una por fecha.
 *
 * Sustituye al acordeón desplegable que había antes: con 21 fechas y 2.727
 * registros, una tabla con secciones plegables resultaba incómoda de leer y de
 * navegar. Aquí cada día se ve de un golpe (cuántas sesiones, cuántas personas,
 * qué módulos, si hay conflictos) y se entra al detalle con un clic.
 */
export function DateOverview({ sessions, conflicts, onPickFecha, moduloColor, hint }: Props) {
  const porFecha = useMemo(() => {
    const map = new Map<string, Sesion[]>();
    for (const s of sessions) {
      if (!s.fecha) continue;
      if (!map.has(s.fecha)) map.set(s.fecha, []);
      map.get(s.fecha)!.push(s);
    }
    const conflictIds = new Set(conflicts.flatMap(c => c.sessionIds));
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([fecha, sess]) => {
        const personas = new Set<number>();
        sess.forEach(s => s.attendees.forEach(a => { if (a.codigo != null) personas.add(a.codigo); }));
        const modulos = uniqueSorted(sess.map(s => s.modulo));
        const nConf = sess.filter(s => conflictIds.has(s.sessionId)).length;
        const horaMin = Math.min(...sess.map(s => s.horaMin ?? 9999));
        const horaMax = Math.max(...sess.map(s => s.horaFinMin ?? 0));
        const capacitadores = uniqueSorted(sess.flatMap(s => (s.capacitador || '').split('/').map(x => x.trim())));
        const localidades = uniqueSorted(sess.map(s => s.localidad));
        return { fecha, sess, personas: personas.size, modulos, nConf, horaMin, horaMax, capacitadores, localidades };
      });
  }, [sessions, conflicts]);

  function hhmm(min: number) {
    if (!Number.isFinite(min) || min > 5000 || min <= 0) return '—';
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  }

  if (!porFecha.length) {
    return <div className="gantt-empty-lanes">No hay sesiones que coincidan con los filtros activos.</div>;
  }

  return (
    <div className="dov">
      <div className="dov-head">
        <span className="dov-titulo">{porFecha.length} fecha(s) con sesiones</span>
        {hint && <span className="dov-hint">{hint}</span>}
      </div>
      <div className="dov-grid">
        {porFecha.map(d => (
          <button type="button" key={d.fecha} className={`dov-card ${d.nConf ? 'con-conf' : ''}`}
            onClick={() => onPickFecha(d.fecha)} title={`Ver el detalle de ${fmtFechaLarga(d.fecha)}`}>
            <div className="dov-fecha">{fmtFechaLarga(d.fecha)}</div>

            <div className="dov-cifras">
              <span className="dov-cifra"><b>{d.sess.length}</b> sesiones</span>
              <span className="dov-cifra"><b>{d.personas}</b> personas</span>
              <span className="dov-cifra"><b>{d.capacitadores.length}</b> capacit.</span>
            </div>

            <div className="dov-horario">{hhmm(d.horaMin)} – {hhmm(d.horaMax)}</div>

            {/* Barra proporcional por módulo: se ve la composición del día */}
            <div className="dov-barra">
              {d.modulos.map(m => {
                const n = d.sess.filter(s => (s.modulo || '—') === m).length;
                return (
                  <span key={m} className="dov-seg" title={`${m}: ${n} sesión(es)`}
                    style={{ background: moduloColor(m), flexGrow: n }} />
                );
              })}
            </div>

            <div className="dov-mods">
              {d.modulos.slice(0, 5).map(m => (
                <span key={m} className="dov-mod" style={{ borderColor: moduloColor(m) }}>{m}</span>
              ))}
              {d.modulos.length > 5 && <span className="dov-mod dov-mas">+{d.modulos.length - 5}</span>}
            </div>

            <div className="dov-pie">
              <span className="dov-loc">{d.localidades.slice(0, 2).join(' · ') || '—'}{d.localidades.length > 2 ? ` +${d.localidades.length - 2}` : ''}</span>
              {d.nConf > 0 && <span className="dov-conf">⚠ {d.nConf}</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
