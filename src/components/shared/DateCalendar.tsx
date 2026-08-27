import { useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  /** Fecha seleccionada en formato YYYY-MM-DD, o '' para "todas las fechas" */
  value: string;
  /** Conteo de sesiones por fecha, para pintar los días que tienen algo */
  conteoPorFecha: Map<string, number>;
  onChange: (v: string) => void;
  /** Si es false, se oculta la opción "Todas las fechas" (útil donde siempre
   *  hace falta un día concreto, como el Gantt por día). */
  allowAll?: boolean;
}

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function fmtLarga(f: string) {
  const [y, m, d] = f.split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

/**
 * Selector de fecha en formato calendario. Los días que tienen sesiones se
 * pintan y muestran su cantidad, así se ve de un golpe dónde hay actividad
 * (con una lista desplegable de 22 fechas eso no se apreciaba).
 */
export function DateCalendar({ value, conteoPorFecha, onChange, allowAll = true }: Props) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Mes que se está mostrando: el de la fecha elegida, o el primero con sesiones.
  const primeraConSesiones = useMemo(() => {
    const fs = [...conteoPorFecha.keys()].sort();
    return fs[0] || '';
  }, [conteoPorFecha]);

  const refInicial = value || primeraConSesiones;
  const [anio, setAnio] = useState(() => refInicial ? Number(refInicial.slice(0, 4)) : new Date().getFullYear());
  const [mes, setMes] = useState(() => refInicial ? Number(refInicial.slice(5, 7)) - 1 : new Date().getMonth());

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // Al abrir, saltar al mes de la fecha seleccionada
  useEffect(() => {
    if (open && value) { setAnio(Number(value.slice(0, 4))); setMes(Number(value.slice(5, 7)) - 1); }
  }, [open, value]);

  // Celdas del mes: se rellena con vacíos hasta el primer día (semana inicia lunes)
  const celdas = useMemo(() => {
    const primero = new Date(anio, mes, 1);
    const dow = primero.getDay();               // 0 = domingo
    const offset = dow === 0 ? 6 : dow - 1;     // cuántos huecos antes del día 1
    const diasEnMes = new Date(anio, mes + 1, 0).getDate();
    const out: (string | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= diasEnMes; d++) out.push(ymd(anio, mes, d));
    return out;
  }, [anio, mes]);

  const maxConteo = useMemo(() => Math.max(1, ...[...conteoPorFecha.values()]), [conteoPorFecha]);
  const totalMes = useMemo(
    () => celdas.filter(Boolean).reduce((acc, f) => acc + (conteoPorFecha.get(f as string) || 0), 0),
    [celdas, conteoPorFecha]
  );

  function irMes(delta: number) {
    let m = mes + delta, y = anio;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMes(m); setAnio(y);
  }

  const texto = value ? fmtLarga(value) : 'Todas las fechas';

  return (
    <div className="fc dc" ref={boxRef}>
      <span className="fc-label">Fecha</span>
      <button type="button" className={`fc-trigger ${value ? 'fc-active' : ''}`} onClick={() => setOpen(o => !o)} title={texto}>
        <span className="fc-value">📅 {texto}</span>
        <span className="fc-caret">▾</span>
      </button>

      {open && (
        <div className="fc-panel dc-panel">
          {allowAll && (
            <button type="button" className={`fc-opt fc-opt-all ${!value ? 'sel' : ''}`} onClick={() => { onChange(''); setOpen(false); }}>
              Todas las fechas
            </button>
          )}

          <div className="dc-nav">
            <button type="button" onClick={() => irMes(-1)} title="Mes anterior">‹</button>
            <span className="dc-mes">{MESES[mes]} {anio}</span>
            <button type="button" onClick={() => irMes(1)} title="Mes siguiente">›</button>
          </div>

          <div className="dc-dows">
            {DOW.map((d, i) => <span key={i} className="dc-dow">{d}</span>)}
          </div>

          <div className="dc-grid">
            {celdas.map((f, i) => {
              if (!f) return <span key={`e${i}`} className="dc-day dc-empty" />;
              const n = conteoPorFecha.get(f) || 0;
              const dia = Number(f.slice(8, 10));
              // Intensidad del color según cuántas sesiones tenga ese día
              const nivel = n === 0 ? 0 : n / maxConteo > 0.66 ? 3 : n / maxConteo > 0.33 ? 2 : 1;
              return (
                <button key={f} type="button" disabled={!n}
                  className={`dc-day ${n ? `dc-has dc-n${nivel}` : 'dc-none'} ${f === value ? 'dc-sel' : ''}`}
                  onClick={() => { onChange(f); setOpen(false); }}
                  title={n ? `${fmtLarga(f)} — ${n} sesión(es)` : `${fmtLarga(f)} — sin sesiones`}>
                  <span className="dc-num">{dia}</span>
                  {n > 0 && <span className="dc-badge">{n}</span>}
                </button>
              );
            })}
          </div>

          <div className="fc-foot dc-foot">
            <span className="dc-leyenda"><i className="dc-sw dc-n1" /><i className="dc-sw dc-n2" /><i className="dc-sw dc-n3" /> menos → más sesiones</span>
            <span>{totalMes} sesión(es) en {MESES[mes]}</span>
          </div>
        </div>
      )}
    </div>
  );
}