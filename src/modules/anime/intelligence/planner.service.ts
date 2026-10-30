import { COMMAND_INTENT_WF_MAP, type CommandIntent } from '../commands/commands.types';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
export async function preflightCheck(projectId: string, intent: CommandIntent): Promise<boolean> {
  const { data: p } = await animeSupabase.from('projects').select('id, budget_ceiling').eq('id', projectId).maybeSingle();
  if (p && p.budget_ceiling !== null) { const { data: r } = await animeSupabase.from('resource_reservations').select('estimated_cost, actual_cost, status').eq('project_id', projectId).in('status', ['PROPOSED', 'RESERVED', 'CONSUMED']); let c = 0; for (const row of (r ?? [])) c += Number(row.status === 'CONSUMED' ? row.actual_cost || row.estimated_cost : row.estimated_cost); if (c >= Number(p.budget_ceiling)) throw new AnimeError({ code: AnimeErrorCode.PAID_BUDGET_REQUIRED, message: 'Budget exhausted.' }); }
  const { data: a } = await animeSupabase.from('api_commands').select('id').eq('project_id', projectId).in('status', ['QUEUED', 'DISPATCHED', 'ACKNOWLEDGED', 'RECONCILING']).limit(1);
  if (a && a.length > 0 && intent !== ('QUICK_GENERATE_REEL' as any)) throw new AnimeError({ code: AnimeErrorCode.STAGE_DEPENDENCY_BLOCKED, message: 'Active job exists.' });
  const { data: cap } = await animeSupabase.from('capability_registry').select('service_name, status').in('service_name', [COMMAND_INTENT_WF_MAP[intent] || 'WF-00', 'n8n']);
  if ((cap ?? []).some((x: any) => x.status.toUpperCase() === 'DEGRADED')) throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'Service degraded.' });
  return true;
}
