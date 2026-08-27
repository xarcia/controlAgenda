import { useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  /** Texto de la opción que no filtra nada (ej. "Todos", "Todas las fechas") */
  allLabel: string;
  /** Para mostrar la opción distinto a su valor real (ej. fechas legibles) */
  formatOption?: (v: string) => string;
  /** Ancho en la cuadrícula: 1 = normal, 2 = doble (para nombres largos) */
  span?: 1 | 2;
  /** Solo lectura (perfil visualizador o campos bloqueados) */
  disabled?: boolean;
  /** Oculta la etiqueta superior: útil dentro de formularios que ya la traen */
  hideLabel?: boolean;
}

function norm(s: string) {
  return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Filtro desplegable con buscador propio, al estilo de Power BI.
 *
 * Se hizo a mano en vez de usar <input list> (datalist) por un problema real de
 * los navegadores: cuando el campo ya tiene un valor completo seleccionado, el
 * navegador filtra la lista a solo esa coincidencia, y ya no se puede cambiar a
 * otra opción sin borrar el texto a mano. Aquí el buscador y la selección son
 * cosas separadas: el texto solo filtra la lista, y elegir siempre es posible.
 */
export function FilterCombo({ label, value, options, onChange, allLabel, formatOption, span = 1, disabled = false, hideLabel = false }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Cerrar al hacer clic fuera o al pulsar Escape.
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

  useEffect(() => {
    if (open) { setQuery(''); setTimeout(() => searchRef.current?.focus(), 0); }
  }, [open]);

  const filtradas = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return options;
    return options.filter(o => norm(formatOption ? formatOption(o) : o).includes(q));
  }, [options, query, formatOption]);

  const textoActual = value ? (formatOption ? formatOption(value) : value) : allLabel;

  function elegir(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div className={`fc ${span === 2 ? 'fc-span2' : ''}`} ref={boxRef}>
      {!hideLabel && <span className="fc-label">{label}</span>}
      <button type="button" className={`fc-trigger ${value ? 'fc-active' : ''}`} disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)} title={textoActual}>
        <span className="fc-value">{textoActual}</span>
        <span className="fc-caret">▾</span>
      </button>

      {open && !disabled && (
        <div className="fc-panel">
          <input ref={searchRef} className="fc-search" type="text" placeholder="Escribe para buscar…"
            value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              // Enter elige la primera coincidencia: permite filtrar y confirmar
              // sin soltar el teclado.
              if (e.key === 'Enter') { e.preventDefault(); if (filtradas.length) elegir(filtradas[0]); }
            }} />
          <div className="fc-list">
            <button type="button" className={`fc-opt fc-opt-all ${!value ? 'sel' : ''}`} onClick={() => elegir('')}>
              {allLabel}
            </button>
            {filtradas.length === 0 && <div className="fc-vacio">Sin coincidencias para "{query}"</div>}
            {filtradas.map(o => (
              <button type="button" key={o} className={`fc-opt ${o === value ? 'sel' : ''}`} onClick={() => elegir(o)} title={formatOption ? formatOption(o) : o}>
                {formatOption ? formatOption(o) : o}
              </button>
            ))}
          </div>
          <div className="fc-foot">{filtradas.length} de {options.length} opción(es)</div>
        </div>
      )}
    </div>
  );
}