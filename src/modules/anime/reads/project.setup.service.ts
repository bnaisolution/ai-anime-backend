import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { canonicalMediumKey, parseGenreList } from '../prompts/creative.registry';
import { createProjectRecord } from './projects.service';
import { buildRuntimeContract, MAX_EPISODE_DURATION_MIN, screenplayWordTarget } from '../runtime/runtimeContract';

function integerInRange(value: unknown, fallback: number, min: number, max: number, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (!Number.isInteger(parsed)) {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: `${label} must be a whole number.` });
  }
  if (parsed < min || parsed > max) {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: `${label} must be between ${min} and ${max}.` });
  }
  return parsed;
}

function text(value: unknown, max = 4_000): string | null {
  if (value === undefined || value === null) return null;
  const clean = String(value).trim();
  return clean ? clean.slice(0, max) : null;
}

export interface ProjectSetupInput {
  name?: string;
  title?: string;
  genre?: string;
  visual_medium?: string;
  description?: string | null;
  premise?: string | null;
  project_format?: string;
  budget_ceiling?: number;
  target_episode_count?: number;
  episode_duration_min?: number;
  script_word_count?: number;
  total_seasons?: number;
  episodes_per_season?: number;
  auto_approve?: boolean;
}

export interface ProjectSetupFields {
  name: string;
  genre: string;
  visualMedium: string;
  description: string | null;
  bible: Record<string, unknown>;
}

function projectFormat(value: unknown): string {
  const clean = String(value || 'SERIES').trim().toUpperCase();
  return ['SERIES', 'MOVIE', 'SHORT', 'REEL'].includes(clean) ? clean : 'SERIES';
}

export function normalizeProjectSetup(input: ProjectSetupInput, existingBible: Record<string, unknown> = {}): ProjectSetupFields {
  const name = String(input.name || input.title || '').trim().slice(0, 120);
  if (!name) {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Project name is required.' });
  }
  const genre = parseGenreList(input.genre, existingBible.genre).join(', ') || 'Action / Fantasy';
  const visualMedium = canonicalMediumKey(input.visual_medium ?? existingBible.visual_medium ?? 'ANIME');
  const description = input.description !== undefined
    ? text(input.description, 4_000)
    : input.premise !== undefined
      ? text(input.premise, 4_000)
      : null;
  const bible: Record<string, unknown> = {
    ...existingBible,
    title: name,
    genre,
    visual_medium: visualMedium,
    project_format: projectFormat(input.project_format ?? existingBible.project_format),
    premise: description || text(existingBible.premise) || '',
    auto_approve: input.auto_approve !== undefined
      ? Boolean(input.auto_approve)
      : Boolean(existingBible.auto_approve ?? false),
    budget_ceiling: input.budget_ceiling !== undefined
      ? Math.max(0, Number(input.budget_ceiling) || 0)
      : Number(existingBible.budget_ceiling ?? 1000),
    target_episode_count: integerInRange(
      input.target_episode_count ?? existingBible.target_episode_count,
      12, 1, 500, 'Target episode count'
    ),
    episode_duration_min: integerInRange(
      input.episode_duration_min ?? existingBible.episode_duration_min,
      24, 1, MAX_EPISODE_DURATION_MIN, 'Episode duration'
    ),
    total_seasons: integerInRange(
      input.total_seasons ?? existingBible.total_seasons,
      1, 1, 100, 'Total seasons'
    ),
    episodes_per_season: integerInRange(
      input.episodes_per_season ?? existingBible.episodes_per_season,
      12, 1, 500, 'Episodes per season'
    ),
  };
  const runtimeContract = buildRuntimeContract(bible.episode_duration_min);
  bible.runtime_contract = runtimeContract;
  bible.target_duration_sec = runtimeContract.target_duration_sec;
  bible.script_word_count = screenplayWordTarget(runtimeContract);
  return { name, genre, visualMedium, description, bible };
}

export async function createProjectFromSetup(params: {
  userId: string;
  tenantId?: string | null;
  input: ProjectSetupInput;
}): Promise<any> {
  const fields = normalizeProjectSetup(params.input);
  return createProjectRecord({
    userId: params.userId,
    tenantId: params.tenantId ?? null,
    project: {
      name: fields.name,
      is_active: true,
      current_season: 1,
      current_episode: 1,
      genre: fields.genre,
      visual_medium: fields.visualMedium,
      description: fields.description,
      story_bible: fields.bible,
    },
  });
}

export async function updateProjectFromSetup(params: {
  userId: string;
  projectId: string;
  input: ProjectSetupInput;
}): Promise<any> {
  const { data: existing, error } = await animeSupabase
    .from('projects')
    .select('*')
    .eq('id', params.projectId)
    .maybeSingle();
  if (error || !existing) {
    throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'Project not found.', cause: error });
  }
  const currentBible = (existing.story_bible && typeof existing.story_bible === 'object')
    ? existing.story_bible as Record<string, unknown>
    : {};
  const fields = normalizeProjectSetup({
    ...params.input,
    name: params.input.name || params.input.title || existing.name,
    description: params.input.description !== undefined
      ? params.input.description
      : params.input.premise !== undefined
        ? params.input.premise
        : existing.description ?? undefined,
  }, currentBible);
  const { data: updated, error: updateError } = await animeSupabase
    .from('projects')
    .update({
      name: fields.name,
      genre: fields.genre,
      visual_medium: fields.visualMedium,
      description: fields.description,
      story_bible: fields.bible,
    })
    .eq('id', params.projectId)
    .select('*')
    .single();
  if (updateError || !updated) {
    throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to update project settings.', cause: updateError });
  }
  return updated;
}
