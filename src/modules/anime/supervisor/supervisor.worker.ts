import { claimBatch, markDeadLetter, markDispatched, markFailed } from '../outbox/outbox.repo';
import { computeExponentialBackoffIso } from '../outbox/outbox.dispatcher';
import { findDriftedCommands } from './supervisor.repo';
import { reconcileCommand } from './supervisor.service';
const MAX_ATTEMPTS = 5;
export class SupervisorWorker {
  private t1: any = null; private t2: any = null; private busy = false;
  public start(poll = 2500, drift = 60000): void { if (!this.t1) { this.t1 = setInterval(() => void this.processReconcileOutbox(), poll); void this.processReconcileOutbox(); } if (!this.t2) { this.t2 = setInterval(() => void this.runDriftScan(), drift); } }
  public stop(): void { if (this.t1) clearInterval(this.t1); if (this.t2) clearInterval(this.t2); }
  public async processReconcileOutbox(): Promise<void> {
    if (this.busy) return; this.busy = true;
    try { const evs = await claimBatch('reconcile_command', 15); for (const ev of evs) { try { await reconcileCommand({ project_id: ev.payload.project_id, command_id: ev.payload.command_id, callback_payload: ev.payload.callback_payload }); await markDispatched(ev.id); } catch (e: any) { if (ev.attempts >= MAX_ATTEMPTS) await markDeadLetter(ev.id, ev.attempts, e.message); else await markFailed(ev.id, ev.attempts, computeExponentialBackoffIso(ev.attempts), e.message); } } } catch (e) { console.error(e); } finally { this.busy = false; }
  }
  public async runDriftScan(): Promise<void> { try { const d = await findDriftedCommands(10, 25); for (const i of d) await reconcileCommand({ project_id: i.project_id, command_id: i.id }); } catch (e) { console.error(e); } }
}
export const supervisorWorker = new SupervisorWorker();
