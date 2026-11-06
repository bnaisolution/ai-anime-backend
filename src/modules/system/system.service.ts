import type { FastifyInstance } from 'fastify';

export interface CrashReportInput {
  task_id?: string;
  error_type: string;
  error_message: string;
  recovery_action?: string;
  stack_trace?: string;
  app_version?: string;
  device_info?: Record<string, unknown>;
}

export async function recordCrash(fastify: FastifyInstance, input: CrashReportInput) {
  const { data, error } = await fastify.supabase
    .from('error_recovery_records')
    .insert({
      task_id: input.task_id ?? (await fastify.supabase.from('tasks').select('id').limit(1)).data?.[0]?.id,
      error_type: input.error_type,
      error_message: input.error_message,
      recovery_action: input.recovery_action ?? 'crash_handler',
      recovery_status: 'pending',
      retry_number: 0,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(`recordCrash failed: ${error.message}`);

  await fastify.supabase.from('audit_events').insert({
    event_type: 'crash_report',
    action: 'crash_reported',
    status: 'recorded',
    details: {
      error_type: input.error_type,
      app_version: input.app_version ?? 'unknown',
      device_info: input.device_info ?? {},
      stack_trace: input.stack_trace ?? null,
    },
    created_at: new Date().toISOString(),
  }).select();

  return data;
}

export async function getStableVersion(fastify: FastifyInstance) {
  const { data, error } = await fastify.supabase
    .from('audit_events')
    .select('details, created_at')
    .eq('event_type', 'version_release')
    .eq('status', 'stable')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getStableVersion failed: ${error.message}`);

  const details = (data?.details ?? {}) as Record<string, unknown>;
  return {
    version: (details.version as string) ?? process.env.STABLE_APP_VERSION ?? '1.0.0',
    released_at: data?.created_at ?? null,
    changelog: (details.changelog as string) ?? '',
  };
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, { status: string; latency_ms?: number; error?: string }>;
  timestamp: string;
}

export async function checkHealth(fastify: FastifyInstance): Promise<HealthCheckResult> {
  const checks: HealthCheckResult['checks'] = {};

  const dbStart = Date.now();
  try {
    const { error } = await fastify.supabase
      .from('audit_events')
      .select('id', { count: 'exact', head: true })
      .limit(1);
    if (error) throw error;
    checks.database = { status: 'up', latency_ms: Date.now() - dbStart };
  } catch (e: any) {
    checks.database = { status: 'down', latency_ms: Date.now() - dbStart, error: e.message };
  }

  try {
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count, error } = await fastify.supabase
      .from('error_recovery_records')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since);
    if (error) throw error;
    const c = count ?? 0;
    checks.crash_rate = { status: c > 10 ? 'high' : 'normal' };
  } catch (e: any) {
    checks.crash_rate = { status: 'unknown', error: e.message };
  }

  const anyDown = Object.values(checks).some((c) => c.status === 'down');
  const anyWarn = Object.values(checks).some((c) => ['high', 'unknown'].includes(c.status));
  const status: HealthCheckResult['status'] = anyDown ? 'unhealthy' : anyWarn ? 'degraded' : 'healthy';

  return { status, checks, timestamp: new Date().toISOString() };
}
