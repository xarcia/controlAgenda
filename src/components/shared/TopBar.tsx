interface Props {
  activeTab: 'agenda' | 'gantt';
  onTabChange: (t: 'agenda' | 'gantt') => void;
  alertsCount: number;
  role: 'editor' | 'viewer' | 'viewer2' | null;
  supabaseConfigured: boolean;
  saving: boolean;
  lastSaveError: string | null;
  canEdit: boolean;
  verAgenda: boolean;
  onChangeRole: () => void;
  onLogout: () => void;
  onOpenRoles: () => void;
  onOpenReporte: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}

export function TopBar({
  activeTab, onTabChange, alertsCount, role, supabaseConfigured, saving, lastSaveError,
  canEdit, verAgenda, onChangeRole, onLogout, onOpenRoles, onOpenReporte, onRefresh, refreshing,
}: Props) {
  const syncLabel = !supabaseConfigured
    ? 'Guardado en este navegador'
    : lastSaveError ? '⚠ Error al guardar en Supabase'
    : saving ? 'Guardando…' : 'Sincronizado con Supabase';

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <img className="brand-logo" src="/logo-adelca.png" alt="ADELCA" />
        <div>
          <div className="brand-title">Centro de Control · ADELCA</div>
          <div className="brand-sub">Planificación de Capacitaciones SAP · Alóag · Milagro · Calderón</div>
        </div>
      </div>

      <nav className="tabs" role="tablist">
        {verAgenda && (
          <button className={`tab-btn ${activeTab === 'agenda' ? 'active' : ''}`} onClick={() => onTabChange('agenda')}>Agenda Reunión</button>
        )}
        <button className={`tab-btn ${activeTab === 'gantt' ? 'active' : ''}`} onClick={() => onTabChange('gantt')}>Gantt</button>
      </nav>

      <div className="topbar-status">
        {/* Todo el bloque de herramientas (alertas, perfil, Roles SAP, estado de
            sincronización y Actualizar) es solo para el perfil EDITOR. El perfil
            de visualización queda limpio: únicamente "Cerrar sesión". */}
        {canEdit && (
          <>
            <span className="alerts-pill"><span className="dot" />{alertsCount} alertas</span>
            {role && (
              <button className={`role-badge role-${role}`} onClick={onChangeRole} title="Cambiar de perfil">
                ✎ Editor
              </button>
            )}
            <button className="btn-refresh" onClick={onOpenRoles} title="Ver capacitación vs. roles SAP liberados">🎓 Roles SAP</button>
            <button className="btn-refresh" onClick={onOpenReporte} title="Reporte de avance de liberación de roles (descargable)">📊 Reporte</button>
            <span className={`save-state ${lastSaveError ? 'sync-error' : ''} ${saving ? 'saving' : ''}`}>{syncLabel}</span>
            {supabaseConfigured && (
              <button className={`btn-refresh ${refreshing ? 'spinning' : ''}`} onClick={onRefresh} disabled={refreshing} title="Traer ahora mismo lo que hay guardado en Supabase">
                <span className="refresh-icon">⟳</span> Actualizar
              </button>
            )}
          </>
        )}
        {role && (
          <button className="btn-refresh btn-logout" onClick={onLogout} title="Cerrar sesión y volver a la pantalla de acceso">
            Cerrar sesión
          </button>
        )}
      </div>
    </header>
  );
}
