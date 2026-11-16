import { animeEnv, type AnimeProcessRole } from './config/anime.env';
import { outboxDispatcher } from './outbox/outbox.dispatcher';
import { supervisorWorker } from './supervisor/supervisor.worker';

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function startRole(role: AnimeProcessRole = animeEnv.ANIME_PROCESS_ROLE): void {
  const started: string[] = [];
  if (role === 'api' || role === 'dispatcher') {
    outboxDispatcher.start(positiveNumber(process.env.ANIME_OUTBOX_POLL_MS, 10000));
    started.push('dispatcher');
  }
  if (role === 'api' || role === 'supervisor') {
    supervisorWorker.start(positiveNumber(process.env.ANIME_SUPERVISOR_POLL_MS, 10000));
    started.push('supervisor');
  }
  console.log(`[AnimeEngine] Background workers started: ${started.join(', ') || 'none'} (role=${role})`);
}
