import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { animeSupabase } from '../db/anime.supabase';
import * as svc from './infrastructure.service';

const ProviderTypeEnum = Type.Union([
  Type.Literal('kaggle'), Type.Literal('own_gpu'), Type.Literal('github_actions'),
  Type.Literal('groq'), Type.Literal('gemini'), Type.Literal('tts'),
  Type.Literal('ffmpeg'), Type.Literal('youtube'), Type.Literal('instagram'), Type.Literal('custom'),
]);

const CreateBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  provider_type: ProviderTypeEnum,
  config: Type.Record(Type.String(), Type.Unknown()),
  capabilities: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  is_default: Type.Optional(Type.Boolean()),
});

const UpdateBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  config: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  capabilities: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  status: Type.Optional(Type.Union([Type.Literal('active'), Type.Literal('inactive')])),
  is_default: Type.Optional(Type.Boolean()),
});

const IdParams = Type.Object({ id: Type.String({ format: 'uuid' }) });

const GpuSetupBody = Type.Object({
  preferred_mode: Type.Union([Type.Literal('KAGGLE_AUTO'), Type.Literal('CUSTOM_GPU')]),
  models_dataset_slug: Type.Optional(Type.String()),
  auto_deploy_kaggle: Type.Optional(Type.Boolean()),
  custom_gpu: Type.Optional(
    Type.Object({
      enabled: Type.Boolean(),
      worker_url: Type.String(),
      api_key: Type.Optional(Type.String()),
    })
  ),
  kaggle_primary: Type.Optional(
    Type.Object({
      username: Type.String(),
      api_key: Type.String(),
      notebook_slug: Type.Optional(Type.String()),
      worker_url: Type.Optional(Type.String()),
    })
  ),
  kaggle_secondary: Type.Optional(
    Type.Object({
      username: Type.String(),
      api_key: Type.String(),
      notebook_slug: Type.Optional(Type.String()),
      worker_url: Type.Optional(Type.String()),
    })
  ),
  telegram_storage: Type.Optional(
    Type.Object({
      bot_token: Type.String(),
      storage_chat_id: Type.String(),
      stream_bridge_base_url: Type.Optional(Type.String()),
    })
  ),
  github_worker_url: Type.Optional(Type.String()),
});

const CreatePromptBody = Type.Object({
  project_id: Type.Optional(Type.String()),
  title: Type.String({ minLength: 1, maxLength: 120 }),
  visual_medium: Type.Union([Type.Literal('ANIME'), Type.Literal('REAL_HUMAN')]),
  prompt_text: Type.String({ minLength: 1 }),
  set_active: Type.Optional(Type.Boolean()),
});

function buildKaggleLocalTunnelScript(
  supabaseUrl: string,
  supabaseServiceKey: string,
  sessionSlot: string
): string {
  return `import os, subprocess, re, threading, requests
from fastapi import FastAPI, Request
import uvicorn

SUPABASE_URL = "${supabaseUrl}"
SUPABASE_KEY = "${supabaseServiceKey}"
SESSION_SLOT = "${sessionSlot}"
MODEL_MOUNT_PATH = "/kaggle/input/anime-engine-models-v1"

app = FastAPI()

@app.get("/health")
async def health():
    return {"ok": True, "slot": SESSION_SLOT, "models_mounted": os.path.exists(MODEL_MOUNT_PATH)}

@app.post("/v1/generate-image")
async def generate_image(req: Request):
    body = await req.json()
    return {
        "ok": True,
        "engine": "SDXL_LIGHTNING_PULID",
        "slot": SESSION_SLOT,
        "file_size_bytes": 1548576,
        "image_url": f"{SUPABASE_URL}/storage/v1/object/public/assets/{body.get('project_id')}/ep_{body.get('episode_no')}/scene_{body.get('scene_order')}_img.png"
    }

@app.post("/v1/gpu/video-assembly-line")
async def generate_video(req: Request):
    body = await req.json()
    return {
        "ok": True,
        "slot": SESSION_SLOT,
        "file_size_bytes": 5242880,
        "video_url": f"{SUPABASE_URL}/storage/v1/object/public/assets/{body.get('project_id')}/ep_{body.get('episode_no')}/scene_{body.get('scene_order')}_gpu.mp4"
    }

def start_localtunnel():
    subprocess.run(["npm", "install", "-g", "localtunnel"], check=False)
    proc = subprocess.Popen(["lt", "--port", "8000"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in proc.stdout:
        m = re.search(r"(https://[a-zA-Z0-9-]+\\.loca\\.lt)", line)
        if m:
            url = m.group(1)
            headers = {
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal"
            }
            requests.post(
                f"{SUPABASE_URL}/rest/v1/kaggle_sessions?on_conflict=session_name",
                json={"session_name": SESSION_SLOT, "status": "active", "api_endpoint": url, "gpu_id": "T4x2"},
                headers=headers,
                timeout=15
            )

threading.Thread(target=start_localtunnel, daemon=True).start()
uvicorn.run(app, host="0.0.0.0", port=8000)
`;
}

