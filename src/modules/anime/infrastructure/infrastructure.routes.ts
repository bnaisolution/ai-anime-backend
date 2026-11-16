import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { requireProjectRole } from '../auth/project-guard';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { animeSupabase } from '../db/anime.supabase';
import * as svc from './infrastructure.service';
import { maskConfig } from './infrastructure.crypto';
import { resolveTenant } from '../tenant/tenant.service';
import { PROMPT_CATEGORIES, canonicalGenreTitle, canonicalMediumKey, canonicalMediumTitle, parseGenreList, slugifyCreativeTitle } from '../prompts/creative.registry';
import { buildCreativeMetadata, genreDisplayListForProject } from '../prompts/creative.service';
import { mintWorkerJobToken } from '../workers/workerToken';

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
  tenant_id: Type.Optional(Type.String({ format: 'uuid' })),
  github_worker: Type.Optional(Type.Object({
    worker_url: Type.Optional(Type.String()),
    token: Type.Optional(Type.String()),
    repository: Type.Optional(Type.String()),
    workflow: Type.Optional(Type.String()),
  })),
  github_token: Type.Optional(Type.String()),
  primary_llm_provider: Type.Optional(Type.String({ maxLength: 40 })),
  fallback_llm_provider: Type.Optional(Type.String({ maxLength: 40 })),
  vision_provider: Type.Optional(Type.String({ maxLength: 40 })),
  primary_llm_model: Type.Optional(Type.String({ maxLength: 120 })),
  fallback_llm_model: Type.Optional(Type.String({ maxLength: 120 })),
  vision_model: Type.Optional(Type.String({ maxLength: 120 })),
  gpu_choice: Type.Optional(Type.String({ maxLength: 40 })),
  cpu_choice: Type.Optional(Type.String({ maxLength: 40 })),
  storage_choice: Type.Optional(Type.String({ maxLength: 40 })),
  cpu_worker: Type.Optional(Type.Object({
    mode: Type.Optional(Type.String({ maxLength: 40 })),
    worker_url: Type.Optional(Type.String()),
    token: Type.Optional(Type.String()),
    repository: Type.Optional(Type.String()),
  })),
  groq_api_key: Type.Optional(Type.String()),
  gemini_api_key: Type.Optional(Type.String()),
  kaggle_username: Type.Optional(Type.String()),
  kaggle_key: Type.Optional(Type.String()),
  telegram_chat_id: Type.Optional(Type.String()),
  telegram_bot_token: Type.Optional(Type.String()),
});

const EnsureGpuBody = Type.Object({
  tenant_id: Type.Optional(Type.String({ format: 'uuid' })),
});

const PROMPT_FORMATS = ['SERIES', 'MOVIE', 'SHORT', 'MUSIC_VIDEO', 'TRAILER'] as const;
const PROMPT_MODELS = ['DEFAULT', 'SDXL', 'FLUX', 'ANIMATEDIFF', 'RUNWAY', 'KLING', 'SORA'] as const;

const PromptCategoryEnum = Type.Union(PROMPT_CATEGORIES.map((value) => Type.Literal(value)));
const PromptMediumEnum = Type.String({ minLength: 1, maxLength: 80 });
const PromptFormatEnum = Type.Union(PROMPT_FORMATS.map((value) => Type.Literal(value)));
const PromptModelEnum = Type.Union(PROMPT_MODELS.map((value) => Type.Literal(value)));

const CreatePromptBody = Type.Object({
  project_id: Type.Optional(Type.String()),
  title: Type.String({ minLength: 1, maxLength: 120 }),
  visual_medium: PromptMediumEnum,
  prompt_category: Type.Optional(PromptCategoryEnum),
  genre: Type.Optional(Type.String({ maxLength: 120 })),
  format: Type.Optional(PromptFormatEnum),
  model_hint: Type.Optional(PromptModelEnum),
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 40 }), { maxItems: 20 })),
  is_favorite: Type.Optional(Type.Boolean()),
  prompt_text: Type.String({ minLength: 1 }),
  set_active: Type.Optional(Type.Boolean()),
});

const UpdatePromptBody = Type.Object({
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  visual_medium: Type.Optional(PromptMediumEnum),
  prompt_category: Type.Optional(PromptCategoryEnum),
  genre: Type.Optional(Type.String({ maxLength: 120 })),
  format: Type.Optional(PromptFormatEnum),
  model_hint: Type.Optional(PromptModelEnum),
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 40 }), { maxItems: 20 })),
  is_favorite: Type.Optional(Type.Boolean()),
  is_archived: Type.Optional(Type.Boolean()),
  prompt_text: Type.Optional(Type.String({ minLength: 1 })),
});

const PromptListQuery = Type.Object({
  project_id: Type.Optional(Type.String()),
  prompt_category: Type.Optional(PromptCategoryEnum),
  genre: Type.Optional(Type.String()),
  format: Type.Optional(PromptFormatEnum),
  is_favorite: Type.Optional(Type.String()),
  q: Type.Optional(Type.String({ maxLength: 120 })),
  include_archived: Type.Optional(Type.String()),
});

const CompatibilityBody = Type.Object({
  genre: Type.Optional(Type.String()),
  format: Type.Optional(PromptFormatEnum),
  visual_medium: Type.Optional(PromptMediumEnum),
  model_hint: Type.Optional(PromptModelEnum),
});

