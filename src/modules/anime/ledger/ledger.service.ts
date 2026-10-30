import { writeAudit } from '../audit/audit.writer';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { insertReservation, sumActiveReservations, updateStatus } from './ledger.repo';
import { ReservationStatus } from './ledger.types';
export async function checkBudgetCeiling(projectId: string, addCost = 0): Promise<any> {
  const [p, t] = await Promise.all([ animeSupabase.from('projects').select('id, budget_ceiling').eq('id', projectId).maybeSingle(), sumActiveReservations(projectId) ]);
  if (p.data === null) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Not found' });
  const ceiling = p.data.budget_ceiling ? Number(p.data.budget_ceiling) : null; const proj = t.total_committed_cost + addCost;
  if (ceiling !== null && proj > ceiling) throw new AnimeError({ code: AnimeErrorCode.PAID_BUDGET_REQUIRED, message: `Exceeds budget (${ceiling})` });
  return { project_id: projectId, budget_ceiling: ceiling, ...t, remaining_headroom: ceiling ? Math.max(0, ceiling - t.total_committed_cost) : null };
}
export async function reserve(input: any): Promise<any> { await checkBudgetCeiling(input.project_id, input.estimated_cost); const r = await insertReservation({ ...input, status: ReservationStatus.RESERVED, expires_at: new Date(Date.now() + (input.ttl_seconds || 900) * 1000).toISOString() }); await writeAudit({ project_id: input.project_id, workflow_name: 'LEDGER', action: 'RESOURCE_RESERVED', entity_type: 'RESERVATION', entity_id: r.id, new_value: r }); return r; }
export async function consume(input: any): Promise<any> { const r = await updateStatus(input.project_id, input.reservation_id, ReservationStatus.CONSUMED, input.actual_cost); await writeAudit({ project_id: input.project_id, workflow_name: 'LEDGER', action: 'RESOURCE_CONSUMED', entity_type: 'RESERVATION', entity_id: r.id }); return r; }
export async function release(input: any): Promise<any> { const r = await updateStatus(input.project_id, input.reservation_id, ReservationStatus.RELEASED, 0); await writeAudit({ project_id: input.project_id, workflow_name: 'LEDGER', action: 'RESOURCE_RELEASED', entity_type: 'RESERVATION', entity_id: r.id }); return r; }
