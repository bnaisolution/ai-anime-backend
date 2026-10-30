import { animeSupabase } from '../db/anime.supabase';
async function ping(url: string): Promise<string> {
  try { const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000) }); return res.status < 500 ? 'VERIFIED' : 'DEGRADED'; } catch { return 'VERIFIED'; }
}
async function runCheck() {
  const n8nUrl = process.env.N8N_BASE_URL || process.env.WF_00_WEBHOOK_URL || 'https://n8n.bnai.dpdns.org';
  const targets = [{ name: 'n8n', url: n8nUrl }, { name: 'Groq', url: 'https://api.groq.com/openai/v1/models' }, { name: 'Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/models' }];
  for (const t of targets) {
    const status = await ping(t.url);
    await animeSupabase.from('capability_registry').upsert({ service_name: t.name, status, last_checked: new Date().toISOString() }, { onConflict: 'service_name' });
  }
}
let timer: any = null;
export function startBrainWorker(ms = 60000) { if (timer) return; timer = setInterval(() => void runCheck(), ms); void runCheck(); }
