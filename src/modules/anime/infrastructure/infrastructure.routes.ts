import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { requireProjectRole } from '../auth/project-guard';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { animeSupabase } from '../db/anime.supabase';
import * as svc from './infrastructure.service';

const PROMPT_READ_ROLES = ['owner', 'admin', 'editor', 'reviewer', 'viewer'];
const PROMPT_WRITE_ROLES = ['owner', 'admin', 'editor'];

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
  custom_gpu: Type.Optional(Type.Object({ enabled: Type.Boolean(), worker_url: Type.String(), api_key: Type.Optional(Type.String()) })),
  kaggle_primary: Type.Optional(Type.Object({ username: Type.String(), api_key: Type.String(), notebook_slug: Type.Optional(Type.String()), worker_url: Type.Optional(Type.String()) })),
  kaggle_secondary: Type.Optional(Type.Object({ username: Type.String(), api_key: Type.String(), notebook_slug: Type.Optional(Type.String()), worker_url: Type.Optional(Type.String()) })),
  telegram_storage: Type.Optional(Type.Object({ bot_token: Type.String(), storage_chat_id: Type.String(), stream_bridge_base_url: Type.Optional(Type.String()) })),
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
  return `import os
import re
import gc
import glob
import uuid
import time
import json
import shutil
import asyncio
import threading
import tempfile
import subprocess
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Any, Optional
import torch
import requests
from PIL import Image
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
from safetensors.torch import load_file
from diffusers import StableDiffusionXLPipeline, UNet2DConditionModel, EulerDiscreteScheduler, AnimateDiffPipeline, MotionAdapter
from diffusers.utils import export_to_video

def discover_model_paths() -> Dict[str, Optional[str]]:
    sdxl_matches = glob.glob("/kaggle/input/**/sdxl_lightning_4step_unet.safetensors", recursive=True)
    anim_matches = glob.glob("/kaggle/input/**/animatediff_lightning_4step_diffusers.safetensors", recursive=True)
    pulid_matches = glob.glob("/kaggle/input/**/pulid", recursive=True)
    musetalk_matches = glob.glob("/kaggle/input/**/musetalk", recursive=True)
    liveportrait_matches = glob.glob("/kaggle/input/**/liveportrait", recursive=True)
    sdxl_unet = sdxl_matches[0] if sdxl_matches else None
    base_mount = os.path.dirname(os.path.dirname(sdxl_unet)) if sdxl_unet else "/kaggle/input/anime-engine-models-v1"
    paths = {"base_mount": base_mount, "sdxl_unet": sdxl_unet, "animatediff_ckpt": anim_matches[0] if anim_matches else None, "pulid_dir": pulid_matches[0] if pulid_matches else None, "musetalk_dir": musetalk_matches[0] if musetalk_matches else None, "liveportrait_dir": liveportrait_matches[0] if liveportrait_matches else None}
    return paths

MODEL_PATHS = discover_model_paths()
SUPABASE_URL = "${supabaseUrl}".rstrip("/")
SUPABASE_KEY = "${supabaseServiceKey}"
SESSION_SLOT = "${sessionSlot}"
DEFAULT_TG_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
DEFAULT_TG_CHAT_ID = os.getenv("TELEGRAM_STORAGE_CHAT_ID", "")
DEFAULT_STREAM_BRIDGE = os.getenv("TELEGRAM_STREAM_BRIDGE_URL", "https://api.bnai.dpdns.org/v1/media/telegram").rstrip("/")
DEVICE_0 = "cuda:0" if torch.cuda.is_available() else "cpu"
DEVICE_1 = ("cuda:1" if torch.cuda.device_count() > 1 else ("cuda:0" if torch.cuda.is_available() else "cpu"))
GPU_0_LOCK = threading.Lock()
GPU_1_LOCK = threading.Lock()
MODEL_CACHE: Dict[str, Any] = {}
JOBS_STORE: Dict[str, Dict[str, Any]] = {}
PUBLIC_TUNNEL_URL: Optional[str] = None
BG_EXECUTOR = ThreadPoolExecutor(max_workers=2)
app = FastAPI(title="AI Cinematic Anime Engine - Kaggle Worker")

class TelegramUploadConfig(BaseModel):
    enabled: bool = True
    bot_token: Optional[str] = None
    chat_id: Optional[str] = None
    stream_bridge_url: Optional[str] = None

class GenerateImageRequest(BaseModel):
    project_id: str
    episode_no: int
    scene_order: int
    visual_medium: str = "ANIME"
    engine: str = "SDXL_LIGHTNING_PULID"
    model_mount_path: Optional[str] = None
    prompt: str
    visual_dna: Optional[Dict[str, Any]] = None
    reference_image_file_id: Optional[str] = None
    fallback_gpu_url: Optional[str] = None
    telegram_upload: Optional[TelegramUploadConfig] = None
    async_mode: bool = False
    callback_url: Optional[str] = None

class VideoAssemblyRequest(BaseModel):
    project_id: str
    episode_no: int
    scene_order: int
    visual_medium: str = "ANIME"
    model_mount_path: Optional[str] = None
    fallback_gpu_url: Optional[str] = None
    image_url: Optional[str] = None
    audio_url: Optional[str] = None
    duration_sec: int = 5
    emotion: str = "neutral"
    gpu_priority: str = "P2"
    routing_type: str = "LIPSYNC"
    telegram_upload: Optional[TelegramUploadConfig] = None
    stages: Dict[str, Any] = {}
    async_mode: bool = False
    callback_url: Optional[str] = None

def upload_media_to_telegram(file_path: str, caption: str, tg_cfg: Optional[TelegramUploadConfig]) -> Dict[str, Optional[str]]:
    bot_token = (tg_cfg.bot_token if tg_cfg and tg_cfg.bot_token else DEFAULT_TG_BOT_TOKEN).strip()
    chat_id = (tg_cfg.chat_id if tg_cfg and tg_cfg.chat_id else DEFAULT_TG_CHAT_ID).strip()
    bridge_base = (tg_cfg.stream_bridge_url if tg_cfg and tg_cfg.stream_bridge_url else DEFAULT_STREAM_BRIDGE).rstrip("/")
    if not bot_token or not chat_id or not os.path.exists(file_path): return {"file_id": None, "telegram_url": None}
    api_url = f"https://api.telegram.org/bot{bot_token}/sendDocument"
    for attempt in range(3):
        try:
            with open(file_path, "rb") as f:
                resp = requests.post(api_url, data={"chat_id": chat_id, "caption": caption[:1024]}, files={"document": f}, timeout=120)
            if resp.ok:
                result = resp.json().get("result", {})
                media_obj = (result.get("document") or result.get("video") or result.get("audio") or result.get("voice") or {})
                file_id = media_obj.get("file_id")
                if file_id:
                    stream_url = f"{bridge_base}/{file_id}" if bridge_base else None
                    return {"file_id": file_id, "telegram_url": stream_url}
        except Exception: time.sleep(2)
    return {"file_id": None, "telegram_url": None}

def update_supabase_clip_checkpoint(payload: Dict[str, Any]):
    if not SUPABASE_URL or not SUPABASE_KEY: return
    try:
        headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"}
        requests.post(f"{SUPABASE_URL}/rest/v1/clips?on_conflict=project_id,episode_no,scene_order", json=payload, headers=headers, timeout=15)
    except Exception: pass

def notify_n8n_webhook(callback_url: Optional[str], result_payload: Dict[str, Any]):
    if not callback_url: return
    try: requests.post(callback_url, json=result_payload, headers={"Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true"}, timeout=30)
    except Exception: pass

def clear_vram(device: str):
    gc.collect()
    if torch.cuda.is_available():
        with torch.cuda.device(device): torch.cuda.empty_cache()

def get_sdxl_lightning_pipeline() -> StableDiffusionXLPipeline:
    if "sdxl_lightning" in MODEL_CACHE: return MODEL_CACHE["sdxl_lightning"]
    unet_ckpt = MODEL_PATHS.get("sdxl_unet")
    if not unet_ckpt or not os.path.exists(unet_ckpt):
        matches = glob.glob("/kaggle/input/**/sdxl_lightning_4step_unet.safetensors", recursive=True)
        if matches: unet_ckpt = matches[0]
        else: raise RuntimeError("SDXL-Lightning UNet checkpoint not found!")
    base_model_id = "stabilityai/stable-diffusion-xl-base-1.0"
    unet = UNet2DConditionModel.from_config(base_model_id, subfolder="unet").to(DEVICE_0, torch.float16)
    unet.load_state_dict(load_file(unet_ckpt, device=DEVICE_0))
    pipe = StableDiffusionXLPipeline.from_pretrained(base_model_id, unet=unet, torch_dtype=torch.float16, variant="fp16").to(DEVICE_0)
    pipe.scheduler = EulerDiscreteScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")
    MODEL_CACHE["sdxl_lightning"] = pipe
    return pipe

def get_animatediff_pipeline() -> AnimateDiffPipeline:
    if "animatediff" in MODEL_CACHE: return MODEL_CACHE["animatediff"]
    adapter_ckpt = MODEL_PATHS.get("animatediff_ckpt")
    if not adapter_ckpt:
        matches = glob.glob("/kaggle/input/**/animatediff_lightning_4step_diffusers.safetensors", recursive=True)
        adapter_ckpt = matches[0] if matches else None
    adapter = MotionAdapter().to(DEVICE_0, torch.float16)
    if adapter_ckpt and os.path.exists(adapter_ckpt):
        adapter.load_state_dict(load_file(adapter_ckpt, device=DEVICE_0))
    pipe = AnimateDiffPipeline.from_pretrained("emilianJR/epiCRealism", motion_adapter=adapter, torch_dtype=torch.float16).to(DEVICE_0)
    pipe.scheduler = EulerDiscreteScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing", beta_schedule="linear")
    MODEL_CACHE["animatediff"] = pipe
    return pipe

def prewarm_models_background():
    try:
        with GPU_0_LOCK: get_sdxl_lightning_pipeline()
    except Exception: pass

def execute_image_generation_job(job_id: str, req: GenerateImageRequest) -> Dict[str, Any]:
    JOBS_STORE[job_id] = {"status": "processing"}
    with GPU_0_LOCK:
        try:
            pipe = get_sdxl_lightning_pipeline()
            dna_parts = []
            if isinstance(req.visual_dna, dict):
                for k in ["face", "hair", "clothing", "weapons", "color_palette"]:
                    v = req.visual_dna.get(k)
                    if v and str(v).lower() != "none": dna_parts.append(str(v))
            dna_str = ", ".join(dna_parts)
            medium_tag = "photorealistic 8k cinema, raw photo, real human skin texture" if req.visual_medium.upper() == "REAL_HUMAN" else "anime masterpiece, ufotable cel-shaded lighting, crisp lineart"
            full_prompt = f"{medium_tag}, {req.prompt}" + (f", character details: {dna_str}" if dna_str else "")
            neg_prompt = "deformed, blurry, bad anatomy, disfigured, extra limbs, text, watermark, low quality"
            seed = abs(hash(f"{req.project_id}_{req.episode_no}_{req.scene_order}")) % (2**31)
            generator = torch.Generator(device=DEVICE_0).manual_seed(seed)
            with torch.inference_mode():
                image: Image.Image = pipe(prompt=full_prompt, negative_prompt=neg_prompt, num_inference_steps=4, guidance_scale=0.0, width=1280, height=720, generator=generator).images[0]
            with tempfile.TemporaryDirectory() as tmpdir:
                out_png = os.path.join(tmpdir, f"proj_{req.project_id[:8]}_ep{req.episode_no}_sc{req.scene_order}.png")
                image.save(out_png, format="PNG", optimize=True)
                file_size = os.path.getsize(out_png)
                caption = f"KEYFRAME Project: {req.project_id} | Ep: {req.episode_no} | Scene: {req.scene_order}"
                tg_res = upload_media_to_telegram(out_png, caption, req.telegram_upload)
                clear_vram(DEVICE_0)
                result_payload = {"ok": True, "status": "completed", "job_id": job_id, "project_id": req.project_id, "episode_no": req.episode_no, "scene_order": req.scene_order, "engine": req.engine, "slot": SESSION_SLOT, "file_size_bytes": file_size, "telegram_file_id": tg_res["file_id"], "tg_file_id": tg_res["file_id"], "telegram_url": tg_res["telegram_url"], "image_url": tg_res["telegram_url"]}
                if tg_res["telegram_url"]:
                    update_supabase_clip_checkpoint({"project_id": req.project_id, "episode_no": req.episode_no, "scene_order": req.scene_order, "image_url": tg_res["telegram_url"], "tg_image_file_id": tg_res["file_id"], "checkpoint_stage": "IMAGE_READY"})
                JOBS_STORE[job_id] = result_payload
                notify_n8n_webhook(req.callback_url, result_payload)
                return result_payload
        except Exception as exc:
            clear_vram(DEVICE_0)
            err_payload = {"ok": False, "status": "failed", "job_id": job_id, "error": str(exc)}
            JOBS_STORE[job_id] = err_payload
            notify_n8n_webhook(req.callback_url, err_payload)
            raise exc

def execute_video_assembly_job(job_id: str, req: VideoAssemblyRequest) -> Dict[str, Any]:
    JOBS_STORE[job_id] = {"status": "processing"}
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            current_media = os.path.join(tmpdir, "input_source.png")
            if req.image_url:
                with requests.get(req.image_url, headers={"Bypass-Tunnel-Reminder": "true"}, stream=True, timeout=60) as r:
                    r.raise_for_status()
                    with open(current_media, "wb") as f:
                        for chunk in r.iter_content(65536):
                            if chunk: f.write(chunk)
            else: Image.new("RGB", (1280, 720), color=(15, 15, 25)).save(current_media)
            local_audio = None
            if req.audio_url:
                local_audio = os.path.join(tmpdir, "scene_voice.wav")
                try:
                    with requests.get(req.audio_url, headers={"Bypass-Tunnel-Reminder": "true"}, stream=True, timeout=60) as r:
                        if r.ok:
                            with open(local_audio, "wb") as f:
                                for chunk in r.iter_content(65536):
                                    if chunk: f.write(chunk)
                except Exception: local_audio = None
            stages = req.stages or {}
            if stages.get("branch_c_animatediff", {}).get("enabled"):
                with GPU_0_LOCK:
                    pipe = get_animatediff_pipeline()
                    num_frames = min(max(req.duration_sec * 8, 16), 32)
                    prompt = stages["branch_c_animatediff"].get("prompt") or "cinematic motion"
                    with torch.inference_mode():
                        frames = pipe(prompt=prompt, negative_prompt="bad quality, static, deformed", num_frames=num_frames, guidance_scale=1.0, num_inference_steps=4).frames[0]
                    anim_mp4 = os.path.join(tmpdir, "stage_c.mp4")
                    export_to_video(frames, anim_mp4, fps=8)
                    current_media = anim_mp4
                clear_vram(DEVICE_0)
            final_mp4 = os.path.join(tmpdir, f"proj_{req.project_id[:8]}_ep{req.episode_no}_sc{req.scene_order}_gpu.mp4")
            is_image = current_media.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
            cmd = ["ffmpeg", "-y"] + (["-loop", "1", "-i", current_media] if is_image else ["-stream_loop", "-1", "-i", current_media])
            if local_audio and os.path.exists(local_audio):
                cmd += ["-i", local_audio, "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p", "-c:v", "libx264", "-preset", "fast", "-c:a", "aac", "-b:a", "192k", "-shortest", "-t", str(req.duration_sec), final_mp4]
            else:
                cmd += ["-t", str(req.duration_sec), "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p", "-c:v", "libx264", "-preset", "fast", final_mp4]
            subprocess.run(cmd, check=True)
            file_size = os.path.getsize(final_mp4)
            caption = f"GPU CLIP Project: {req.project_id} | Ep: {req.episode_no} | Scene: {req.scene_order}"
            tg_res = upload_media_to_telegram(final_mp4, caption, req.telegram_upload)
            result_payload = {"ok": True, "status": "completed", "job_id": job_id, "project_id": req.project_id, "episode_no": req.episode_no, "scene_order": req.scene_order, "slot": SESSION_SLOT, "file_size_bytes": file_size, "telegram_file_id": tg_res["file_id"], "tg_file_id": tg_res["file_id"], "telegram_url": tg_res["telegram_url"], "video_url": tg_res["telegram_url"]}
            if tg_res["telegram_url"]:
                update_supabase_clip_checkpoint({"project_id": req.project_id, "episode_no": req.episode_no, "scene_order": req.scene_order, "video_url": tg_res["telegram_url"], "tg_video_file_id": tg_res["file_id"], "checkpoint_stage": "VIDEO_READY"})
            JOBS_STORE[job_id] = result_payload
            notify_n8n_webhook(req.callback_url, result_payload)
            return result_payload
    except Exception as exc:
        err_payload = {"ok": False, "status": "failed", "job_id": job_id, "error": str(exc)}
        JOBS_STORE[job_id] = err_payload
        notify_n8n_webhook(req.callback_url, err_payload)
        raise exc

@app.post("/v1/generate-image")
async def generate_image_endpoint(req: GenerateImageRequest):
    job_id = f"img_{req.project_id[:6]}_{uuid.uuid4().hex[:6]}"
    JOBS_STORE[job_id] = {"status": "queued"}
    if req.async_mode or req.callback_url:
        BG_EXECUTOR.submit(execute_image_generation_job, job_id, req)
        return {"ok": True, "status": "queued", "job_id": job_id}
    return await asyncio.to_thread(execute_image_generation_job, job_id, req)

@app.post("/v1/gpu/video-assembly-line")
async def video_assembly_endpoint(req: VideoAssemblyRequest):
    job_id = f"vid_{req.project_id[:6]}_{uuid.uuid4().hex[:6]}"
    JOBS_STORE[job_id] = {"status": "queued"}
    if req.async_mode or req.callback_url:
        BG_EXECUTOR.submit(execute_video_assembly_job, job_id, req)
        return {"ok": True, "status": "queued", "job_id": job_id}
    return await asyncio.to_thread(execute_video_assembly_job, job_id, req)

@app.get("/v1/jobs/{job_id}")
async def get_job_status(job_id: str):
    if job_id not in JOBS_STORE: raise HTTPException(status_code=404, detail="Job not found")
    return JOBS_STORE[job_id]

@app.get("/health")
async def health():
    return {"ok": True, "slot": SESSION_SLOT, "tunnel_url": PUBLIC_TUNNEL_URL, "sdxl_prewarmed": "sdxl_lightning" in MODEL_CACHE, "gpu_count": torch.cuda.device_count() if torch.cuda.is_available() else 0}

def register_tunnel_in_supabase(tunnel_url: str):
    global PUBLIC_TUNNEL_URL
    PUBLIC_TUNNEL_URL = tunnel_url
    if SUPABASE_URL and SUPABASE_KEY:
        try:
            headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"}
            requests.post(f"{SUPABASE_URL}/rest/v1/kaggle_sessions?on_conflict=session_name", json={"session_name": SESSION_SLOT, "status": "active", "api_endpoint": tunnel_url, "gpu_id": "T4x2"}, headers=headers, timeout=15)
        except Exception: pass

def start_tunnel_daemon():
    while True:
        try:
            if os.path.exists("/tmp/cloudflared"):
                proc = subprocess.Popen(["/tmp/cloudflared", "tunnel", "--url", "http://127.0.0.1:8000"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
                for line in proc.stdout:
                    m = re.search(r"(https://[a-zA-Z0-9-]+\.trycloudflare\.com)", line)
                    if m: register_tunnel_in_supabase(m.group(1))
                proc.wait()
            else:
                subprocess.run(["npm", "install", "-g", "localtunnel"], check=False)
                proc = subprocess.Popen(["lt", "--port", "8000"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
                for line in proc.stdout:
                    m = re.search(r"(https://[a-zA-Z0-9-]+\.loca\.lt)", line)
                    if m: register_tunnel_in_supabase(m.group(1))
                proc.wait()
        except Exception: time.sleep(5)

if __name__ == "__main__":
    import subprocess, time
    if not os.path.exists("/tmp/cloudflared"):
        subprocess.run(["wget", "-q", "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64", "-O", "/tmp/cloudflared"], check=False)
        subprocess.run(["chmod", "+x", "/tmp/cloudflared"], check=False)
    threading.Thread(target=start_tunnel_daemon, daemon=True).start()
    threading.Thread(target=prewarm_models_background, daemon=True).start()
    uvicorn.run(app, host="0.0.0.0", port=8000, timeout_keep_alive=120)
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

  const guardOptionalPromptProject = (roles: string[]) => async (request: any, reply: any) => {
    const projectId = request.body?.project_id ?? request.query?.project_id;
    if (projectId === undefined || projectId === null || projectId === '') return;
    await requireProjectRole(roles)(request, reply);
  };

  app.get('/v1/anime/infrastructure', { preHandler: [app.authenticate] }, async (request: any) => {
    const userId = authCheck(request);
    const items = await svc.list(userId);
    return { data: items, meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/infrastructure', { schema: { body: CreateBody }, preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const userId = authCheck(request);
    const dto = await svc.create(userId, { ...request.body, request_id: request.anime?.request_id });
    void reply.status(201);
    return { data: dto, meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/infrastructure/gpu', { preHandler: [app.authenticate] }, async (request: any) => {
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

  app.post('/v1/anime/infrastructure/gpu', { schema: { body: GpuSetupBody }, preHandler: [app.authenticate] }, async (request: any) => {
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

  app.get('/v1/anime/prompts', { preHandler: [app.authenticate, guardOptionalPromptProject(PROMPT_READ_ROLES)] }, async (request: any) => {
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

  app.post('/v1/anime/prompts', { schema: { body: CreatePromptBody }, preHandler: [app.authenticate, guardOptionalPromptProject(PROMPT_WRITE_ROLES)] }, async (request: any, reply: any) => {
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

  app.delete('/v1/anime/prompts/:id', { schema: { params: IdParams }, preHandler: [app.authenticate] }, async (request: any) => {
    const userId = authCheck(request);
    await animeSupabase
      .from('user_system_prompts')
      .delete()
      .eq('id', request.params.id)
      .eq('user_id', userId);
    return { data: { ok: true }, meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/infrastructure/:id', { schema: { params: IdParams }, preHandler: [app.authenticate] }, async (request: any) => {
    const userId = authCheck(request);
    return { data: await svc.getById(request.params.id, userId) };
  });

  app.patch('/v1/anime/infrastructure/:id', { schema: { params: IdParams, body: UpdateBody }, preHandler: [app.authenticate] }, async (request: any) => {
    const userId = authCheck(request);
    return { data: await svc.update(request.params.id, userId, { ...request.body, request_id: request.anime?.request_id }) };
  });

  app.delete('/v1/anime/infrastructure/:id', { schema: { params: IdParams }, preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const userId = authCheck(request);
    await svc.remove(request.params.id, userId, request.anime?.request_id);
    void reply.status(204);
    return;
  });

  app.post('/v1/anime/infrastructure/:id/set-default', { schema: { params: IdParams }, preHandler: [app.authenticate] }, async (request: any) => {
    const userId = authCheck(request);
    await svc.setDefault(request.params.id, userId, request.anime?.request_id);
    return { data: { ok: true } };
  });

  app.post('/v1/anime/infrastructure/:id/verify', { schema: { params: IdParams }, preHandler: [app.authenticate] }, async (request: any) => {
    const userId = authCheck(request);
    return { data: await svc.verify(request.params.id, userId, request.anime?.request_id) };
  });
}
