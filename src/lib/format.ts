import type { RegistroRow } from '../types/domain';
import { timeToMin } from './conflictEngine';

const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function parseYmd(fecha: string): Date {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function fmtFechaLarga(fecha: string | null): string {
  if (!fecha) return '—';
  const d = parseYmd(fecha);
  return `${DIAS[d.getDay()]}, ${String(d.getDate()).padStart(2,'0')} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export function fmtFechaCorta(fecha: string | null): string {
  if (!fecha) return '—';
  const d = parseYmd(fecha);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

export function rowDuracionText(row: RegistroRow): string {
  const a = timeToMin(row.hora), b = timeToMin(row.horaFin);
  if (a == null || b == null || b <= a) return '—';
  const h = (b - a) / 60;
  return h % 1 === 0 ? `${h} h` : `${h.toFixed(1)} h`;
}
