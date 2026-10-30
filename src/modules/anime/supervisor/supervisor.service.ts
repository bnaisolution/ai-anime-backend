import { writeAudit } from '../audit/audit.writer';
import { CommandStatus } from '../commands/commands.types';
import { animeSupabase } from '../db/anime.supabase';
import { readCommandState } from './supervisor.repo';
export async function reconcileCommand(input: { project_id: string, command_id: string, callback_payload?: any, request_id?: string }): Promise<any> {
  const snap = await readCommandState(input.project_id, input.command_id);
  if (snap.command === null) return { command_id: input.command_id, next_status: CommandStatus.FAILED };
  const prev = snap.command.status; const cb = input.callback_payload?.status?.toUpperCase(); const ep = snap.episode_state?.current_state?.toUpperCase();
  let next = CommandStatus.RECONCILING;
  if (['SUCCEEDED', 'COMPLETED'].includes(cb) || ['COMPLETED', 'PUBLISHED'].includes(ep)) next = CommandStatus.SUCCEEDED;
  else if (['FAILED', 'ERROR'].includes(cb) || ep?.endsWith('_FAILED')) next = CommandStatus.FAILED;
  else if (cb === 'MANUAL_REVIEW' || snap.pending_actions.length > 0) next = CommandStatus.MANUAL_REVIEW;
  if (next !== prev) {
    await animeSupabase.from('api_commands').update({ status: next }).eq('project_id', input.project_id).eq('id', input.command_id);
    await writeAudit({ project_id: input.project_id, user_id: snap.command.user_id, workflow_name: 'SUPERVISOR_RECONCILER', action: 'COMMAND_STATE_RECONCILED', entity_type: 'API_COMMAND', entity_id: input.command_id, previous_value: { status: prev }, new_value: { status: next }, request_id: input.request_id });
    if (next === CommandStatus.SUCCEEDED && input.callback_payload) {
      const cb: any = input.callback_payload;
      const epNo = snap.episode_state?.episode_no || snap.command.payload?.episode_no || snap.command.payload?.episode_number;
      const vUrl = cb.final_video_url || cb.master_video_url || cb.output_media?.final_video_url || cb.output_media?.master_video_url || null;
      const aUrl = cb.full_audio_url || cb.output_media?.full_audio_url || null;
      if (epNo && (vUrl || aUrl)) {
        await animeSupabase.from('episodes').update({
          output_media: {
            final_video_url: vUrl,
            full_audio_url: aUrl,
            thumbnail_url: cb.thumbnail_url || cb.output_media?.thumbnail_url || null,
            rendered_at: new Date().toISOString()
          }
        }).eq('project_id', input.project_id).eq('episode_no', Number(epNo));
        await writeAudit({ project_id: input.project_id, user_id: snap.command.user_id, workflow_name: 'SUPERVISOR_MEDIA_SAVE', action: 'EPISODE_MEDIA_SAVED', entity_type: 'EPISODE', entity_id: String(epNo), new_value: { final_video_url: vUrl, full_audio_url: aUrl }, request_id: input.request_id });
      }
    }
  }
  return { command_id: input.command_id, next_status: next };
}