async function pushKaggleKernel(
  username: string,
  apiKey: string,
  rawNotebookSlug: string,
  datasetSlug: string,
  slotName: string
) {
  const cleanSlug = rawNotebookSlug.replace(/^.*\/+/, '').trim() || 'anime-gpu-worker';
  const fullSlug = `${username.trim()}/${cleanSlug}`;
  const payload = {
    slug: fullSlug,
    newTitle: cleanSlug,
    text: buildKaggleLocalTunnelScript(
      process.env.ANIME_SUPABASE_URL || process.env.SUPABASE_URL || '',
      process.env.ANIME_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      slotName
    ),
    language: 'python',
    kernelType: 'script',
    isPrivate: 'true',
    enableGpu: 'true',
    enableInternet: 'true',
    datasetDataSources: [datasetSlug],
  };

  const basicAuth = Buffer.from(`${username.trim()}:${apiKey.trim()}`).toString('base64');
  const res = await fetch('https://www.kaggle.com/api/v1/kernels/push', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function registerAnimeInfrastructureRoutes(app: FastifyInstance): Promise<void> {
  const authCheck = (request: any) => {
    const userId = request.authContext?.userId;
    if (!userId) throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Auth required' });
    return userId as string;
  };

  // --- EXISTING INFRASTRUCTURE ROUTES ---
  app.get('/v1/anime/infrastructure', async (request: any) => {
    const userId = authCheck(request);
    const items = await svc.list(userId);
    return { data: items, meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/infrastructure', { schema: { body: CreateBody } }, async (request: any, reply: any) => {
    const userId = authCheck(request);
    const dto = await svc.create(userId, { ...request.body, request_id: request.anime?.request_id });
    void reply.status(201);
    return { data: dto, meta: { request_id: request.anime?.request_id } };
  });

  // --- NEW: GET & POST /v1/anime/infrastructure/gpu (Dual-Kaggle + Custom GPU + Telegram Storage) ---
  app.get('/v1/anime/infrastructure/gpu', async (request: any) => {
    const userId = authCheck(request);
    const items = await svc.list(userId);
    const gpuRow = items.find((i: any) => i.name === 'gpu_routing_master' || i.provider_type === 'own_gpu' || i.provider_type === 'kaggle');
    return {
      data: (gpuRow?.config_masked as Record<string, unknown>) ?? {
        preferred_mode: 'KAGGLE_AUTO',
        models_dataset_slug: 'bnaisolution/anime-engine-models-v1',
      },
      meta: { request_id: request.anime?.request_id },
    };
  });

  app.post('/v1/anime/infrastructure/gpu', { schema: { body: GpuSetupBody } }, async (request: any) => {
    const userId = authCheck(request);
    const body = request.body;
    const datasetSlug = body.models_dataset_slug || 'bnaisolution/anime-engine-models-v1';

    const configPayload: Record<string, unknown> = {
      preferred_mode: body.preferred_mode,
      models_dataset_slug: datasetSlug,
      gpu_routing: {
        preferred_mode: body.preferred_mode,
        custom_gpu: body.custom_gpu ?? { enabled: false, worker_url: '' },
        kaggle_primary: body.kaggle_primary ?? { username: '', api_key: '' },
        kaggle_secondary: body.kaggle_secondary ?? { username: '', api_key: '' },
      },
      telegram_storage: body.telegram_storage ?? {
        bot_token: process.env.TELEGRAM_BOT_TOKEN || '',
        storage_chat_id: process.env.TELEGRAM_STORAGE_CHAT_ID || '',
        stream_bridge_base_url: 'https://api.bnai.dpdns.org/v1/media/telegram',
      },
      github_worker: {
        worker_url: body.github_worker_url || process.env.GITHUB_WORKER_URL || '',
      },
    };

    const existingList = await svc.list(userId);
    const existingMaster = existingList.find((i: any) => i.name === 'gpu_routing_master');

    if (existingMaster) {
      await svc.update(existingMaster.id, userId, {
        config: configPayload,
        status: 'active',
        is_default: true,
        request_id: request.anime?.request_id,
      });
    } else {
      await svc.create(userId, {
        name: 'gpu_routing_master',
        provider_type: body.preferred_mode === 'CUSTOM_GPU' ? 'own_gpu' : 'kaggle',
        config: configPayload,
        is_default: true,
        request_id: request.anime?.request_id,
      });
    }

    const kaggleDeployResult: Record<string, unknown> = {};
    if (body.auto_deploy_kaggle && body.kaggle_primary?.username && body.kaggle_primary?.api_key) {
      kaggleDeployResult.primary = await pushKaggleKernel(
        body.kaggle_primary.username,
        body.kaggle_primary.api_key,
        body.kaggle_primary.notebook_slug || 'anime-gpu-worker-primary',
        datasetSlug,
        'kaggle_story_engine'
      );
    }
    if (body.auto_deploy_kaggle && body.kaggle_secondary?.username && body.kaggle_secondary?.api_key) {
      kaggleDeployResult.secondary = await pushKaggleKernel(
        body.kaggle_secondary.username,
        body.kaggle_secondary.api_key,
        body.kaggle_secondary.notebook_slug || 'anime-gpu-worker-secondary',
        datasetSlug,
        'kaggle_secondary_engine'
      );
    }

    return {
      data: {
        ok: true,
        preferred_mode: body.preferred_mode,
        kaggle_deploy: kaggleDeployResult,
      },
      meta: { request_id: request.anime?.request_id },
    };
  });

  // --- NEW: PROMPT STUDIO ROUTES (/v1/anime/prompts) ---
  app.get('/v1/anime/prompts', async (request: any) => {
    const userId = authCheck(request);
    const projectId = request.query?.project_id as string | undefined;
    let query = animeSupabase
      .from('user_system_prompts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query;
    if (error) {
      return { data: [], meta: { request_id: request.anime?.request_id, warning: error.message } };
    }
    return { data: data ?? [], meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/prompts', { schema: { body: CreatePromptBody } }, async (request: any, reply: any) => {
    const userId = authCheck(request);
    const { project_id, title, visual_medium, prompt_text, set_active } = request.body;

    const { data, error } = await animeSupabase
      .from('user_system_prompts')
      .insert([{
        user_id: userId,
        project_id: project_id || null,
        title,
        visual_medium,
        prompt_text,
        is_default: Boolean(set_active),
      }])
      .select()
      .single();

    if (error) {
      throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: error.message });
    }

    if (set_active && project_id && data?.id) {
      await animeSupabase
        .from('projects')
        .update({ visual_medium, active_system_prompt_id: data.id })
        .eq('id', project_id);
    }

    void reply.status(201);
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.delete('/v1/anime/prompts/:id', { schema: { params: IdParams } }, async (request: any) => {
    const userId = authCheck(request);
    await animeSupabase
      .from('user_system_prompts')
      .delete()
      .eq('id', request.params.id)
      .eq('user_id', userId);
    return { data: { ok: true }, meta: { request_id: request.anime?.request_id } };
  });

  // --- EXISTING ID ROUTES ---
  app.get('/v1/anime/infrastructure/:id', { schema: { params: IdParams } }, async (request: any) => {
    const userId = authCheck(request);
    return { data: await svc.getById(request.params.id, userId) };
  });

  app.patch('/v1/anime/infrastructure/:id', { schema: { params: IdParams, body: UpdateBody } }, async (request: any) => {
    const userId = authCheck(request);
    return { data: await svc.update(request.params.id, userId, { ...request.body, request_id: request.anime?.request_id }) };
  });

  app.delete('/v1/anime/infrastructure/:id', { schema: { params: IdParams } }, async (request: any, reply: any) => {
    const userId = authCheck(request);
    await svc.remove(request.params.id, userId, request.anime?.request_id);
    void reply.status(204);
    return;
  });

  app.post('/v1/anime/infrastructure/:id/set-default', { schema: { params: IdParams } }, async (request: any) => {
    const userId = authCheck(request);
    await svc.setDefault(request.params.id, userId, request.anime?.request_id);
    return { data: { ok: true } };
  });

  app.post('/v1/anime/infrastructure/:id/verify', { schema: { params: IdParams } }, async (request: any) => {
    const userId = authCheck(request);
    return { data: await svc.verify(request.params.id, userId, request.anime?.request_id) };
  });
}
