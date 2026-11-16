import { animeSupabase } from '../db/anime.supabase';
import {
  buildGenrePromptContext,
  buildMediumPromptContext,
  canonicalMediumKey,
  canonicalMediumTitle,
  canonicalGenreTitle,
  CREATIVE_REGISTRY_VERSION,
  GENRE_DEFINITIONS,
  MEDIUM_DEFINITIONS,
  normalizeKey,
  parseGenreList,
  PROMPT_CATEGORIES,
  resolveGenrePrompt,
  resolveMediumPrompt,
  type ResolvedCreativePrompt,
} from './creative.registry';

export interface ProjectCreativeRow {
  readonly id: string;
  readonly genre?: string | null;
  readonly visual_medium?: string | null;
  readonly story_bible?: Record<string, unknown> | null;
}

export interface ProjectCreativeOptions {
  readonly extraGenres?: readonly string[];
}

export interface ProjectCreativeContext {
  readonly selectedGenres: string[];
  readonly genrePrompts: ResolvedCreativePrompt[];
  readonly genrePromptContext: string;
  readonly visualMedium: string;
  readonly visualMediumTitle: string;
  readonly mediumPrompt: ResolvedCreativePrompt;
  readonly mediumPromptContext: string;
  readonly registryVersion: string;
}

function bibleValue(bible: Record<string, unknown> | null | undefined, key: string): unknown {
  return bible && typeof bible === 'object' ? bible[key] : undefined;
}

function uniqueGenres(genres: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const genre of genres) {
    const title = canonicalGenreTitle(genre);
    const key = normalizeKey(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(title);
  }
  return result;
}

export async function loadCreativePromptRows(
  userId: string,
  projectId: string
): Promise<Record<string, any>[]> {
  const { data, error } = await animeSupabase
    .from('user_system_prompts')
    .select('id, project_id, title, visual_medium, prompt_category, genre, version, prompt_text, is_archived, created_at, updated_at')
    .eq('user_id', userId)
    .in('prompt_category', ['GENRE', 'VISUAL_MEDIUM'])
    .eq('is_archived', false)
    .or(`project_id.eq.${projectId},project_id.is.null`)
    .order('updated_at', { ascending: false });
  if (error) return [];
  return Array.isArray(data) ? data : [];
}

export function buildProjectCreativeContext(
  project: ProjectCreativeRow,
  promptRows: readonly Record<string, any>[],
  options: ProjectCreativeOptions = {}
): ProjectCreativeContext {
  const bible = (project.story_bible && typeof project.story_bible === 'object')
    ? project.story_bible as Record<string, unknown>
    : {};
  const projectGenres = parseGenreList(project.genre);
  const baseGenres = projectGenres.length > 0 ? projectGenres : parseGenreList(bibleValue(bible, 'genre'));
  const selectedGenres = uniqueGenres([
    ...baseGenres,
    ...(options.extraGenres ?? []).flatMap((genre) => parseGenreList(genre)),
  ]);
  const visualMedium = canonicalMediumKey(project.visual_medium ?? bibleValue(bible, 'visual_medium') ?? 'ANIME');
  const visualMediumTitle = canonicalMediumTitle(project.visual_medium ?? bibleValue(bible, 'visual_medium') ?? visualMedium);
  const genrePrompts = selectedGenres.map((genre) => resolveGenrePrompt(genre, promptRows));
  const mediumPrompt = resolveMediumPrompt(visualMedium, promptRows);
  return {
    selectedGenres,
    genrePrompts,
    genrePromptContext: buildGenrePromptContext(genrePrompts),
    visualMedium,
    visualMediumTitle,
    mediumPrompt,
    mediumPromptContext: buildMediumPromptContext(mediumPrompt),
    registryVersion: CREATIVE_REGISTRY_VERSION,
  };
}

export async function resolveProjectCreativeContext(
  userId: string,
  project: ProjectCreativeRow
): Promise<ProjectCreativeContext> {
  const promptRows = await loadCreativePromptRows(userId, project.id);
  return buildProjectCreativeContext(project, promptRows);
}

