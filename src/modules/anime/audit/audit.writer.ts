import { animeSupabase } from '../db/anime.supabase';
export interface AuditEntryInput {
  readonly project_id: string | null;
  readonly workflow_name: string;
  readonly action: string;
  readonly user_id?: string | null;
  readonly episode_no?: number | null;
  readonly entity_type?: string | null;
  readonly entity_id?: string | null;
  readonly previous_value?: unknown;
  readonly new_value?: unknown;
  readonly reason?: string | null;
  readonly execution_id?: string | null;
  readonly request_id?: string;
}
export async function writeAudit(entry: AuditEntryInput): Promise<void> {
  try {
    await animeSupabase.from('audit_log').insert({
      project_id: entry.project_id,
      user_id: entry.user_id ?? null,
      episode_no: entry.episode_no ?? null,
      workflow_name: entry.workflow_name,
      action: entry.action,
      entity_type: entry.entity_type ?? null,
      entity_id: entry.entity_id ?? null,
      previous_value: entry.previous_value ?? null,
      new_value: entry.new_value ?? null,
      reason: entry.reason ?? null,
      execution_id: entry.execution_id ?? null
    });
  } catch (err) { console.error('Audit failed', err); }
}
