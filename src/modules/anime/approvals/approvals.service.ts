import { randomUUID } from 'node:crypto';
import { writeAudit } from '../audit/audit.writer';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { clampLimit, type CursorPage, type CursorPaginationInput } from '../reads/reads.types';
import { type ApprovalRecord, ApprovalStatus, RESTRICTED_APPROVAL_TYPES } from './approvals.types';
export async function listApprovals(projectId: string, options: CursorPaginationInput & { status?: ApprovalStatus }): Promise<CursorPage<ApprovalRecord>> {
  const limit = clampLimit(options.limit);
  let query = animeSupabase.from('approval_decisions').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit + 1);
  if (options.status) query = query.eq('status', options.status);
  if (options.cursor) query = query.lt('created_at', options.cursor);
  const { data, error } = await query;
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'List failed', cause: error });
  const rows = (data ?? []) as ApprovalRecord[]; const hasMore = rows.length > limit; const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, next_cursor: hasMore && items.length > 0 ? items[items.length - 1].created_at : null };
}
export async function decideApproval(input: { project_id: string, approval_id: string, decision: ApprovalStatus.APPROVED | ApprovalStatus.REJECTED, expected_resource_version: number, reason: string, actor_user_id: string, request_id: string }): Promise<ApprovalRecord> {
  const { data: existing, error: fetchError } = await animeSupabase.from('approval_decisions').select('*').eq('project_id', input.project_id).eq('id', input.approval_id).maybeSingle<ApprovalRecord>();
  if (fetchError !== null) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Fetch failed', cause: fetchError });
  if (existing === null) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Not found.' });
  if (existing.status !== ApprovalStatus.PENDING) throw new AnimeError({ code: AnimeErrorCode.VERSION_CONFLICT, httpStatus: 409, message: 'Already decided.' });
  if (existing.resource_version !== input.expected_resource_version) throw new AnimeError({ code: AnimeErrorCode.VERSION_CONFLICT, httpStatus: 409, message: 'Version mismatch.' });
  if (RESTRICTED_APPROVAL_TYPES.has(existing.type) && existing.requested_by === input.actor_user_id) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, httpStatus: 403, message: 'Self-approval not allowed.' });
  const auditEventId = randomUUID(); const decidedAtIso = new Date().toISOString();
  const { data: updated, error: updateError } = await animeSupabase.from('approval_decisions').update({ status: input.decision, decision: input.decision, decision_reason: input.reason, decision_by: input.actor_user_id, decided_at: decidedAtIso, audit_event_id: auditEventId, updated_at: decidedAtIso }).eq('project_id', input.project_id).eq('id', input.approval_id).eq('resource_version', input.expected_resource_version).eq('status', ApprovalStatus.PENDING).select('*').maybeSingle<ApprovalRecord>();
  if (updateError !== null || updated === null) throw new AnimeError({ code: AnimeErrorCode.VERSION_CONFLICT, httpStatus: 409, message: 'Concurrent conflict.' });
  await writeAudit({ project_id: input.project_id, user_id: input.actor_user_id, workflow_name: 'APPROVAL_ENGINE', action: `APPROVAL_${input.decision}`, entity_type: existing.type, entity_id: existing.resource_id, new_value: { approval_id: updated.id, status: updated.status, decision: updated.decision }, reason: input.reason, request_id: input.request_id });
  return updated;
}
