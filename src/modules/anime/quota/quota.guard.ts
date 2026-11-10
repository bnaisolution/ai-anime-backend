import { writeAudit } from '../audit/audit.writer';
import { extractUserId } from '../auth/project-guard';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { assertQuotaAvailable } from './quota.service';

export function enforceTenantQuota(units = 1) {
  return async function quotaPreHandler(request: any): Promise<void> {
    const tenantId = request?.anime?.tenant_id;
    if (!tenantId) return;
    const userId = extractUserId(request);
    if (!userId) throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Auth missing' });
    try {
      await assertQuotaAvailable(userId, tenantId, units);
    } catch (error) {
      if (error instanceof AnimeError && error.code === AnimeErrorCode.QUOTA_EXCEEDED) {
        await writeAudit({
          project_id: request?.anime?.project_id ?? null,
          user_id: userId,
          workflow_name: 'QUOTA',
          action: 'QUOTA_DENIED',
          entity_type: 'TENANT',
          entity_id: tenantId,
          reason: error.message,
          request_id: request?.anime?.request_id,
        });
      }
      throw error;
    }
  };
}
