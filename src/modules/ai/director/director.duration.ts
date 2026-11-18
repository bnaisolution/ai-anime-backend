export const DEFAULT_EPISODE_DURATION_MIN = 24;
export const MIN_EPISODE_DURATION_SEC = 15;
export const MAX_EPISODE_DURATION_SEC = 6 * 60 * 60;
const DEFAULT_TOLERANCE_SEC = 60;

export type DurationSource = 'explicit' | 'persisted' | 'executing' | 'project_default';

export interface DurationBible {
  episode_duration_min?: unknown;
  duration_tolerance_sec?: unknown;
  duration_tolerance_pct?: unknown;
}

export interface TargetSelectionInput {
  seasonNo?: number | null;
  episodeNo?: number | null;
  projectDefaultSec?: number | null;
  explicitSec?: number | null;
  persistedSec?: number | null;
  executingSec?: number | null;
  toleranceSec?: number | null;
}

export interface TargetSelection {
  seasonNo: number;
  episodeNo: number;
  targetDurationSec: number;
  source: DurationSource;
  toleranceSec: number;
  conflict: boolean;
  conflictReason: string | null;
}

export interface DurationClassification {
  status: 'under' | 'on_target' | 'over' | 'unknown';
  deltaSec: number;
  targetDurationSec: number;
  actualDurationSec: number;
  toleranceSec: number;
}

function positiveNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function clampDurationSec(value: number): number {
  return Math.max(MIN_EPISODE_DURATION_SEC, Math.min(MAX_EPISODE_DURATION_SEC, Math.round(value)));
}

export function deriveProjectDefaultDurationSec(bible: DurationBible | null | undefined): number {
  const minutes = positiveNumber(bible?.episode_duration_min);
  if (minutes !== null) return clampDurationSec(minutes * 60);
  return DEFAULT_EPISODE_DURATION_MIN * 60;
}

export function resolveDurationToleranceSec(
  targetDurationSec: number,
  bible?: DurationBible | null,
  overrideSec?: number | null
): number {
  const explicit = positiveNumber(overrideSec) ?? positiveNumber(bible?.duration_tolerance_sec);
  if (explicit !== null) return Math.round(explicit);
  const pct = positiveNumber(bible?.duration_tolerance_pct);
  const fromPct = pct !== null ? Math.round(targetDurationSec * (pct / 100)) : 0;
  return Math.max(DEFAULT_TOLERANCE_SEC, fromPct);
}

export function resolveTargetSelection(input: TargetSelectionInput, bible?: DurationBible | null): TargetSelection {
  const projectDefault = clampDurationSec(positiveNumber(input.projectDefaultSec) ?? deriveProjectDefaultDurationSec(bible));
  const explicit = positiveNumber(input.explicitSec);
  const persisted = positiveNumber(input.persistedSec);
  const executing = positiveNumber(input.executingSec);

  let targetDurationSec = projectDefault;
  let source: DurationSource = 'project_default';
  if (persisted !== null) {
    targetDurationSec = clampDurationSec(persisted);
    source = 'persisted';
  } else if (executing !== null) {
    targetDurationSec = clampDurationSec(executing);
    source = 'executing';
  }
  if (explicit !== null) {
    targetDurationSec = clampDurationSec(explicit);
    source = 'explicit';
  }

  const toleranceSec = resolveDurationToleranceSec(targetDurationSec, bible, input.toleranceSec);
  let conflict = false;
  let conflictReason: string | null = null;
  if (explicit !== null && executing !== null) {
    const executingClamped = clampDurationSec(executing);
    if (Math.abs(explicit - executingClamped) > toleranceSec) {
      conflict = true;
      conflictReason = `Explicit target ${clampDurationSec(explicit)}s conflicts with executing episode target ${executingClamped}s. Regenerate explicitly or wait for the active run to finish.`;
    }
  }

  return {
    seasonNo: Math.max(1, Math.round(positiveNumber(input.seasonNo) ?? 1)),
    episodeNo: Math.max(1, Math.round(positiveNumber(input.episodeNo) ?? 1)),
    targetDurationSec,
    source,
    toleranceSec,
    conflict,
    conflictReason,
  };
}

export function classifyDuration(
  targetDurationSec: number,
  actualDurationSec: number,
  toleranceSec?: number | null
): DurationClassification {
  const target = positiveNumber(targetDurationSec);
  const actual = positiveNumber(actualDurationSec);
  if (target === null || actual === null) {
    return { status: 'unknown', deltaSec: 0, targetDurationSec: target ?? 0, actualDurationSec: actual ?? 0, toleranceSec: 0 };
  }
  const tolerance = positiveNumber(toleranceSec) ?? resolveDurationToleranceSec(target);
  const deltaSec = Math.round(actual - target);
  if (Math.abs(deltaSec) <= tolerance) {
    return { status: 'on_target', deltaSec, targetDurationSec: target, actualDurationSec: actual, toleranceSec: tolerance };
  }
  return {
    status: deltaSec < 0 ? 'under' : 'over',
    deltaSec,
    targetDurationSec: target,
    actualDurationSec: actual,
    toleranceSec: tolerance,
  };
}

export interface RuntimeClip {
  duration_sec?: unknown;
  scene_order?: unknown;
}

export function actualRuntimeSec(clips: RuntimeClip[] | null | undefined): { totalSec: number; counted: number; missing: number } {
  let totalSec = 0;
  let counted = 0;
  let missing = 0;
  for (const clip of clips || []) {
    const duration = positiveNumber(clip.duration_sec);
    if (duration === null) missing += 1;
    else {
      totalSec += duration;
      counted += 1;
    }
  }
  return { totalSec: Math.round(totalSec), counted, missing };
}

export function distributeTargetDuration(targetDurationSec: number, sceneCount: number): number[] {
  const count = Math.max(1, Math.floor(sceneCount));
  const target = clampDurationSec(targetDurationSec);
  const base = Math.floor(target / count);
  const remainder = target - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}
