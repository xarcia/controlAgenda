import { useMemo } from 'react';
import type { RegistroRow, UsuarioSap, RolLiberado } from '../../types/domain';

interface Props {
  registro: RegistroRow[];
  usuariosSap: UsuarioSap[];
  rolesLiberados: RolLiberado[];
  onClose: () => void;
}

function normName(s: string | null | undefined): string {
  return (s || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

export function RolesSapPanel({ registro, usuariosSap, rolesLiberados, onClose }: Props) {
  const cruce = useMemo(() => {
    const usuariosPorNombre = new Map(usuariosSap.map(u => [normName(u.nombre_completo), u]));
    const listos = new Set(rolesLiberados.filter(r => normName(r.estado).includes('LISTO')).map(r => r.id_usuario));

    const capacitadosNombres = new Set<string>();
    registro.forEach(r => { if (r.nombre) capacitadosNombres.add(normName(r.nombre)); });

    const capacitadosSinRol: string[] = [];
    const rolListoSinCapacitacion: string[] = [];
    let capacitadosConRolListo = 0;
    let capacitadosSinFichaSap = 0;

    for (const nombre of capacitadosNombres) {
      const u = usuariosPorNombre.get(nombre);
      if (!u) { capacitadosSinFichaSap++; continue; }
      if (listos.has(u.id_usuario)) capacitadosConRolListo++;
      else capacitadosSinRol.push(u.nombre_completo || nombre);
    }
    for (const u of usuariosSap) {
      if (listos.has(u.id_usuario) && !capacitadosNombres.has(normName(u.nombre_completo))) {
        rolListoSinCapacitacion.push(u.nombre_completo || u.id_usuario);
      }
    }

    return {
      totalUsuariosSap: usuariosSap.length,
      totalRolesListo: listos.size,
      totalCapacitados: capacitadosNombres.size,
      capacitadosConRolListo,
      capacitadosSinRol: capacitadosSinRol.sort(),
      rolListoSinCapacitacion: rolListoSinCapacitacion.sort(),
      capacitadosSinFichaSap,
    };
  }, [registro, usuariosSap, rolesLiberados]);

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true">
        <div className="modal-title">Capacitación vs. Roles SAP liberados</div>
        <div className="modal-sub">Cruce por nombre entre quién ya asistió a una capacitación y a quién ya se le activó su rol en SAP (Matriz DEV110 + Roles Liberados).</div>
        <div className="kpi-row" style={{ margin: '14px 0' }}>
          <div className="kpi-card"><div className="kpi-label">Usuarios SAP</div><div className="kpi-value">{cruce.totalUsuariosSap}</div></div>
          <div className="kpi-card"><div className="kpi-label">Roles liberados</div><div className="kpi-value">{cruce.totalRolesListo}</div></div>
          <div className="kpi-card"><div className="kpi-label">Personas capacitadas</div><div className="kpi-value">{cruce.totalCapacitados}</div></div>
          <div className="kpi-card"><div className="kpi-label" style={{ color: 'var(--green-ink)' }}>Capacitados con rol listo</div><div className="kpi-value" style={{ color: 'var(--green-ink)' }}>{cruce.capacitadosConRolListo}</div></div>
        </div>
        <div className="form-grid">
          <div className="form-field full">
            <label>⚠ Capacitados pero SIN rol liberado todavía ({cruce.capacitadosSinRol.length})</label>
            <div className="roles-list">
              {cruce.capacitadosSinRol.length ? cruce.capacitadosSinRol.map((n, i) => <div key={i}>{n}</div>) : <span style={{ color: 'var(--text-dim)' }}>Ninguno — todos los capacitados con ficha SAP ya tienen su rol liberado.</span>}
            </div>
          </div>
          <div className="form-field full">
            <label>⚠ Con rol liberado pero SIN capacitación registrada ({cruce.rolListoSinCapacitacion.length})</label>
            <div className="roles-list">
              {cruce.rolListoSinCapacitacion.length ? cruce.rolListoSinCapacitacion.map((n, i) => <div key={i}>{n}</div>) : <span style={{ color: 'var(--text-dim)' }}>Ninguno.</span>}
            </div>
          </div>
          <div className="form-field full" style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
            {cruce.capacitadosSinFichaSap} persona(s) capacitada(s) no tienen ficha en Matriz DEV110 (cruce por nombre, puede haber diferencias de formato).
          </div>
        </div>
        <div className="modal-actions"><div></div><div><button className="btn btn-ghost" onClick={onClose}>Cerrar</button></div></div>
      </div>
    </div>
  );
}