export function creativeConfigurationSnapshot(
  project: ProjectCreativeRow,
  context: ProjectCreativeContext,
  seriesConfig: Record<string, number>
): Record<string, unknown> {
  return {
    registry_version: context.registryVersion,
    project_id: project.id,
    selected_genres: context.selectedGenres,
    genre_prompts: context.genrePrompts.map((prompt) => ({
      key: prompt.key,
      title: prompt.title,
      prompt_id: prompt.promptId,
      version: prompt.version,
      custom: prompt.custom,
    })),
    visual_medium: context.visualMedium,
    visual_medium_title: context.visualMediumTitle,
    visual_medium_prompt_id: context.mediumPrompt.promptId,
    visual_medium_prompt_version: context.mediumPrompt.version,
    visual_medium_prompt_custom: context.mediumPrompt.custom,
    series_config: seriesConfig,
    configuration_locked: true,
  };
}

export function genreDisplayListForProject(project: ProjectCreativeRow): string[] {
  const bible = (project.story_bible && typeof project.story_bible === 'object')
    ? project.story_bible as Record<string, unknown>
    : {};
  const projectGenres = parseGenreList(project.genre);
  return projectGenres.length > 0 ? projectGenres : parseGenreList(bibleValue(bible, 'genre'));
}

export function canonicalizeProjectGenreInput(value: unknown): string {
  return parseGenreList(value).map(canonicalGenreTitle).join(', ');
}

export interface CreativeMetadata {
  readonly categories: readonly string[];
  readonly media: readonly string[];
  readonly genres: readonly string[];
  readonly genre_definitions: readonly Record<string, unknown>[];
  readonly medium_definitions: readonly Record<string, unknown>[];
  readonly project_selected_genres: readonly string[];
  readonly project_visual_medium: string;
  readonly registry_version: string;
}

export async function buildCreativeMetadata(
  userId: string,
  projectId?: string
): Promise<CreativeMetadata> {
  let project: ProjectCreativeRow | null = null;
  if (projectId) {
    const { data } = await animeSupabase
      .from('projects')
      .select('id, genre, visual_medium, story_bible')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle<ProjectCreativeRow>();
    project = data ?? null;
  }
  const promptRows = project
    ? await loadCreativePromptRows(userId, project.id)
    : await loadGlobalCreativePromptRows(userId);
  const projectSelected = project ? genreDisplayListForProject(project) : [];
  const projectMedium = project ? canonicalMediumKey(project.visual_medium ?? 'ANIME') : 'ANIME';
  const context = buildProjectCreativeContext(
    project ?? { id: projectId || 'global', genre: 'Action Fantasy', visual_medium: 'ANIME', story_bible: {} },
    promptRows
  );
  return {
    categories: PROMPT_CATEGORIES,
    media: context.mediumPrompt ? uniqueByKey([...MEDIUM_DEFINITIONS.map((item) => item.key), ...promptRows
      .filter((row) => String(row?.prompt_category || '').toUpperCase() === 'VISUAL_MEDIUM')
      .map((row) => canonicalMediumKey(row.visual_medium || row.title))]) : [],
    genres: uniqueByKey([...GENRE_DEFINITIONS.map((item) => item.title), ...projectSelected, ...promptRows
      .filter((row) => String(row?.prompt_category || '').toUpperCase() === 'GENRE')
      .map((row) => String(row.genre || row.title || '').trim())
      .filter(Boolean)]),
    genre_definitions: buildGenreDefinitions(promptRows, projectSelected),
    medium_definitions: buildMediumDefinitions(promptRows),
    project_selected_genres: projectSelected,
    project_visual_medium: projectMedium,
    registry_version: CREATIVE_REGISTRY_VERSION,
  };
}

