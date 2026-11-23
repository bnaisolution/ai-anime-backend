export const MIN_EPISODE_DURATION_MIN = 1;
export const MAX_EPISODE_DURATION_MIN = 30;
export const RUNTIME_CONTRACT_VERSION = 2;

const HINDI_DIALOGUE_WORDS_PER_SECOND = 2.2;
const TARGET_SECONDS_PER_SHOT = 7;
const SHOTS_PER_SCENE = 3;

export interface RuntimeContract {
  version: number;
  target_duration_sec: number;
  target_duration_min: number;
  tolerance_sec: number;
  dialogue_wps: number;
  dialogue_word_budget: number;
  screenplay_word_range: [number, number];
  act_count: number;
  beat_range: [number, number];
  scene_range: [number, number];
  shot_range: [number, number];
  min_shot_sec: number;
  avg_shot_sec: number;
  max_shot_sec: number;
  render_tier: 'FULL_MOTION' | 'SELECTIVE_MOTION' | 'HYBRID';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rangeFor(center: number, spread: number, min: number, max: number): [number, number] {
  const low = clamp(Math.round(center * (1 - spread)), min, max);
  const high = clamp(Math.round(center * (1 + spread)), min, max);
  return low <= high ? [low, high] : [high, low];
}

function actCount(targetMin: number): number {
  if (targetMin <= 3) return 1;
  if (targetMin <= 8) return 3;
  if (targetMin <= 15) return 4;
  return 6;
}

function renderTier(targetMin: number): RuntimeContract['render_tier'] {
  if (targetMin <= 3) return 'FULL_MOTION';
  if (targetMin <= 10) return 'SELECTIVE_MOTION';
  return 'HYBRID';
}

export function normalizeEpisodeDurationMinutes(value: unknown, fallback = 24): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return clamp(Math.round(fallback), MIN_EPISODE_DURATION_MIN, MAX_EPISODE_DURATION_MIN);
  return clamp(Math.round(parsed), MIN_EPISODE_DURATION_MIN, MAX_EPISODE_DURATION_MIN);
}

export function buildRuntimeContract(episodeDurationMin: unknown): RuntimeContract {
  const targetMin = normalizeEpisodeDurationMinutes(episodeDurationMin);
  const targetSec = targetMin * 60;
  const dialogueWords = Math.round(targetSec * HINDI_DIALOGUE_WORDS_PER_SECOND);
  const screenplayLow = Math.round(dialogueWords / 0.60);
  const screenplayHigh = Math.round(dialogueWords / 0.50);
  const beatCenter = 4 + targetMin * 2;
  const shotCenter = targetSec / TARGET_SECONDS_PER_SHOT;
  const sceneCenter = shotCenter / SHOTS_PER_SCENE;

  return {
    version: RUNTIME_CONTRACT_VERSION,
    target_duration_sec: targetSec,
    target_duration_min: targetMin,
    tolerance_sec: Math.max(2, Math.round(targetSec * 0.01)),
    dialogue_wps: HINDI_DIALOGUE_WORDS_PER_SECOND,
    dialogue_word_budget: dialogueWords,
    screenplay_word_range: [screenplayLow, screenplayHigh],
    act_count: actCount(targetMin),
    beat_range: rangeFor(beatCenter, 0.15, 5, 70),
    scene_range: rangeFor(sceneCenter, 0.15, 3, 90),
    shot_range: rangeFor(shotCenter, 0.15, 8, 270),
    min_shot_sec: 3,
    avg_shot_sec: TARGET_SECONDS_PER_SHOT,
    max_shot_sec: 10,
    render_tier: renderTier(targetMin),
  };
}

export function screenplayWordTarget(contract: RuntimeContract): number {
  return Math.round((contract.screenplay_word_range[0] + contract.screenplay_word_range[1]) / 2);
}
