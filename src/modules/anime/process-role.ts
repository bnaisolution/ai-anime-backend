import { animeEnv, type AnimeProcessRole } from './config/anime.env';
import { outboxDispatcher } from './outbox/outbox.dispatcher';
import { supervisorWorker } from './supervisor/supervisor.worker';

export function startRole(role: AnimeProcessRole = animeEnv.ANIME_PROCESS_ROLE): void {
  const started: string[] = [];
  if (role === 'api' || role === 'dispatcher') {
    outboxDispatcher.start();
    started.push('dispatcher');
  }
  if (role === 'api' || role === 'supervisor') {
    supervisorWorker.start();
    started.push('supervisor');
  }
  console.log(`[AnimeEngine] Background workers started: ${started.join(', ') || 'none'} (role=${role})`);
}
