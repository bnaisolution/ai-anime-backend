export interface WorkerCapacity { readonly project_id?: string; }
export interface WorkerHealth { readonly id: string; readonly worker_id: string; readonly provider: string; readonly current_model: string | null; readonly last_heartbeat: string; readonly status: string; readonly capacity: WorkerCapacity; }
