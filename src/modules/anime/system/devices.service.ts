import { createHash, randomUUID } from 'node:crypto';
import { writeAudit } from '../audit/audit.writer';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
export async function registerFcmToken(userId: string, token: string, opts: any): Promise<any> { if (!token) throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Token required' }); const id = randomUUID(); const fp = createHash('sha256').update(token).digest('hex').slice(0, 16); await writeAudit({ project_id: opts.project_id, user_id: userId, workflow_name: 'DEVICE_REGISTRY', action: 'REGISTER_FCM_TOKEN', entity_type: 'FCM_DEVICE', entity_id: id, new_value: { platform: opts.platform, fp, token }, request_id: opts.request_id }); return { device_id: id, token_fingerprint: fp }; }
