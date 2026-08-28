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

    /* El universo es DEV110: los usuarios que se mandaron a crear.
       Ojo: la Matriz DEV110 trae el mismo ID repetido en varias filas (73 casos),
       normalmente por tener más de un rol asignado. Aquí se agrupa por ID para
       que cada usuario aparezca UNA sola vez y los totales no salgan inflados. */
    const porId = new Map<string, UsuarioSap>();
    for (const u of usuariosSap) {
      if (u.id_usuario && !porId.has(u.id_usuario)) porId.set(u.id_usuario, u);
    }

    const filas: Fila[] = [...porId.values()].map(u => {
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

  /* Descarga en .xlsx REAL (no un HTML disfrazado): se usa ExcelJS, que permite
     colores de relleno, negritas, anchos de columna, filtros y panel congelado.
     Así el archivo abre en Excel sin ningún aviso y con el mismo aspecto que el
     reporte original. */
  const [generando, setGenerando] = useState(false);

  async function descargar() {
    setGenerando(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Centro de Control ADELCA';
      wb.created = new Date();
      const ws = wb.addWorksheet('Avance roles SAP', {
        views: [{ state: 'frozen', ySplit: 4 }],   // deja fijo el encabezado
      });

      const relleno = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });
      const centrado = { vertical: 'middle' as const, horizontal: 'center' as const, wrapText: true };

      // ---- Fila 1-2: tablero de indicadores ----
      const titulos = ['TOTAL USUARIOS', 'LIBERADOS', 'PENDIENTES', 'INCONSISTENTES', '% AVANCE'];
      const valores: (string | number)[] = [total, nLiberados, pendientes, inconsistentes, `${avance}%`];
      const colores = ['FF1F3864', 'FF375623', 'FFC00000', 'FFBF8F00', 'FF2E75B6'];

      const filaT = ws.getRow(1), filaV = ws.getRow(2);
      titulos.forEach((t, k) => {
        const c1 = filaT.getCell(k + 1), c2 = filaV.getCell(k + 1);
        c1.value = t; c2.value = valores[k];
        [c1, c2].forEach(cc => { cc.fill = relleno(colores[k]); cc.alignment = centrado; cc.font = { color: { argb: 'FFFFFFFF' }, bold: true }; });
        c1.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };
        c2.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 18 };
      });
      filaT.height = 20; filaV.height = 30;

      // ---- Fila 4: encabezados de la tabla ----
      const cabeceras = ['ID USUARIO', 'NOMBRE', 'FECHA DE INICIO', 'DÍAS PROGRAMADOS', 'DETALLE POR DÍA', 'ESTADO ROLES'];
      const filaH = ws.getRow(4);
      cabeceras.forEach((h, k) => {
        const cc = filaH.getCell(k + 1);
        cc.value = h;
        cc.fill = relleno('FF1F3864');
        cc.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        cc.alignment = centrado;
        cc.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
      filaH.height = 22;

      // ---- Datos ----
      visibles.forEach((f, idx) => {
        const fila = ws.getRow(5 + idx);
        fila.getCell(1).value = f.idUsuario;
        fila.getCell(2).value = f.nombre;
        fila.getCell(3).value = f.fechaInicio ? new Date(f.fechaInicio + 'T00:00:00') : '';
        fila.getCell(3).numFmt = 'dd/mm/yyyy';
        fila.getCell(4).value = f.dias.length;
        fila.getCell(5).value = detalle(f);
        const est = fila.getCell(6);
        est.value = f.liberado ? 'LIBERADO' : 'PENDIENTE ROLES';
        est.fill = relleno(f.liberado ? 'FFC6EFCE' : 'FFFFC7CE');
        est.font = { color: { argb: f.liberado ? 'FF006100' : 'FF9C0006' }, bold: true };
        est.alignment = { horizontal: 'center' };
        fila.getCell(3).alignment = { horizontal: 'center' };
        fila.getCell(4).alignment = { horizontal: 'center' };
        for (let k = 1; k <= 6; k++) {
          fila.getCell(k).border = { top: { style: 'hair' }, left: { style: 'hair' }, bottom: { style: 'hair' }, right: { style: 'hair' } };
        }
      });

      ws.columns = [
        { width: 16 }, { width: 42 }, { width: 16 }, { width: 20 }, { width: 60 }, { width: 20 },
      ];
      // Filtros en la cabecera, como en el reporte original
      ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + visibles.length, column: 6 } };

      const buf = await wb.xlsx.writeBuffer();
      const hoy = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url; a.download = `reporte_roles_sap_${hoy}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('No se pudo generar el Excel:', e);
      alert('No se pudo generar el archivo. Revisa la consola (F12) para el detalle.');
    }
    setGenerando(false);
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
          <button className="btn btn-amber rep-descargar" onClick={descargar} disabled={generando}>
            {generando ? 'Generando…' : '⭳ Descargar Excel'}
          </button>
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
