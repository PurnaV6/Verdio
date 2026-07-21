import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../auth/supabaseClient';

export type PersistenceMode = 'local' | 'syncing' | 'cloud';

export function useWorkspaceState<T>(scope: string, datasetKey: string, initial: T) {
  const localKey = `verdio_${scope}_v2_${datasetKey}`;
  const legacyKey = `verdio_${scope}_v1_${datasetKey}`;
  const [value, setValue] = useState<T>(() => {
    try { const stored = localStorage.getItem(localKey) || localStorage.getItem(legacyKey); return stored ? JSON.parse(stored) as T : initial; }
    catch { return initial; }
  });
  const [mode, setMode] = useState<PersistenceMode>('local');

  useEffect(() => {
    let active = true;
    const client = getSupabase();
    if (!client) return;
    setMode('syncing');
    void client.auth.getUser().then(async ({ data }) => {
      if (!active || !data.user) { if (active) setMode('local'); return; }
      const { data: record, error } = await client.from('workspace_state').select('payload').eq('user_id', data.user.id).eq('scope', scope).eq('dataset_key', datasetKey).maybeSingle();
      if (!active) return;
      if (!error && record?.payload) { setValue(record.payload as T); localStorage.setItem(localKey, JSON.stringify(record.payload)); }
      setMode(error ? 'local' : 'cloud');
    });
    return () => { active = false; };
  }, [datasetKey, localKey, scope]);

  const save = useCallback((next: T) => {
    setValue(next);
    localStorage.setItem(localKey, JSON.stringify(next));
    const client = getSupabase();
    if (!client) { setMode('local'); return; }
    setMode('syncing');
    void client.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setMode('local'); return; }
      const { error } = await client.from('workspace_state').upsert({ user_id: data.user.id, scope, dataset_key: datasetKey, payload: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id,scope,dataset_key' });
      setMode(error ? 'local' : 'cloud');
    });
  }, [datasetKey, localKey, scope]);

  return { value, save, mode };
}