const CompatibilityRules: Record<string, { formats?: string[]; models?: string[] }> = {
  ROMANCE: { formats: ['SERIES', 'MOVIE', 'SHORT'] },
  COMEDY: { models: ['DEFAULT', 'SDXL', 'FLUX', 'ANIMATEDIFF'] },
  MYTHOLOGY: { formats: ['SERIES', 'MOVIE', 'SHORT', 'TRAILER'] },
  MUSIC: { formats: ['MUSIC_VIDEO', 'SHORT', 'SERIES'] },
  ACTION: { formats: ['SERIES', 'MOVIE', 'SHORT', 'TRAILER', 'MUSIC_VIDEO'] },
};

function evaluatePromptCompatibility(input: {
  genre?: string;
  format?: string;
  visual_medium?: string;
  model_hint?: string;
}) {
  const reasons: string[] = [];
  const genre = canonicalGenreTitle(input.genre || '').toUpperCase();
  const format = (input.format || '').toUpperCase();
  const medium = canonicalMediumKey(input.visual_medium || '');
  const model = (input.model_hint || 'DEFAULT').toUpperCase();
  const rule = CompatibilityRules[genre];
  if (rule?.formats && format && !rule.formats.includes(format)) {
    reasons.push(`Genre ${genre} is not compatible with format ${format}.`);
  }
  if (rule?.models && model && !rule.models.includes(model)) {
    reasons.push(`Genre ${genre} is not compatible with model ${model}.`);
  }
  if (medium === 'REAL_HUMAN' && model === 'ANIMATEDIFF') {
    reasons.push('REAL_HUMAN medium cannot be rendered with ANIMATEDIFF.');
  }
  if ((medium === 'ANIME' || medium === 'MANHWA' || medium === '2D_ANIMATION') && model === 'RUNWAY') {
    reasons.push(`${medium} requires an animation-capable model; RUNWAY is not approved for this medium.`);
  }
  return { compatible: reasons.length === 0, reasons };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}



