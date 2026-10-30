import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { clampLimit, type CursorPage, type CursorPaginationInput } from './reads.types';
function extractEpisodeNo(payload: any): number | null { if (payload === null || payload === undefined) return null; const ep = payload.episode_no ?? payload.episode_number; return typeof ep === 'number' && Number.isFinite(ep) ? ep : null; }
export async function listJobs(projectId: string, pagination: CursorPaginationInput): Promise<CursorPage<any>> {
  const limit = clampLimit(pagination.limit);
  let query = animeSupabase.from('api_commands').select('id, project_id, intent, payload, status, created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit + 1);
  if (pagination.cursor) query = query.lt('created_at', pagination.cursor);
  const { data: rows, error: cmdError } = await query;
  if (cmdError) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'List failed', cause: cmdError });
  const cmds = rows ?? []; const hasMore = cmds.length > limit; const sliced = hasMore ? cmds.slice(0, limit) : cmds;
  const [states, pending] = await Promise.all([ animeSupabase.from('episode_states').select('*').eq('project_id', projectId), animeSupabase.from('pending_actions').select('*').eq('project_id', projectId) ]);
  const statesByEp = new Map(); for (const st of (states.data ?? [])) if (typeof st.episode_no === 'number') statesByEp.set(st.episode_no, st);
  const allPending = pending.data ?? [];
  const items = sliced.map((cmd: any) => { const epNo = extractEpisodeNo(cmd.payload); return { id: cmd.id, project_id: cmd.project_id, intent: cmd.intent, status: cmd.status, episode_no: epNo, created_at: cmd.created_at, episode_state: epNo !== null ? statesByEp.get(epNo) ?? null : null, pending_actions: allPending.filter((pa: any) => pa.command_id === cmd.id || pa.job_id === cmd.id || (epNo !== null && pa.episode_no === epNo)) }; });
  return { items, next_cursor: hasMore && items.length > 0 ? items[items.length - 1].created_at : null };
}
export async function getJob(projectId: string, jobId: string): Promise<any> {
  const { data: cmd, error } = await animeSupabase.from('api_commands').select('id, project_id, intent, payload, status, created_at').eq('project_id', projectId).eq('id', jobId).maybeSingle();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Fetch failed', cause: error });
  if (cmd === null) throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, httpStatus: 404, message: 'Job not found.' });
  const epNo = extractEpisodeNo(cmd.payload);
  const [stateRes, pendingRes] = await Promise.all([ epNo !== null ? animeSupabase.from('episode_states').select('*').eq('project_id', projectId).eq('episode_no', epNo).maybeSingle() : Promise.resolve({ data: null }), animeSupabase.from('pending_actions').select('*').eq('project_id', projectId) ]);
  const pendingList = (pendingRes.data ?? []).filter((pa: any) => pa.command_id === cmd.id || pa.job_id === cmd.id || (epNo !== null && pa.episode_no === epNo));
  return { id: cmd.id, project_id: cmd.project_id, intent: cmd.intent, status: cmd.status, episode_no: epNo, created_at: cmd.created_at, episode_state: stateRes.data ?? null, pending_actions: pendingList };
}
