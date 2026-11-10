import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
export enum AnimeErrorCode {
  NOT_FOUND = 'NOT_FOUND', AUTH_INVALID = 'AUTH_INVALID', PROJECT_FORBIDDEN = 'PROJECT_FORBIDDEN', TENANT_FORBIDDEN = 'TENANT_FORBIDDEN', TENANT_REQUIRED = 'TENANT_REQUIRED', VERSION_CONFLICT = 'VERSION_CONFLICT', IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT', MISSING_IDEMPOTENCY = 'MISSING_IDEMPOTENCY', APPROVAL_REQUIRED = 'APPROVAL_REQUIRED', PAID_BUDGET_REQUIRED = 'PAID_BUDGET_REQUIRED', QUOTA_DEFERRED = 'QUOTA_DEFERRED', QUOTA_EXCEEDED = 'QUOTA_EXCEEDED', PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE', PLATFORM_MANAGED_DISABLED = 'PLATFORM_MANAGED_DISABLED', REPLICATION_NOT_CONFIGURED = 'REPLICATION_NOT_CONFIGURED', STAGE_DEPENDENCY_BLOCKED = 'STAGE_DEPENDENCY_BLOCKED', OUTPUT_INVALID = 'OUTPUT_INVALID', QC_FAILED = 'QC_FAILED', WORKFLOW_CONTRACT_MISMATCH = 'WORKFLOW_CONTRACT_MISMATCH', CALLBACK_REPLAY = 'CALLBACK_REPLAY', CALLBACK_SIGNATURE_INVALID = 'CALLBACK_SIGNATURE_INVALID', MANUAL_REVIEW_REQUIRED = 'MANUAL_REVIEW_REQUIRED', INTERNAL = 'INTERNAL' }
export const ANIME_ERROR_SPEC_MAP: any = { [AnimeErrorCode.AUTH_INVALID]: { httpStatus: 401, defaultRetryable: false }, [AnimeErrorCode.PROJECT_FORBIDDEN]: { httpStatus: 403, defaultRetryable: false }, [AnimeErrorCode.TENANT_FORBIDDEN]: { httpStatus: 403, defaultRetryable: false }, [AnimeErrorCode.TENANT_REQUIRED]: { httpStatus: 409, defaultRetryable: false }, [AnimeErrorCode.VERSION_CONFLICT]: { httpStatus: 409, defaultRetryable: false }, [AnimeErrorCode.IDEMPOTENCY_CONFLICT]: { httpStatus: 409, defaultRetryable: false }, [AnimeErrorCode.MISSING_IDEMPOTENCY]: { httpStatus: 400, defaultRetryable: false }, [AnimeErrorCode.APPROVAL_REQUIRED]: { httpStatus: 403, defaultRetryable: false }, [AnimeErrorCode.PAID_BUDGET_REQUIRED]: { httpStatus: 402, defaultRetryable: false }, [AnimeErrorCode.QUOTA_DEFERRED]: { httpStatus: 429, defaultRetryable: true }, [AnimeErrorCode.QUOTA_EXCEEDED]: { httpStatus: 429, defaultRetryable: false }, [AnimeErrorCode.PROVIDER_UNAVAILABLE]: { httpStatus: 503, defaultRetryable: true }, [AnimeErrorCode.PLATFORM_MANAGED_DISABLED]: { httpStatus: 503, defaultRetryable: false }, [AnimeErrorCode.REPLICATION_NOT_CONFIGURED]: { httpStatus: 501, defaultRetryable: false }, [AnimeErrorCode.STAGE_DEPENDENCY_BLOCKED]: { httpStatus: 409, defaultRetryable: true }, [AnimeErrorCode.OUTPUT_INVALID]: { httpStatus: 422, defaultRetryable: false }, [AnimeErrorCode.QC_FAILED]: { httpStatus: 422, defaultRetryable: false }, [AnimeErrorCode.WORKFLOW_CONTRACT_MISMATCH]: { httpStatus: 502, defaultRetryable: false }, [AnimeErrorCode.CALLBACK_REPLAY]: { httpStatus: 409, defaultRetryable: false }, [AnimeErrorCode.CALLBACK_SIGNATURE_INVALID]: { httpStatus: 401, defaultRetryable: false }, [AnimeErrorCode.MANUAL_REVIEW_REQUIRED]: { httpStatus: 423, defaultRetryable: false }, [AnimeErrorCode.NOT_FOUND]: { httpStatus: 404, retryable: false },
  [AnimeErrorCode.INTERNAL]: { httpStatus: 500, defaultRetryable: true } };
export class AnimeError extends Error {
  public readonly code: AnimeErrorCode; public readonly httpStatus: number; public readonly retryable: boolean;
  constructor(options: { code: AnimeErrorCode, message: string, httpStatus?: number, retryable?: boolean, cause?: unknown }) {
    super(options.message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AnimeError'; const spec = ANIME_ERROR_SPEC_MAP[options.code] ?? ANIME_ERROR_SPEC_MAP[AnimeErrorCode.INTERNAL];
    this.code = options.code; this.httpStatus = options.httpStatus ?? spec.httpStatus; this.retryable = options.retryable ?? spec.defaultRetryable;
  }
}
export function animeErrorHandler(error: FastifyError | AnimeError | Error, request: FastifyRequest, reply: FastifyReply): void {
  const requestId = (request as any).anime?.request_id ?? randomUUID();
  if (!reply.hasHeader('X-Request-Id')) reply.header('X-Request-Id', requestId);
  if (error instanceof AnimeError) return void reply.status(error.httpStatus).send({ error: { code: error.code, message: error.message, retryable: error.retryable, request_id: requestId } });
  const statusCode = typeof (error as any).statusCode === 'number' ? (error as any).statusCode : 0;
  if (statusCode >= 400 && statusCode < 500) {
    const code = (error as any).validation ? 'VALIDATION_ERROR' : ((error as any).code ?? 'BAD_REQUEST');
    return void reply.status(statusCode).send({ error: { code, message: error.message, retryable: false, request_id: requestId } });
  }
  request.log.error({ err: error, request_id: requestId }, '[AnimeEngine] Unhandled error');
  void reply.status(500).send({ error: { code: AnimeErrorCode.INTERNAL, message: 'Internal error.', retryable: true, request_id: requestId } });
}
