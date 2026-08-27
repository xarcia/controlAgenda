import { useCallback, useEffect, useState } from 'react';
import { supabaseClient } from '../lib/supabaseClient';
import { describeSupabaseError } from '../lib/persistence';
import { withTimeout } from '../lib/withTimeout';

export type Rol = 'editor' | 'viewer' | 'viewer2' | null;

const STORAGE_KEY = 'capacitaciones_role_v1';

async function fetchOrSeedAccessCodes(): Promise<{ editor: string; viewer: string; viewer2: string }> {
  const defaults = { editor: 'EDITAR-ADELCA', viewer: 'VER-ADELCA', viewer2: 'VER2-ADELCA' };
  if (!supabaseClient) return defaults;
  try {
    const { data, error } = await supabaseClient.from('app_meta').select('key,value').in('key', ['editor_code', 'viewer_code', 'viewer2_code']);
    if (error) throw error;
    const found: Record<string, string> = {};
    (data || []).forEach((r: any) => { found[r.key] = r.value; });
    const toSeed: { key: string; value: string }[] = [];
    if (!found.editor_code) toSeed.push({ key: 'editor_code', value: defaults.editor });
    if (!found.viewer_code) toSeed.push({ key: 'viewer_code', value: defaults.viewer });
    if (!found.viewer2_code) toSeed.push({ key: 'viewer2_code', value: defaults.viewer2 });
    if (toSeed.length) {
      try { await supabaseClient.from('app_meta').upsert(toSeed, { onConflict: 'key' }); } catch { /* best effort */ }
    }
    return { editor: found.editor_code || defaults.editor, viewer: found.viewer_code || defaults.viewer, viewer2: found.viewer2_code || defaults.viewer2 };
  } catch (e) {
    console.error('No se pudieron leer los códigos de acceso, usando valores por defecto:', describeSupabaseError(e));
    return defaults;
  }
}

export function useAuth() {
  const [role, setRole] = useState<Rol>(null);
  const [resolving, setResolving] = useState(true);
  const [codes, setCodes] = useState<{ editor: string; viewer: string; viewer2: string } | null>(null);

  useEffect(() => {
    (async () => {
      if (!supabaseClient) { setRole('editor'); setResolving(false); return; }
      const remembered = localStorage.getItem(STORAGE_KEY);
      const fetched = await withTimeout(fetchOrSeedAccessCodes(), 8000, { editor: 'EDITAR-ADELCA', viewer: 'VER-ADELCA', viewer2: 'VER2-ADELCA' });
      setCodes(fetched);
      if (remembered === 'editor' || remembered === 'viewer' || remembered === 'viewer2') {
        setRole(remembered);
        setResolving(false);
        return;
      }
      setResolving(false); // se queda en null -> muestra la puerta de acceso
    })();
  }, []);

  const submitCode = useCallback((code: string): boolean => {
    if (!codes) return false;
    let next: Rol = null;
    if (code === codes.editor) next = 'editor';
    else if (code === codes.viewer) next = 'viewer';
    else if (code === codes.viewer2) next = 'viewer2';
    if (!next) return false;
    setRole(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    return true;
  }, [codes]);

  const changeRole = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setRole(null);
  }, []);

  /** Cerrar sesión: olvida el perfil recordado y vuelve a la pantalla de acceso. */
  const logout = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setRole(null);
  }, []);

  const needsGate = supabaseClient != null && role == null && !resolving;
  const canEdit = role === 'editor';
  /* El perfil "visualizador 2" es igual al de solo lectura, pero sin las columnas
     de ID de usuario SAP ni de liberación de rol: es una vista de agenda pura. */
  const verRolesSap = role !== 'viewer2';

  return { role, resolving, needsGate, canEdit, verRolesSap, submitCode, changeRole, logout, supabaseConfigured: !!supabaseClient };
}