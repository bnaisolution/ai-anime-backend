create extension if not exists pgcrypto;

create table if not exists public.worker_jobs (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null,
  project_id uuid not null,
  user_id uuid not null,
  tenant_id uuid,
  worker_kind text not null default 'cpu',
  path text not null,
  payload jsonb,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  worker_id text,
  lease_expires_at timestamptz,
  attempts integer not null default 0,
  result jsonb,
  error text,
  http_status integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists worker_jobs_claim_idx
  on public.worker_jobs (created_at)
  where status = 'queued';

create index if not exists worker_jobs_project_idx
  on public.worker_jobs (project_id, created_at desc);

alter table public.worker_jobs enable row level security;
revoke all on public.worker_jobs from anon, authenticated;
grant all on public.worker_jobs to service_role;

create or replace function public.claim_worker_job(p_worker_id text, p_lease_seconds integer default 1800)
returns setof public.worker_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.worker_jobs;
begin
  update public.worker_jobs
    set status = 'queued',
        worker_id = null,
        lease_expires_at = null,
        updated_at = now()
    where status = 'processing'
      and lease_expires_at is not null
      and lease_expires_at < now();

  select *
    into v_job
    from public.worker_jobs
    where status = 'queued'
    order by created_at asc
    for update skip locked
    limit 1;

  if not found then
    return;
  end if;

  update public.worker_jobs
    set status = 'processing',
        worker_id = p_worker_id,
        lease_expires_at = now() + make_interval(secs => greatest(60, p_lease_seconds)),
        attempts = attempts + 1,
        updated_at = now()
    where id = v_job.id
    returning * into v_job;

  return next v_job;
end;
$$;

revoke all on function public.claim_worker_job(text, integer) from public, anon, authenticated;
grant execute on function public.claim_worker_job(text, integer) to service_role;