function buildKaggleLocalTunnelScript(
  backendBaseUrl: string,
  sessionToken: string,
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
from datetime import datetime, timezone
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
BACKEND_BASE = "${backendBaseUrl}".rstrip("/")
SESSION_TOKEN = "${sessionToken}"
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
    season_no: int = 1
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
    season_no: int = 1
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
            seed = abs(hash(f"{req.project_id}_{req.season_no}_{req.episode_no}_{req.scene_order}")) % (2**31)
            generator = torch.Generator(device=DEVICE_0).manual_seed(seed)
            with torch.inference_mode():
                image: Image.Image = pipe(prompt=full_prompt, negative_prompt=neg_prompt, num_inference_steps=4, guidance_scale=0.0, width=1280, height=720, generator=generator).images[0]
            with tempfile.TemporaryDirectory() as tmpdir:
                out_png = os.path.join(tmpdir, f"proj_{req.project_id[:8]}_s{req.season_no}_ep{req.episode_no}_sc{req.scene_order}.png")
                image.save(out_png, format="PNG", optimize=True)
                file_size = os.path.getsize(out_png)
                caption = f"KEYFRAME Project: {req.project_id} | S{req.season_no} Ep: {req.episode_no} | Scene: {req.scene_order}"
                tg_res = upload_media_to_telegram(out_png, caption, req.telegram_upload)
                clear_vram(DEVICE_0)
                result_payload = {"ok": True, "status": "completed", "job_id": job_id, "project_id": req.project_id, "season_no": req.season_no, "episode_no": req.episode_no, "scene_order": req.scene_order, "engine": req.engine, "slot": SESSION_SLOT, "file_size_bytes": file_size, "telegram_file_id": tg_res["file_id"], "tg_file_id": tg_res["file_id"], "telegram_url": tg_res["telegram_url"], "image_url": tg_res["telegram_url"]}
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
            final_mp4 = os.path.join(tmpdir, f"proj_{req.project_id[:8]}_s{req.season_no}_ep{req.episode_no}_sc{req.scene_order}_gpu.mp4")
            is_image = current_media.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
            cmd = ["ffmpeg", "-y"] + (["-loop", "1", "-i", current_media] if is_image else ["-stream_loop", "-1", "-i", current_media])
            if local_audio and os.path.exists(local_audio):
                cmd += ["-i", local_audio, "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p", "-c:v", "libx264", "-preset", "fast", "-c:a", "aac", "-b:a", "192k", "-shortest", "-t", str(req.duration_sec), final_mp4]
            else:
                cmd += ["-t", str(req.duration_sec), "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p", "-c:v", "libx264", "-preset", "fast", final_mp4]
            subprocess.run(cmd, check=True)
            file_size = os.path.getsize(final_mp4)
            caption = f"GPU CLIP Project: {req.project_id} | S{req.season_no} Ep: {req.episode_no} | Scene: {req.scene_order}"
            tg_res = upload_media_to_telegram(final_mp4, caption, req.telegram_upload)
            result_payload = {"ok": True, "status": "completed", "job_id": job_id, "project_id": req.project_id, "season_no": req.season_no, "episode_no": req.episode_no, "scene_order": req.scene_order, "slot": SESSION_SLOT, "file_size_bytes": file_size, "telegram_file_id": tg_res["file_id"], "tg_file_id": tg_res["file_id"], "telegram_url": tg_res["telegram_url"], "video_url": tg_res["telegram_url"]}
            if tg_res["telegram_url"]:
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
    if BACKEND_BASE and SESSION_TOKEN:
        try:
            requests.post(f"{BACKEND_BASE}/v1/anime/internal/worker/session", json={"session_name": SESSION_SLOT, "api_endpoint": tunnel_url, "gpu_id": "T4x2"}, headers={"Authorization": f"Bearer {SESSION_TOKEN}", "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true"}, timeout=15)
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
  slotName: string,
  userId: string,
  tenantId: string | null
) {
  const backendBaseUrl = String(process.env.ANIME_PUBLIC_BASE_URL || 'https://api.bnai.dpdns.org').replace(/\/+$/, '');
  const sessionToken = mintWorkerJobToken({
    job_id: `gpu-session:${slotName}:${userId}`,
    project_id: 'gpu-session',
    tenant_id: tenantId,
    user_id: userId,
    scope: ['gpu_session'],
    ttl_seconds: 21600,
  });
  const cleanSlug = rawNotebookSlug.replace(/^.*\/+/, '').trim() || 'anime-gpu-worker';
  const fullSlug = `${username.trim()}/${cleanSlug}`;
  const payload = {
    slug: fullSlug,
    newTitle: cleanSlug,
    text: buildKaggleLocalTunnelScript(backendBaseUrl, sessionToken, slotName),
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

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function mergeConfig(
  existing: Record<string, any>,
  input: Record<string, any> | undefined,
  secretFields: string[] = []
): Record<string, any> {
  if (!input) return { ...existing };
  const next: Record<string, any> = { ...existing, ...input };
  for (const field of secretFields) {
    if (!next[field] && existing[field]) next[field] = existing[field];
  }
  return next;
}

async function upsertProviderConfig(
  userId: string,
  providerType: 'groq' | 'gemini',
  name: string,
  apiKey: string,
  requestId?: string
): Promise<void> {
  const items = await svc.list(userId);
  const existing = items.find((item) => item.provider_type === providerType && item.name === name);
  const config = { api_key: apiKey };
  if (existing) {
    await svc.update(existing.id, userId, { config, status: 'active', request_id: requestId });
  } else {
    await svc.create(userId, {
      name,
      provider_type: providerType,
      config,
      is_default: true,
      request_id: requestId,
    });
  }
}

function gpuPresentation(
  items: Awaited<ReturnType<typeof svc.list>>,
  gpuRow: Awaited<ReturnType<typeof svc.list>>[number] | undefined
): Record<string, any> {
  const config = asRecord(gpuRow?.config_masked);
  const routing = asRecord(config.gpu_routing);
  const primary = asRecord(routing.kaggle_primary);
  const secondary = asRecord(routing.kaggle_secondary);
  const telegram = asRecord(config.telegram_storage);
  const github = asRecord(config.github_worker);
  return {
    ...config,
    preferred_mode: config.preferred_mode ?? routing.preferred_mode ?? 'KAGGLE_AUTO',
    models_dataset_slug: config.models_dataset_slug ?? 'bnaisolution/anime-engine-models-v1',
    primary_llm_provider: config.primary_llm_provider ?? 'groq',
    fallback_llm_provider: config.fallback_llm_provider ?? 'gemini',
    vision_provider: config.vision_provider ?? 'gemini',
    primary_llm_model: config.primary_llm_model ?? '',
    fallback_llm_model: config.fallback_llm_model ?? '',
    vision_model: config.vision_model ?? '',
    gpu_choice: config.gpu_choice ?? (String(config.preferred_mode || '').toUpperCase() === 'CUSTOM_GPU' ? 'CUSTOM_GPU' : 'KAGGLE_PRIMARY'),
    cpu_choice: config.cpu_choice ?? 'GITHUB_CPU',
    storage_choice: config.storage_choice ?? 'TELEGRAM',
    cpu_worker: asRecord(config.cpu_worker),
    gpu_routing: {
      ...routing,
      kaggle_primary: primary,
      kaggle_secondary: secondary,
    },
    kaggle_primary: primary,
    kaggle_secondary: secondary,
    kaggle_username: primary.username ?? '',
    kaggle_key: primary.api_key ?? '',
    telegram_storage: telegram,
    telegram_chat_id: telegram.storage_chat_id ?? '',
    github_worker: github,
    github_worker_url: github.worker_url ?? '',
    groq_api_key: items.some((item) => item.provider_type === 'groq') ? '****' : '',
    gemini_api_key: items.some((item) => item.provider_type === 'gemini') ? '****' : '',
  };
}

export interface KaggleEnsureResult {
  status: 'healthy' | 'starting' | 'custom_gpu';
  endpoint: string | null;
  deployed: boolean;
  reason: string;
}

function isAllowedWorkerEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(String(endpoint || ''));
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && ['.trycloudflare.com', '.loca.lt'].some((suffix) => host.endsWith(suffix));
  } catch { return false; }
}

