import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

export const PROJECT_FORMATS = ['SERIES', 'MOVIE', 'SHORT', 'REEL', 'MUSIC_VIDEO', 'TRAILER'] as const;
export type ProjectFormat = (typeof PROJECT_FORMATS)[number];

export const PROJECT_LANGUAGES = ['hi', 'en'] as const;
export type ProjectLanguage = (typeof PROJECT_LANGUAGES)[number];

export const DEFAULT_PROJECT_FORMAT: ProjectFormat = 'SERIES';
export const DEFAULT_PROJECT_LANGUAGE: ProjectLanguage = 'hi';

export const PROJECT_FORMAT_RULES: Record<ProjectFormat, string> = {
  SERIES: 'Episodic serial storytelling with a recurring cast, ongoing arc, and a hook that carries into the next episode.',
  MOVIE: 'Single feature-length story with a complete three-act arc, closed ending, and no next-episode hook.',
  SHORT: 'Compact single story with one central conflict, fast escalation, and a complete ending.',
  REEL: 'Very short vertical-first story beat with one clear hook, one turn, and one payoff.',
  MUSIC_VIDEO: 'Music-led visual storytelling; prioritize rhythm, lyrical emotion, performance imagery, and montage over dense dialogue.',
  TRAILER: 'Promotional trailer structure: strong hook, escalating highlight beats, title-card energy, and no full-resolution plot.',
};

export const LANGUAGE_NAMES: Record<ProjectLanguage, string> = {
  hi: 'Hindi',
  en: 'English',
};

function normalizeKey(value: unknown): string {
  return String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function normalizeProjectFormat(
  value: unknown,
  fallback: ProjectFormat = DEFAULT_PROJECT_FORMAT
): ProjectFormat {
  const clean = normalizeKey(value);
  if (!clean) return fallback;
  if ((PROJECT_FORMATS as readonly string[]).includes(clean)) return clean as ProjectFormat;
  throw new AnimeError({
    code: AnimeErrorCode.OUTPUT_INVALID,
    message: `Unsupported project format '${clean}'. Use one of: ${PROJECT_FORMATS.join(', ')}.`,
  });
}

export function normalizeProjectLanguage(
  value: unknown,
  fallback: ProjectLanguage = DEFAULT_PROJECT_LANGUAGE
): ProjectLanguage {
  const clean = String(value ?? '').trim().toLowerCase().split(/[-_]/)[0];
  if (!clean) return fallback;
  if ((PROJECT_LANGUAGES as readonly string[]).includes(clean)) return clean as ProjectLanguage;
  throw new AnimeError({
    code: AnimeErrorCode.OUTPUT_INVALID,
    message: `Unsupported project language '${clean}'. Use one of: ${PROJECT_LANGUAGES.join(', ')}.`,
  });
}

export function projectLanguageName(value: unknown): string {
  const language = normalizeProjectLanguage(value);
  return LANGUAGE_NAMES[language];
}

export function projectFormatRules(value: unknown): string {
  return PROJECT_FORMAT_RULES[normalizeProjectFormat(value)];
}
