import { type CommandIntent } from '../commands/commands.types';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
export async function preflightCheck(projectId: string, _intent: CommandIntent): Promise<boolean> {
  const { data: p } = await animeSupabase.from('projects').select('id, budget_ceiling').eq('id', projectId).maybeSingle();
  if (p && p.budget_ceiling !== null && Number(p.budget_ceiling) > 0) {
    const { data: r } = await animeSupabase.from('resource_reservations').select('estimated_cost, actual_cost, status').eq('project_id', projectId).in('status', ['PROPOSED', 'RESERVED', 'CONSUMED']);
    let c = 0; for (const row of r ?? []) { c += Number(row.status === 'CONSUMED' ? row.actual_cost || row.estimated_cost : row.estimated_cost); }
    if (c >= Number(p.budget_ceiling)) throw new AnimeError({ code: AnimeErrorCode.PAID_BUDGET_REQUIRED, message: 'Budget exhausted.' });
  }
  const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  await animeSupabase.from('api_commands').update({ status: 'FAILED' }).eq('project_id', projectId).in('status', ['QUEUED', 'DISPATCHED', 'ACKNOWLEDGED', 'RECONCILING']).lt('created_at', threeMinAgo);
  return true;
}