async function loadGlobalCreativePromptRows(userId: string): Promise<Record<string, any>[]> {
  const { data, error } = await animeSupabase
    .from('user_system_prompts')
    .select('id, project_id, title, visual_medium, prompt_category, genre, version, prompt_text, is_archived, created_at, updated_at')
    .eq('user_id', userId)
    .in('prompt_category', ['GENRE', 'VISUAL_MEDIUM'])
    .eq('is_archived', false)
    .is('project_id', null)
    .order('updated_at', { ascending: false });
  if (error) return [];
  return Array.isArray(data) ? data : [];
}

function buildGenreDefinitions(promptRows: readonly Record<string, any>[], selectedTitles: readonly string[] = []): Record<string, unknown>[] {
  const definitions = GENRE_DEFINITIONS.map((definition) => {
    const resolved = resolveGenrePrompt(definition.title, promptRows);
    return {
      key: definition.key,
      title: definition.title,
      aliases: definition.aliases,
      prompt_text: resolved.promptText,
      prompt_id: resolved.promptId,
      version: resolved.version,
      custom: resolved.custom,
    };
  });
  const builtInKeys = new Set(GENRE_DEFINITIONS.map((item) => normalizeKey(item.title)));
  const customDefinitions = promptRows
    .filter((row) => String(row?.prompt_category || '').toUpperCase() === 'GENRE')
    .filter((row) => !builtInKeys.has(normalizeKey(row.genre || row.title)))
    .filter((row, index, rows) => rows.findIndex((other) => normalizeKey(other.genre || other.title) === normalizeKey(row.genre || row.title)) === index)
    .map((row) => ({
      key: normalizeKey(row.genre || row.title),
      title: String(row.genre || row.title || 'Custom Genre'),
      aliases: [],
      prompt_text: String(row.prompt_text || ''),
      prompt_id: String(row.id),
      version: Number(row.version || 1),
      custom: true,
      project_id: row.project_id ?? null,
    }));
  const known = new Set([...definitions, ...customDefinitions].map((item) => normalizeKey(String(item.title))));
  const selectedOnly = selectedTitles
    .filter((title) => title && !known.has(normalizeKey(title)))
    .map((title) => {
      const resolved = resolveGenrePrompt(title, promptRows);
      return {
        key: normalizeKey(title),
        title,
        aliases: [],
        prompt_text: resolved.promptText,
        prompt_id: resolved.promptId,
        version: resolved.version,
        custom: true,
      };
    });
  return [...definitions, ...customDefinitions, ...selectedOnly];
}

function buildMediumDefinitions(promptRows: readonly Record<string, any>[]): Record<string, unknown>[] {
  const definitions = MEDIUM_DEFINITIONS.map((definition) => {
    const resolved = resolveMediumPrompt(definition.key, promptRows);
    return {
      key: definition.key,
      title: definition.title,
      aliases: definition.aliases,
      prompt_text: resolved.promptText,
      prompt_id: resolved.promptId,
      version: resolved.version,
      custom: resolved.custom,
    };
  });
  const builtInKeys = new Set(MEDIUM_DEFINITIONS.map((item) => item.key));
  const customDefinitions = promptRows
    .filter((row) => String(row?.prompt_category || '').toUpperCase() === 'VISUAL_MEDIUM')
    .filter((row) => !builtInKeys.has(canonicalMediumKey(row.visual_medium || row.title)))
    .filter((row, index, rows) => rows.findIndex((other) => canonicalMediumKey(other.visual_medium || other.title) === canonicalMediumKey(row.visual_medium || row.title)) === index)
    .map((row) => ({
      key: canonicalMediumKey(row.visual_medium || row.title),
      title: String(row.title || row.visual_medium || 'Custom Medium'),
      aliases: [],
      prompt_text: String(row.prompt_text || ''),
      prompt_id: String(row.id),
      version: Number(row.version || 1),
      custom: true,
      project_id: row.project_id ?? null,
    }));
  return [...definitions, ...customDefinitions];
}

function uniqueByKey(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const key = normalizeKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}
