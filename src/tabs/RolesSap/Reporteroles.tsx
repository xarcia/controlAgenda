import { useMemo, useState } from 'react';
import type { RegistroRow, UsuarioSap, RolLiberado } from '../../types/domain';
import { normName } from '../../lib/rolesLookup';

interface Props {
  registro: RegistroRow[];
  usuariosSap: UsuarioSap[];
  rolesLiberados: RolLiberado[];
  onClose: () => void;
}

interface Fila {
  idUsuario: string;
  nombre: string;
  fechaInicio: string | null;   // primera capacitación (YYYY-MM-DD)
  dias: string[];               // días distintos con capacitación
  liberado: boolean;
}

function ddmm(f: string) { return `${f.slice(8, 10)}/${f.slice(5, 7)}`; }

export function ReporteRoles({ registro, usuariosSap, rolesLiberados, onClose }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'liberado' | 'pendiente'>('todos');

  const { filas, inconsistentes } = useMemo(() => {
    // Días de capacitación por persona (se cruza por nombre, igual que en la app)
    const diasPorNombre = new Map<string, Set<string>>();
    for (const r of registro) {
      if (!r.nombre || !r.fecha) continue;
      const k = normName(r.nombre);
      if (!diasPorNombre.has(k)) diasPorNombre.set(k, new Set());
      diasPorNombre.get(k)!.add(r.fecha);
    }

    const liberados = new Set(
      rolesLiberados.filter(r => normName(r.estado).includes('LISTO') || normName(r.estado) === 'SI' || !r.estado)
        .map(r => normName(r.id_usuario))
    );

    // El universo es DEV110: todos los usuarios que se mandaron a crear
    const filas: Fila[] = usuariosSap.map(u => {
      const dias = [...(diasPorNombre.get(normName(u.nombre_completo)) || [])].sort();
      return {
        idUsuario: u.id_usuario,
        nombre: u.nombre_completo || `${u.apellidos || ''} ${u.nombres || ''}`.trim(),
        fechaInicio: dias[0] || null,
        dias,
        liberado: liberados.has(normName(u.id_usuario)),
      };
    }).sort((a, b) => a.idUsuario.localeCompare(b.idUsuario));

    /* INCONSISTENTES: personas que SÍ tienen capacitación programada pero que no
       aparecen en DEV110, es decir, nunca se remitieron a creación de usuario.
       Son las que en la agenda salen como "NO REMITIDO A CREACION". */
    const enDev110 = new Set(usuariosSap.map(u => normName(u.nombre_completo)));
    const inconsistentes = [...diasPorNombre.keys()].filter(n => !enDev110.has(n)).length;

    return { filas, inconsistentes };
  }, [registro, usuariosSap, rolesLiberados]);

  const total = filas.length;
  const nLiberados = filas.filter(f => f.liberado).length;
  const pendientes = total - nLiberados;
  const avance = total ? Math.round((nLiberados / total) * 100) : 0;

  const visibles = useMemo(() => {
    const q = normName(busqueda);
    return filas.filter(f => {
      if (filtroEstado === 'liberado' && !f.liberado) return false;
      if (filtroEstado === 'pendiente' && f.liberado) return false;
      if (!q) return true;
      return normName(f.idUsuario).includes(q) || normName(f.nombre).includes(q);
    });
  }, [filas, busqueda, filtroEstado]);

  function detalle(f: Fila) {
    return f.dias.map(d => `${ddmm(d)}: ${f.liberado ? 'SI' : 'NO'}`).join(' · ');
  }

  /* Descarga en formato Excel. Se genera una tabla HTML con estilos y se guarda
     con extensión .xls: Excel la abre respetando colores y anchos, y no hace
     falta añadir ninguna librería al proyecto. */
  function descargar() {
    const esc = (v: string) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const filasHtml = visibles.map(f => `
      <tr>
        <td>${esc(f.idUsuario)}</td>
        <td>${esc(f.nombre)}</td>
        <td style="mso-number-format:'dd/mm/yyyy'">${f.fechaInicio ? `${f.fechaInicio.slice(8,10)}/${f.fechaInicio.slice(5,7)}/${f.fechaInicio.slice(0,4)}` : ''}</td>
        <td style="text-align:center">${f.dias.length}</td>
        <td>${esc(detalle(f))}</td>
        <td style="background:${f.liberado ? '#C6EFCE' : '#FFC7CE'};color:${f.liberado ? '#0B6623' : '#9C0006'};font-weight:bold">
          ${f.liberado ? 'LIBERADO' : 'PENDIENTE ROLES'}
        </td>
      </tr>`).join('');

    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">
      <style>
        td,th{border:1px solid #9AA;padding:4px 8px;font-family:Calibri,Arial;font-size:11pt}
        th{background:#1F3864;color:#fff;font-weight:bold}
        .kpi{font-weight:bold;color:#fff;text-align:center;font-size:14pt}
      </style></head><body>
      <table>
        <tr>
          <td class="kpi" style="background:#1F3864">TOTAL USUARIOS</td>
          <td class="kpi" style="background:#375623">LIBERADOS</td>
          <td class="kpi" style="background:#C00000">PENDIENTES</td>
          <td class="kpi" style="background:#BF8F00">INCONSISTENTES</td>
          <td class="kpi" style="background:#2E75B6">% AVANCE</td>
        </tr>
        <tr>
          <td class="kpi" style="background:#1F3864">${total}</td>
          <td class="kpi" style="background:#375623">${nLiberados}</td>
          <td class="kpi" style="background:#C00000">${pendientes}</td>
          <td class="kpi" style="background:#BF8F00">${inconsistentes}</td>
          <td class="kpi" style="background:#2E75B6">${avance}%</td>
        </tr>
      </table>
      <br/>
      <table>
        <tr><th>ID USUARIO</th><th>NOMBRE</th><th>FECHA DE INICIO</th><th>DÍAS PROGRAMADOS</th><th>DETALLE POR DÍA</th><th>ESTADO ROLES</th></tr>
        ${filasHtml}
      </table></body></html>`;

    const hoy = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel' }));
    const a = document.createElement('a');
    a.href = url; a.download = `reporte_roles_sap_${hoy}.xls`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card rep-card" role="dialog" aria-modal="true">
        <div className="modal-title">Avance de liberación de roles SAP</div>
        <div className="modal-sub">
          Universo: los {total} usuarios de Matriz DEV110 (los que se mandaron a crear).
          Los días salen de las capacitaciones programadas de cada persona.
        </div>

        <div className="rep-kpis">
          <div className="rep-kpi k-total"><span>Total usuarios</span><b>{total}</b></div>
          <div className="rep-kpi k-lib"><span>Liberados</span><b>{nLiberados}</b></div>
          <div className="rep-kpi k-pen"><span>Pendientes</span><b>{pendientes}</b></div>
          <div className="rep-kpi k-inc"><span>Inconsistentes</span><b>{inconsistentes}</b></div>
          <div className="rep-kpi k-avc"><span>% Avance</span><b>{avance}%</b></div>
        </div>

        <div className="rep-tools">
          <input className="input" placeholder="Buscar por ID o nombre…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          <div className="view-toggle">
            <button className={`gt-btn ${filtroEstado === 'todos' ? 'active' : ''}`} onClick={() => setFiltroEstado('todos')}>Todos</button>
            <button className={`gt-btn ${filtroEstado === 'liberado' ? 'active' : ''}`} onClick={() => setFiltroEstado('liberado')}>Liberados</button>
            <button className={`gt-btn ${filtroEstado === 'pendiente' ? 'active' : ''}`} onClick={() => setFiltroEstado('pendiente')}>Pendientes</button>
          </div>
          <span className="rep-count">{visibles.length} de {total}</span>
          <button className="btn btn-amber btn-sm" onClick={descargar}>⭳ Descargar Excel</button>
        </div>

        <div className="rep-tabla-wrap">
          <table className="data-table rep-tabla">
            <thead>
              <tr>
                <th>ID Usuario</th><th>Nombre</th><th>Fecha de inicio</th>
                <th>Días prog.</th><th>Detalle por día</th><th>Estado roles</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(f => (
                <tr key={f.idUsuario}>
                  <td className="mono">{f.idUsuario}</td>
                  <td>{f.nombre}</td>
                  <td className="mono">{f.fechaInicio ? `${f.fechaInicio.slice(8,10)}/${f.fechaInicio.slice(5,7)}/${f.fechaInicio.slice(0,4)}` : '—'}</td>
                  <td className="mono" style={{ textAlign: 'center' }}>{f.dias.length}</td>
                  <td className="rep-detalle">{detalle(f) || '— sin capacitación programada —'}</td>
                  <td>
                    <span className={`lib-chip ${f.liberado ? 'lib-si' : 'lib-no'}`}>
                      {f.liberado ? 'LIBERADO' : 'PENDIENTE ROLES'}
                    </span>
                  </td>
                </tr>
              ))}
              {!visibles.length && <tr><td colSpan={6} className="empty-state">Sin usuarios que coincidan.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="modal-actions"><div></div><div><button className="btn btn-ghost" onClick={onClose}>Cerrar</button></div></div>
      </div>
    </div>
  );
}