async function workerIsHealthy(endpoint: string): Promise<boolean> {
  if (!isAllowedWorkerEndpoint(endpoint)) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${endpoint.replace(/\/+$/, '')}/health`, {
      signal: controller.signal,
      headers: { 'Bypass-Tunnel-Reminder': 'true' },
    });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

export async function ensureKaggleWorkerForUser(userId: string, tenantId?: string | null): Promise<KaggleEnsureResult> {
  const hydrated = await svc.getHydratedInfrastructureForUser(userId, tenantId ?? undefined);
  const routing = asRecord(hydrated.gpu_routing);
  const customGpu = asRecord(routing.custom_gpu);
  if (customGpu.enabled && customGpu.worker_url) {
    return { status: 'custom_gpu', endpoint: String(customGpu.worker_url), deployed: false, reason: 'Custom GPU worker is configured.' };
  }

  const primary = asRecord(routing.kaggle_primary);
  const username = String(primary.username || '').trim();
  const apiKey = String(primary.api_key || '').trim();
  if (!username || !apiKey) {
    throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'Kaggle credentials are not configured.' });
  }

  const sessionName = 'kaggle_story_engine';
  const { data: session, error } = await animeSupabase
    .from('kaggle_sessions')
    .select('session_name,status,api_endpoint,updated_at')
    .eq('user_id', userId)
    .eq('session_name', sessionName)
    .maybeSingle();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Kaggle session lookup failed.', cause: error });

  const endpoint = typeof session?.api_endpoint === 'string' ? session.api_endpoint : '';
  if (endpoint && await workerIsHealthy(endpoint)) {
    return { status: 'healthy', endpoint, deployed: false, reason: 'Kaggle worker is healthy.' };
  }

  const updatedAt = session?.updated_at ? new Date(session.updated_at).getTime() : 0;
  if (session?.status === 'starting' && Number.isFinite(updatedAt) && Date.now() - updatedAt < 10 * 60 * 1000) {
    return { status: 'starting', endpoint: null, deployed: false, reason: 'Kaggle worker is already starting.' };
  }

  const datasetSlug = String(asRecord(hydrated.kaggle ?? hydrated.own_gpu).models_dataset_slug || 'bnaisolution/anime-engine-models-v1');
  const deploy = await pushKaggleKernel(
    username,
    apiKey,
    String(primary.notebook_slug || 'anime-gpu-worker-primary'),
    datasetSlug,
    sessionName,
    userId,
    tenantId ?? null
  );
  if (!deploy.ok) {
    const message = typeof (deploy.data as any)?.message === 'string' ? (deploy.data as any).message : `Kaggle push failed with HTTP ${deploy.status}.`;
    throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message });
  }

  const { error: sessionError } = await animeSupabase.from('kaggle_sessions').upsert({
    user_id: userId,
    tenant_id: tenantId ?? null,
    session_name: sessionName,
    status: 'starting',
    api_endpoint: null,
    gpu_id: 'T4x2',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,session_name' });
  if (sessionError) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Kaggle session could not be recorded.', cause: sessionError });

  return { status: 'starting', endpoint: null, deployed: true, reason: 'Kaggle kernel pushed; waiting for the tunnel.' };
}

function normalizePromptCategory(value: unknown): string {
  return String(value || 'BIBLE').trim().toUpperCase();
}

function resolvePromptStorageMedium(category: string, value: unknown, title: string): string {
  if (category === 'VISUAL_MEDIUM') return canonicalMediumKey(value || title);
  return String(value || 'ANIME').trim().toUpperCase();
}

async function appendProjectGenre(projectId: string, userId: string, genreTitle: string): Promise<void> {
  const title = canonicalGenreTitle(genreTitle);
  if (!projectId || !title) return;
  const { data: project } = await animeSupabase
    .from('projects')
    .select('id, genre, story_bible')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle<{ id: string; genre?: string | null; story_bible?: Record<string, any> | null }>();
  if (!project) return;
  const bible = (project.story_bible && typeof project.story_bible === 'object') ? project.story_bible : {};
  const selected = parseGenreList(project.genre, bible.genre);
  if (!selected.some((item) => item.toLowerCase() === title.toLowerCase())) selected.push(title);
  const genreValue = selected.join(', ');
  await animeSupabase
    .from('projects')
    .update({ genre: genreValue, story_bible: { ...bible, genre: genreValue } })
    .eq('id', projectId)
    .eq('user_id', userId);
}

async function ensureCreativePromptDoesNotExist(params: {
  userId: string;
  projectId?: string | null;
  category: string;
  identity: string;
}): Promise<void> {
  let query = animeSupabase
    .from('user_system_prompts')
    .select('id, title, genre, visual_medium, project_id')
    .eq('user_id', params.userId)
    .eq('prompt_category', params.category)
    .eq('is_archived', false);
  if (params.projectId) query = query.or(`project_id.eq.${params.projectId},project_id.is.null`);
  const { data } = await query;
  const rows = Array.isArray(data) ? data : [];
  const duplicate = rows.find((row: any) => {
    const value = params.category === 'GENRE' ? (row.genre || row.title) : (row.visual_medium || row.title);
    const left = params.category === 'GENRE' ? canonicalGenreTitle(value) : canonicalMediumKey(value);
    const right = params.category === 'GENRE' ? canonicalGenreTitle(params.identity) : canonicalMediumKey(params.identity);
    return left.toLowerCase() === right.toLowerCase();
  });
  if (duplicate) {
    throw new AnimeError({ code: AnimeErrorCode.IDEMPOTENCY_CONFLICT, message: `${params.category === 'GENRE' ? 'Genre' : 'Visual medium'} "${params.identity}" already exists. Edit the existing prompt instead.` });
  }
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
    await requireProjectRole(roles, { bodyProjectId: true })(request, reply);
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
      data: gpuPresentation(items, gpuRow),
      meta: { request_id: request.anime?.request_id },
    };
  });

  app.post('/v1/anime/infrastructure/gpu', { schema: { body: GpuSetupBody }, preHandler: [app.authenticate] }, async (request: any) => {
    const userId = authCheck(request);
    const body = request.body;
    const requestId = request.anime?.request_id;
    const datasetSlug = body.models_dataset_slug || 'bnaisolution/anime-engine-models-v1';
    const tenantId = body.tenant_id ? (await resolveTenant(userId, body.tenant_id)).tenant.id : null;

    const existingHydrated = await svc.getHydratedInfrastructureForUser(userId);
    const existingTop = asRecord(existingHydrated.kaggle ?? existingHydrated.own_gpu);
    const existingRouting = asRecord(existingHydrated.gpu_routing);
    const existingTelegram = asRecord(existingHydrated.telegram_storage ?? existingTop.telegram_storage);
    const existingGithub = asRecord(existingHydrated.github_worker ?? existingTop.github_worker);
    const existingCpuWorker = asRecord(existingTop.cpu_worker);

    const legacyKaggle = (body.kaggle_username || body.kaggle_key)
      ? { username: body.kaggle_username ?? '', api_key: body.kaggle_key ?? '' }
      : undefined;
    const primaryInput = body.kaggle_primary ?? legacyKaggle;
    const nextPrimary = mergeConfig(asRecord(existingRouting.kaggle_primary), primaryInput, ['api_key']);
    const nextSecondary = mergeConfig(asRecord(existingRouting.kaggle_secondary), body.kaggle_secondary, ['api_key']);
    const nextCustomGpu = mergeConfig(asRecord(existingRouting.custom_gpu), body.custom_gpu, ['api_key']);

    const telegramInput = body.telegram_storage ?? ((body.telegram_bot_token || body.telegram_chat_id)
      ? { bot_token: body.telegram_bot_token ?? '', storage_chat_id: body.telegram_chat_id ?? '' }
      : undefined);
    let nextTelegram = mergeConfig(existingTelegram, telegramInput, ['bot_token']);
    if (!nextTelegram.bot_token && !nextTelegram.storage_chat_id) {
      nextTelegram = {
        bot_token: process.env.TELEGRAM_BOT_TOKEN || '',
        storage_chat_id: process.env.TELEGRAM_STORAGE_CHAT_ID || '',
        stream_bridge_base_url: 'https://api.bnai.dpdns.org/v1/media/telegram',
      };
    }

    const githubInput = body.github_worker ?? ((body.github_worker_url || body.github_token)
      ? { worker_url: body.github_worker_url ?? '', token: body.github_token ?? '' }
      : undefined);
    const nextGithub = mergeConfig(existingGithub, githubInput, ['token']);
    const nextCpuWorker = mergeConfig(existingCpuWorker, body.cpu_worker, ['token']);

    const primaryLlmProvider = body.primary_llm_provider || existingTop.primary_llm_provider || 'groq';
    const fallbackLlmProvider = body.fallback_llm_provider || existingTop.fallback_llm_provider || 'gemini';
    const visionProvider = body.vision_provider || existingTop.vision_provider || 'gemini';

    const configPayload: Record<string, unknown> = {
      ...existingTop,
      preferred_mode: body.preferred_mode,
      models_dataset_slug: datasetSlug,
      primary_llm_provider: primaryLlmProvider,
      fallback_llm_provider: fallbackLlmProvider,
      vision_provider: visionProvider,
      primary_llm_model: body.primary_llm_model ?? existingTop.primary_llm_model ?? '',
      fallback_llm_model: body.fallback_llm_model ?? existingTop.fallback_llm_model ?? '',
      vision_model: body.vision_model ?? existingTop.vision_model ?? '',
      gpu_choice: body.gpu_choice ?? existingTop.gpu_choice ?? (body.preferred_mode === 'CUSTOM_GPU' ? 'CUSTOM_GPU' : 'KAGGLE_PRIMARY'),
      cpu_choice: body.cpu_choice ?? existingTop.cpu_choice ?? 'GITHUB_CPU',
      storage_choice: body.storage_choice ?? existingTop.storage_choice ?? 'TELEGRAM',
      cpu_worker: Object.keys(nextCpuWorker).length > 0 ? nextCpuWorker : undefined,
      gpu_routing: {
        ...existingRouting,
        preferred_mode: body.preferred_mode,
        custom_gpu: Object.keys(nextCustomGpu).length > 0 ? nextCustomGpu : { enabled: false, worker_url: '' },
        kaggle_primary: nextPrimary,
        kaggle_secondary: nextSecondary,
      },
      telegram_storage: nextTelegram,
      github_worker: Object.keys(nextGithub).length > 0 ? nextGithub : { worker_url: process.env.GITHUB_WORKER_URL || '' },
    };

    const existingList = await svc.list(userId);
    const existingMaster = existingList.find((i: any) => i.name === 'gpu_routing_master');

    if (existingMaster) {
      await svc.update(existingMaster.id, userId, {
        config: configPayload,
        status: 'active',
        is_default: true,
        request_id: requestId,
      });
    } else {
      await svc.create(userId, {
        name: 'gpu_routing_master',
        provider_type: body.preferred_mode === 'CUSTOM_GPU' ? 'own_gpu' : 'kaggle',
        config: configPayload,
        is_default: true,
        request_id: requestId,
      });
    }

    if (typeof body.groq_api_key === 'string' && body.groq_api_key.trim()) {
      await upsertProviderConfig(userId, 'groq', 'groq_default', body.groq_api_key.trim(), requestId);
    }
    if (typeof body.gemini_api_key === 'string' && body.gemini_api_key.trim()) {
      await upsertProviderConfig(userId, 'gemini', 'gemini_default', body.gemini_api_key.trim(), requestId);
    }

    const kaggleDeployResult: Record<string, unknown> = {};
    if (body.auto_deploy_kaggle && nextPrimary.username && nextPrimary.api_key) {
      kaggleDeployResult.primary = await pushKaggleKernel(
        String(nextPrimary.username),
        String(nextPrimary.api_key),
        nextPrimary.notebook_slug || 'anime-gpu-worker-primary',
        datasetSlug,
        'kaggle_story_engine',
        userId,
        tenantId
      );
    }
    if (body.auto_deploy_kaggle && nextSecondary.username && nextSecondary.api_key) {
      kaggleDeployResult.secondary = await pushKaggleKernel(
        String(nextSecondary.username),
        String(nextSecondary.api_key),
        nextSecondary.notebook_slug || 'anime-gpu-worker-secondary',
        datasetSlug,
        'kaggle_secondary_engine',
        userId,
        tenantId
      );
    }

    const refreshedList = await svc.list(userId);
    const refreshedMaster = refreshedList.find((item) => item.name === 'gpu_routing_master');
    return {
      data: {
        ok: true,
        preferred_mode: body.preferred_mode,
        kaggle_deploy: kaggleDeployResult,
        config: gpuPresentation(refreshedList, refreshedMaster),
      },
      meta: { request_id: requestId },
    };
  });

  app.post('/v1/anime/infrastructure/gpu/ensure', { schema: { body: EnsureGpuBody }, preHandler: [app.authenticate] }, async (request: any) => {
    const userId = authCheck(request);
    const tenantId = request.body?.tenant_id
      ? (await resolveTenant(userId, request.body.tenant_id)).tenant.id
      : null;
    const data = await ensureKaggleWorkerForUser(userId, tenantId);
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/prompts/library/meta', { preHandler: [app.authenticate] }, async (request: any) => {
    const userId = authCheck(request);
    const projectId = typeof request.query?.project_id === 'string' && request.query.project_id.trim()
      ? request.query.project_id.trim()
      : undefined;
    const metadata = await buildCreativeMetadata(userId, projectId);
    const genreTemplates = metadata.genre_definitions
      .filter((definition) => !definition.custom)
      .map((definition) => ({
        id: definition.key,
        genre: definition.title,
        title: `${definition.title} Prompt`,
        visual_medium: 'ANIME',
        format: 'SERIES',
        model_hint: 'DEFAULT',
        tags: [definition.key, 'genre', 'template'],
        prompt_text: definition.prompt_text,
      }));
    return {
      data: {
        ...metadata,
        formats: PROMPT_FORMATS,
        models: PROMPT_MODELS,
        genre_templates: genreTemplates,
      },
      meta: { request_id: request.anime?.request_id },
    };
  });

  app.post('/v1/anime/prompts/validate-compatibility', { schema: { body: CompatibilityBody }, preHandler: [app.authenticate] }, async (request: any) => {
    const result = evaluatePromptCompatibility(request.body);
    return { data: result, meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/prompts', { schema: { querystring: PromptListQuery }, preHandler: [app.authenticate, guardOptionalPromptProject(PROMPT_READ_ROLES)] }, async (request: any) => {
    const userId = authCheck(request);
    const query = request.query ?? {};
    const projectId = query.project_id as string | undefined;
    let dbQuery = animeSupabase
      .from('user_system_prompts')
      .select('*')
      .eq('user_id', userId)
      .order('is_favorite', { ascending: false })
      .order('updated_at', { ascending: false });

    if (projectId) {
      dbQuery = dbQuery.or(`project_id.eq.${projectId},project_id.is.null`);
    }
    if (query.prompt_category) dbQuery = dbQuery.eq('prompt_category', String(query.prompt_category).toUpperCase());
    if (query.genre) dbQuery = dbQuery.eq('genre', query.genre);
    if (query.format) dbQuery = dbQuery.eq('format', String(query.format).toUpperCase());
    if (query.is_favorite === 'true') dbQuery = dbQuery.eq('is_favorite', true);
    if (query.is_favorite === 'false') dbQuery = dbQuery.eq('is_favorite', false);
    if (query.include_archived !== 'true') dbQuery = dbQuery.eq('is_archived', false);
    const searchTerm = query.q ? String(query.q).toLowerCase() : null;
    if (searchTerm && !projectId) {
      const term = escapeLike(searchTerm);
      dbQuery = dbQuery.or(`title.ilike.%${term}%,prompt_text.ilike.%${term}%,genre.ilike.%${term}%`);
    }

    const { data, error } = await dbQuery;
    if (error) {
      return { data: [], meta: { request_id: request.anime?.request_id, warning: error.message } };
    }
    let rows = data ?? [];
    if (searchTerm && projectId) {
      rows = rows.filter((row: any) => ['title', 'prompt_text', 'genre']
        .some((field) => String(row?.[field] ?? '').toLowerCase().includes(searchTerm)));
    }
    return { data: rows, meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/prompts', { schema: { body: CreatePromptBody }, preHandler: [app.authenticate, guardOptionalPromptProject(PROMPT_WRITE_ROLES)] }, async (request: any, reply: any) => {
    const userId = authCheck(request);
    const projectId = request.body.project_id || null;
    const promptCategory = normalizePromptCategory(request.body.prompt_category);
    const title = String(request.body.title || '').trim();
    if (!title) throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Prompt title is required.' });
    const visualMedium = resolvePromptStorageMedium(promptCategory, request.body.visual_medium, title);
    const genreValue = promptCategory === 'GENRE'
      ? canonicalGenreTitle(request.body.genre || title)
      : (request.body.genre ? canonicalGenreTitle(request.body.genre) : null);
    if (!['GENRE', 'VISUAL_MEDIUM'].includes(promptCategory)) {
      const compatibility = evaluatePromptCompatibility({
        genre: request.body.genre,
        format: request.body.format,
        visual_medium: visualMedium,
        model_hint: request.body.model_hint,
      });
      if (!compatibility.compatible) {
        throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: compatibility.reasons.join(' ') });
      }
    }
    if (promptCategory === 'GENRE') {
      await ensureCreativePromptDoesNotExist({ userId, projectId, category: promptCategory, identity: genreValue || title });
    }
    if (promptCategory === 'VISUAL_MEDIUM') {
      await ensureCreativePromptDoesNotExist({ userId, projectId, category: promptCategory, identity: visualMedium || title });
    }

    const { data, error } = await animeSupabase
      .from('user_system_prompts')
      .insert([{
        user_id: userId,
        project_id: projectId,
        title,
        visual_medium: visualMedium,
        prompt_category: promptCategory,
        genre: genreValue,
        format: request.body.format || null,
        model_hint: request.body.model_hint || null,
        tags: request.body.tags || [],
        is_favorite: Boolean(request.body.is_favorite),
        prompt_text: request.body.prompt_text,
        is_default: false,
      }])
      .select()
      .single();

    if (error) {
      throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: error.message });
    }

    if (projectId && data?.id) {
      await animeSupabase
        .from('project_prompt_associations')
        .upsert([{ project_id: projectId, prompt_id: data.id, user_id: userId, surface: promptCategory }], { onConflict: 'project_id,prompt_id' });
      if (promptCategory === 'GENRE' && data.genre) {
        await appendProjectGenre(projectId, userId, data.genre);
      }
    }

    if (Boolean(request.body.set_active) && projectId && data?.id && promptCategory === 'BIBLE') {
      await animeSupabase
        .from('projects')
        .update({ active_system_prompt_id: data.id })
        .eq('id', projectId)
        .eq('user_id', userId);
    }

    void reply.status(201);
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.patch('/v1/anime/prompts/:id', { schema: { params: IdParams, body: UpdatePromptBody }, preHandler: [app.authenticate] }, async (request: any) => {
    const userId = authCheck(request);
    const patch: Record<string, any> = {};
    for (const key of ['title', 'visual_medium', 'genre', 'format', 'model_hint', 'tags', 'is_favorite', 'is_archived', 'prompt_text']) {
      if (request.body[key] !== undefined) patch[key] = request.body[key];
    }
    if (request.body.prompt_category !== undefined) patch.prompt_category = normalizePromptCategory(request.body.prompt_category);
    if (Object.keys(patch).length === 0) {
      throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'No prompt fields to update.' });
    }

    const { data: existing, error: fetchError } = await animeSupabase
      .from('user_system_prompts')
      .select('*')
      .eq('id', request.params.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (fetchError) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: fetchError.message });
    if (!existing) throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'Prompt not found.' });

    const existingCategory = normalizePromptCategory(existing.prompt_category);
    if (['GENRE', 'VISUAL_MEDIUM'].includes(existingCategory)) {
      if (patch.title !== undefined && String(patch.title).trim() !== String(existing.title || '').trim()) {
        throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Creative identity titles are stable. Edit the prompt text instead of renaming this entry.' });
      }
      if (patch.prompt_category !== undefined && patch.prompt_category !== existingCategory) {
        throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Creative prompt categories cannot be changed.' });
      }
      if (existingCategory === 'GENRE' && patch.genre !== undefined && canonicalGenreTitle(patch.genre) !== canonicalGenreTitle(existing.genre || existing.title)) {
        throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Genre identity is stable. Edit the prompt text instead.' });
      }
      if (existingCategory === 'VISUAL_MEDIUM' && patch.visual_medium !== undefined && canonicalMediumKey(patch.visual_medium) !== canonicalMediumKey(existing.visual_medium || existing.title)) {
        throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Visual medium identity is stable. Edit the prompt text instead.' });
      }
    }
    if (patch.visual_medium !== undefined) {
      patch.visual_medium = resolvePromptStorageMedium(patch.prompt_category || existingCategory, patch.visual_medium, existing.title || 'ANIME');
    }
    if (patch.genre !== undefined) patch.genre = canonicalGenreTitle(patch.genre);

    if (!['GENRE', 'VISUAL_MEDIUM'].includes(existingCategory)) {
      const compatibility = evaluatePromptCompatibility({
        genre: patch.genre ?? existing.genre,
        format: patch.format ?? existing.format,
        visual_medium: patch.visual_medium ?? existing.visual_medium,
        model_hint: patch.model_hint ?? existing.model_hint,
      });
      if (!compatibility.compatible) {
        throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: compatibility.reasons.join(' ') });
      }
    }

    const { data, error } = await animeSupabase
      .from('user_system_prompts')
      .update(patch)
      .eq('id', request.params.id)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: error.message });
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/prompts/:id/favorite', { schema: { params: IdParams }, preHandler: [app.authenticate] }, async (request: any) => {
    const userId = authCheck(request);
    const { data: existing, error: fetchError } = await animeSupabase
      .from('user_system_prompts')
      .select('id, is_favorite')
      .eq('id', request.params.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (fetchError) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: fetchError.message });
    if (!existing) throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'Prompt not found.' });

    const next = !Boolean(existing.is_favorite);
    const { data, error } = await animeSupabase
      .from('user_system_prompts')
      .update({ is_favorite: next })
      .eq('id', request.params.id)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: error.message });
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/prompts/:id/versions', { schema: { params: IdParams }, preHandler: [app.authenticate] }, async (request: any) => {
    const userId = authCheck(request);
    const { data: prompt } = await animeSupabase
      .from('user_system_prompts')
      .select('id')
      .eq('id', request.params.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!prompt) throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'Prompt not found.' });

    const { data, error } = await animeSupabase
      .from('prompt_versions')
      .select('*')
      .eq('prompt_id', request.params.id)
      .eq('user_id', userId)
      .order('version', { ascending: false });
    if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: error.message });
    return { data: data ?? [], meta: { request_id: request.anime?.request_id } };
  });


  app.post('/v1/anime/prompts/:id/activate', { schema: { params: IdParams }, preHandler: [app.authenticate, guardOptionalPromptProject(PROMPT_WRITE_ROLES)] }, async (request: any) => {
    const userId = authCheck(request);
    const projectId = String(request.body?.project_id || '');
    const surface = String(request.body?.surface || 'BIBLE').toUpperCase();
    if (!projectId) throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'project_id is required.' });
    const { data: project, error: projectError } = await animeSupabase
      .from('projects')
      .select('id, user_id, genre, story_bible')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();
    if (projectError) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: projectError.message });
    if (!project) throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'Project not found.' });
    const { data: prompt, error: promptError } = await animeSupabase
      .from('user_system_prompts')
      .select('id, prompt_category, genre')
      .eq('id', request.params.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (promptError) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: promptError.message });
    if (!prompt) throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'Prompt not found.' });
    const promptCategory = normalizePromptCategory(prompt.prompt_category);
    if (surface === 'BIBLE' && promptCategory !== 'BIBLE') {
      throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Only BIBLE prompts can be activated for Story Bible.' });
    }
    if (['GENRE', 'VISUAL_MEDIUM'].includes(surface) && promptCategory !== surface) {
      throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: `Only ${surface} prompts can be associated with ${surface}.` });
    }
    const projectGenres = parseGenreList(project.genre, project.story_bible && (project.story_bible as Record<string, any>).genre);
    const promptGenre = canonicalGenreTitle(prompt.genre);
    if (promptCategory === 'GENRE' && promptGenre && !projectGenres.some((genre) => genre.toLowerCase() === promptGenre.toLowerCase())) {
      throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: `Genre ${prompt.genre} is not selected in this project.` });
    }
    const { error: associateError } = await animeSupabase
      .from('project_prompt_associations')
      .upsert([{ project_id: projectId, prompt_id: request.params.id, user_id: userId, surface: promptCategory }], { onConflict: 'project_id,prompt_id' });
    if (associateError) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: associateError.message });
    const { data: currentProject } = await animeSupabase
      .from('projects')
      .select('id, active_system_prompt_id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();
    let updated: Record<string, any> = currentProject || { id: projectId };
    if (promptCategory === 'BIBLE') {
      const { data: activated, error: activateError } = await animeSupabase
        .from('projects')
        .update({ active_system_prompt_id: request.params.id })
        .eq('id', projectId)
        .eq('user_id', userId)
        .select('id, active_system_prompt_id')
        .single();
      if (activateError) {
        await animeSupabase.from('project_prompt_associations').delete().eq('project_id', projectId).eq('prompt_id', request.params.id);
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: activateError.message });
      }
      updated = activated;
    }
    return { data: { ...updated, association: { project_id: projectId, prompt_id: request.params.id, surface: promptCategory } }, meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/prompts/:id/associate', { schema: { params: IdParams }, preHandler: [app.authenticate, guardOptionalPromptProject(PROMPT_WRITE_ROLES)] }, async (request: any) => {
    const userId = authCheck(request);
    const projectId = String(request.body?.project_id || '');
    if (!projectId) throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'project_id is required.' });
    const { data: prompt } = await animeSupabase
      .from('user_system_prompts')
      .select('id, prompt_category')
      .eq('id', request.params.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!prompt) throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'Prompt not found.' });

    const { data, error } = await animeSupabase
      .from('project_prompt_associations')
      .upsert([{
        project_id: projectId,
        prompt_id: request.params.id,
        user_id: userId,
        surface: String(request.body?.surface || prompt.prompt_category || 'LIBRARY'),
      }], { onConflict: 'project_id,prompt_id' })
      .select()
      .single();
    if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: error.message });
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
