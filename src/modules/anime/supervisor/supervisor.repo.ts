import { animeSupabase } from '../db/anime.supabase';
export async function readCommandState(projectId: string, commandId: string): Promise<any> {
  const { data: cmd } = await animeSupabase.from('api_commands').select('*').eq('project_id', projectId).eq('id', commandId).maybeSingle();
  if (!cmd) return { command: null, episode_state: null, pending_actions: [] };
  const ep = cmd.payload?.episode_no || cmd.payload?.episode_number;
  const [st, pa] = await Promise.all([ ep ? animeSupabase.from('episode_states').select('*').eq('project_id', projectId).eq('episode_no', ep).maybeSingle() : Promise.resolve({ data: null }), animeSupabase.from('pending_actions').select('*').eq('project_id', projectId) ]);
  return { command: cmd, episode_state: st.data, pending_actions: (pa.data ?? []).filter((p: any) => p.command_id === commandId || p.job_id === commandId || (ep && p.episode_no === ep)) };
}
export async function findDriftedCommands(staleMinutes = 10, limit = 25): Promise<any[]> {
  const cutoff = new Date(Date.now() - staleMinutes * 60000).toISOString();
  const { data } = await animeSupabase.from('api_commands').select('id, project_id').in('status', ['DISPATCHED', 'ACKNOWLEDGED', 'RECONCILING']).lt('created_at', cutoff).limit(limit);
  return data ?? [];
}
