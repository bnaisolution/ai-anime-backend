export interface CreativeDefinition {
  readonly key: string;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly promptText: string;
}

export interface ResolvedCreativePrompt {
  readonly key: string;
  readonly title: string;
  readonly promptId: string;
  readonly version: number;
  readonly promptText: string;
  readonly custom: boolean;
  readonly projectId: string | null;
}

export const CREATIVE_REGISTRY_VERSION = '2026-11-15.1';

export const PROMPT_CATEGORIES = ['BIBLE', 'EPISODE', 'IMAGE', 'AI_DIRECTOR', 'GENRE', 'VISUAL_MEDIUM'] as const;
export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

export const GENRE_DEFINITIONS: readonly CreativeDefinition[] = [
  {
    key: 'action',
    title: 'Action',
    aliases: ['action', 'action adventure'],
    promptText: 'Stage action around clear objectives, readable geography, and escalating costs. Every fight must change the balance of power, reveal character, or close a trap. Use cause-and-effect choreography, decisive close-ups, hard impacts, and consequences that persist into later episodes. Never let spectacle erase tactical logic.',
  },
  {
    key: 'fantasy',
    title: 'Fantasy',
    aliases: ['fantasy', 'high fantasy'],
    promptText: 'Build a coherent fantasy world through lived rules, costs, and social consequences. Magic must have limits, factions must have competing interests, and wonder must coexist with danger. Use mythic imagery, ancient structures, and a sense of history without dumping exposition.',
  },
  {
    key: 'dark_fantasy',
    title: 'Dark Fantasy',
    aliases: ['dark fantasy', 'grimdark'],
    promptText: 'Treat power as corrosive and survival as costly. Build dread through moral compromise, ruined beauty, occult systems, and victories that leave scars. The world should feel beautiful and hostile at once. Keep violence consequential, avoid gratuitous despair, and let hope remain fragile but real.',
  },
  {
    key: 'action_fantasy',
    title: 'Action Fantasy',
    aliases: ['action fantasy', 'action / fantasy', 'action-fantasy', 'fantasy action'],
    promptText: 'Fuse kinetic action with mythic wonder. Powers, artifacts, and monsters must obey established rules while creating spectacular problems. Alternate disciplined combat with moments of awe, and make every escalation demand a new tactic, sacrifice, or moral choice. Keep the fantasy identity inseparable from the action.',
  },
  {
    key: 'thriller',
    title: 'Thriller',
    aliases: ['thriller', 'suspense'],
    promptText: 'Drive the story with a ticking clock, information asymmetry, and escalating stakes. Every scene must change the balance of power or reveal a new cost. Use pursuit, surveillance, betrayal, and narrow escapes, but keep the audience oriented enough to feel the trap closing.',
  },
  {
    key: 'horror',
    title: 'Horror',
    aliases: ['horror', 'supernatural horror'],
    promptText: 'Build dread through restrained pacing, negative space, unsettling sound, and a persistent visual motif. Keep the threat partially unseen until the final act. Horror must attack a character-specific fear or buried guilt, and survival should require a painful choice rather than luck alone.',
  },
  {
    key: 'romance',
    title: 'Romance',
    aliases: ['romance', 'romantic drama'],
    promptText: 'Center emotional honesty and gradual intimacy. Use recurring visual motifs, meaningful silence, and choices that reveal character rather than exposition. Attraction must develop through friction, vulnerability, and changed behavior. Avoid instant resolution; let trust be earned and loss remain possible.',
  },
  {
    key: 'comedy',
    title: 'Comedy',
    aliases: ['comedy', 'humor'],
    promptText: 'Build comedy from character logic, escalating misunderstandings, and clean visual punctuation. Keep jokes grounded in the established cast and world rules. Let silence and timing carry as much weight as dialogue. Comedy must not nullify stakes; it should expose character under pressure.',
  },
  {
    key: 'sci_fi',
    title: 'Sci-Fi',
    aliases: ['sci fi', 'sci-fi', 'science fiction', 'scifi'],
    promptText: 'Ground speculative technology in human incentives, constraints, and unintended consequences. Show how systems shape daily life, class, labor, and belief. Every invention must create a new problem as well as a solution. Use precise visual language and avoid technobabble replacing dramatic logic.',
  },
  {
    key: 'mystery',
    title: 'Mystery',
    aliases: ['mystery', 'detective'],
    promptText: 'Plant fair clues, credible red herrings, and suspects with independent goals. Each revelation must reframe earlier evidence rather than merely add information. Keep the detective under pressure and make the final answer emotionally relevant to the characters, not just intellectually tidy.',
  },
  {
    key: 'drama',
    title: 'Drama',
    aliases: ['drama', 'character drama'],
    promptText: 'Drive scenes through conflicting needs, unspoken history, and irreversible choices. Let subtext carry the pressure. Every major beat should alter a relationship or a character self-concept. Avoid melodrama without consequence; earn emotional peaks through accumulated specificity.',
  },
  {
    key: 'slice_of_life',
    title: 'Slice of Life',
    aliases: ['slice of life', 'slice-of-life', 'daily life'],
    promptText: 'Find meaning in ordinary rituals, small changes, and lived-in detail. Keep conflict grounded in plausible human friction. Use seasonal texture, recurring locations, and quiet observations. Emotional turns should be modest but precise, with continuity that rewards attention.',
  },
  {
    key: 'mythology',
    title: 'Mythology',
    aliases: ['mythology', 'myth', 'epic mythology'],
    promptText: 'Treat myth as lived belief: define ritual, taboo, divine cost, and contradictory accounts. Use symbolic imagery and recurring motifs without explaining away the mystery. Mortals should negotiate with powers they cannot fully understand, and every divine favor must carry a price.',
  },
  {
    key: 'music',
    title: 'Music',
    aliases: ['music', 'musical'],
    promptText: 'Let rhythm, performance, and sound carry story information. Musical sequences must change relationships or stakes rather than pause the plot. Use recurring motifs, silence before impact, and performance choices that reveal character. Keep visual editing synchronized to emotional beats, not just tempo.',
  },
];

export const MEDIUM_DEFINITIONS: readonly CreativeDefinition[] = [
  {
    key: 'ANIME',
    title: 'ANIME',
    aliases: ['anime', 'japanese animation', 'cel animation'],
    promptText: 'Japanese anime production identity: expressive stylized anatomy, clean line art, layered cel shading, deliberate color scripts, detailed painted backgrounds, dramatic volumetric lighting, and cinematic camera language. Preserve character model sheets and consistent eye, hair, costume, and silhouette design. Use animation-ready poses and negative space. Avoid photoreal skin, western comic rendering, and generic 3D plastic surfaces.',
  },
  {
    key: 'MANHWA',
    title: 'MANHWA',
    aliases: ['manhwa', 'korean webtoon', 'webtoon'],
    promptText: 'Korean manhwa and webtoon visual identity: refined semi-realistic anatomy with elongated proportions, sharp facial structure, glossy expressive eyes, precise digital line art, soft gradient shading, rich atmospheric color, and dramatic rim lighting. Compose for vertical readability with strong silhouette staging and clean backgrounds. Maintain exact character consistency across panels and episodes. Do not render as generic Japanese anime cel shading or photoreal live action.',
  },
  {
    key: '3D',
    title: '3D',
    aliases: ['3d', '3d animation', 'cgi', 'three dimensional'],
    promptText: 'High-end 3D animation identity: physically based materials, believable subsurface scattering, controlled depth of field, sculpted anatomy, detailed hair and cloth simulation, and cinematic global illumination. Preserve consistent character rigs and facial topology. Favor intentional stylization over uncanny realism. Avoid flat cel-shaded anime rendering and photoreal human footage.',
  },
  {
    key: '2D_ANIMATION',
    title: '2D ANIMATION',
    aliases: ['2d', '2d animation', '2d-animation', 'traditional animation'],
    promptText: 'Dedicated 2D animation identity: hand-drawn line confidence, shape-language-driven characters, clean color fills, layered parallax backgrounds, expressive squash and stretch, and frame-to-frame model consistency. Use graphic staging, bold silhouettes, and animation-friendly poses. Do not collapse into generic anime cel shading or 3D rendering.',
  },
  {
    key: 'REAL_HUMAN',
    title: 'REAL_HUMAN',
    aliases: ['real human', 'real_human', 'photoreal human', 'live human'],
    promptText: 'Photoreal human production identity: anatomically accurate faces and bodies, natural skin texture, practical hair, realistic wardrobe, motivated lighting, and photographic lens behavior. Preserve identity with consistent facial structure, age, markings, and body proportions. Avoid anime stylization, cartoon proportions, and plastic CGI skin.',
  },
  {
    key: 'LIVE_ACTION',
    title: 'LIVE_ACTION',
    aliases: ['live action', 'live_action', 'cinematic live action'],
    promptText: 'Live-action cinematic identity: real-world production design, physical costumes and props, naturalistic performance, practical sets, filmic contrast, motivated light sources, and grounded camera grammar. Maintain actor-like identity consistency and believable physics. Avoid illustrated line art and stylized cel shading.',
  },
  {
    key: 'CINEMATIC',
    title: 'CINEMATIC',
    aliases: ['cinematic', 'cinematic illustration'],
    promptText: 'Cinematic illustration identity: painterly realism, strong value structure, filmic color grading, atmospheric depth, detailed environmental storytelling, and controlled lens flares. Character anatomy should be believable and consistent, with costume and material detail. Avoid flat cartoon rendering and generic anime shorthand.',
  },
  {
    key: 'HYBRID',
    title: 'HYBRID',
    aliases: ['hybrid', 'mixed media', 'hybrid animation'],
    promptText: 'Hybrid visual identity: combine illustrated character rendering with photoreal or 3D environments only where deliberate and consistent. Define which layers use line art, cel shading, painterly texture, or physically based rendering. Preserve a single coherent lighting model, color script, and character model across every shot. Avoid accidental medium switching between scenes.',
  },
];

export const DEFAULT_DOMAIN_PROMPTS: Readonly<Record<string, string>> = {
  BIBLE: 'You are the Story Bible Architect. Build a coherent world, character architecture, power limits, continuity anchors, and a season-level roadmap that obeys the locked project genre and visual medium configuration.',
  EPISODE: 'You are the Episode Screenwriter. Write a production-ready script that obeys locked canon, character voice, project genre instructions, the locked visual medium, target runtime, and scene budget.',
  IMAGE: 'Create a production-ready keyframe prompt that obeys the locked project visual medium, character visual DNA, scene continuity, and cinematic composition rules.',
  AI_DIRECTOR: 'You are the AI Anime Studio Director. Provide actionable production guidance and never mutate project identity or state without explicit user confirmation.',
};

const GENRE_ALIAS_MAP = new Map<string, CreativeDefinition>();
for (const definition of GENRE_DEFINITIONS) {
  GENRE_ALIAS_MAP.set(normalizeKey(definition.key), definition);
  GENRE_ALIAS_MAP.set(normalizeKey(definition.title), definition);
  for (const alias of definition.aliases) GENRE_ALIAS_MAP.set(normalizeKey(alias), definition);
}

const MEDIUM_ALIAS_MAP = new Map<string, CreativeDefinition>();
for (const definition of MEDIUM_DEFINITIONS) {
  MEDIUM_ALIAS_MAP.set(normalizeKey(definition.key), definition);
  MEDIUM_ALIAS_MAP.set(normalizeKey(definition.title), definition);
  for (const alias of definition.aliases) MEDIUM_ALIAS_MAP.set(normalizeKey(alias), definition);
}

export function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function slugifyCreativeTitle(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

export function findBuiltInGenre(value: unknown): CreativeDefinition | null {
  return GENRE_ALIAS_MAP.get(normalizeKey(value)) ?? null;
}

export function findBuiltInMedium(value: unknown): CreativeDefinition | null {
  return MEDIUM_ALIAS_MAP.get(normalizeKey(value)) ?? null;
}

export function canonicalGenreTitle(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return findBuiltInGenre(raw)?.title ?? raw;
}

export function canonicalMediumKey(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return 'ANIME';
  const builtIn = findBuiltInMedium(raw);
  if (builtIn) return builtIn.key;
  return slugifyCreativeTitle(raw) || 'ANIME';
}

export function canonicalMediumTitle(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return 'ANIME';
  const builtIn = findBuiltInMedium(raw);
  if (builtIn) return builtIn.title;
  return raw;
}

export function parseGenreList(...values: unknown[]): string[] {
  const selected: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (Array.isArray(value)) {
      for (const item of value) {
        for (const parsed of parseGenreList(item)) {
          if (!seen.has(normalizeKey(parsed))) {
            seen.add(normalizeKey(parsed));
            selected.push(parsed);
          }
        }
      }
      continue;
    }
    if (value === null || value === undefined) continue;
    const raw = String(value).trim();
    if (!raw) continue;
    const parts = raw.split(/[,;|\n]+/).map((part) => part.trim()).filter(Boolean);
    for (const part of parts.length > 0 ? parts : [raw]) {
      const title = canonicalGenreTitle(part);
      if (!title) continue;
      const key = normalizeKey(title);
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push(title);
    }
  }
  return selected;
}

export function genreMatches(left: unknown, right: unknown): boolean {
  return normalizeKey(canonicalGenreTitle(left)) === normalizeKey(canonicalGenreTitle(right));
}

export function builtInGenrePrompt(genre: unknown): ResolvedCreativePrompt | null {
  const definition = findBuiltInGenre(genre);
  if (!definition) return null;
  return {
    key: definition.key,
    title: definition.title,
    promptId: `builtin:genre:${definition.key}`,
    version: 1,
    promptText: definition.promptText,
    custom: false,
    projectId: null,
  };
}

export function builtInMediumPrompt(medium: unknown): ResolvedCreativePrompt {
  const definition = findBuiltInMedium(medium);
  const resolved = definition ?? {
    key: canonicalMediumKey(medium),
    title: canonicalMediumTitle(medium),
    promptText: `Custom visual identity "${canonicalMediumTitle(medium)}": preserve the user-defined anatomy, line art, color treatment, lighting, composition, and character consistency instructions exactly. Do not substitute a generic anime or live-action look.`,
  };
  return {
    key: resolved.key,
    title: resolved.title,
    promptId: `builtin:medium:${normalizeKey(resolved.key)}`,
    version: 1,
    promptText: resolved.promptText,
    custom: false,
    projectId: null,
  };
}

export function resolveGenrePrompt(
  genre: unknown,
  customPrompts: readonly Record<string, any>[]
): ResolvedCreativePrompt {
  const canonical = canonicalGenreTitle(genre);
  const builtIn = builtInGenrePrompt(canonical);
  const matched = customPrompts
    .filter((row) => String(row?.prompt_category || '').toUpperCase() === 'GENRE')
    .filter((row) => genreMatches(row?.genre || row?.title, canonical))
    .sort(preferProjectPrompt)
    .at(0);
  if (matched) {
    return {
      key: matched.genre ? normalizeKey(canonicalGenreTitle(matched.genre)) : normalizeKey(canonical),
      title: String(matched.title || canonical),
      promptId: String(matched.id),
      version: Number(matched.version || 1),
      promptText: String(matched.prompt_text || builtIn?.promptText || ''),
      custom: true,
      projectId: matched.project_id ? String(matched.project_id) : null,
    };
  }
  return builtIn ?? {
    key: normalizeKey(canonical),
    title: canonical || 'Custom Genre',
    promptId: `builtin:genre:${normalizeKey(canonical)}`,
    version: 1,
    promptText: `Custom genre "${canonical}": follow the user-defined genre intent consistently across conflict, character motivation, atmosphere, dialogue, pacing, stakes, themes, episode structure, and emotional intensity.`,
    custom: false,
    projectId: null,
  };
}

export function resolveMediumPrompt(
  medium: unknown,
  customPrompts: readonly Record<string, any>[]
): ResolvedCreativePrompt {
  const mediumKey = canonicalMediumKey(medium);
  const fallback = builtInMediumPrompt(mediumKey);
  const matched = customPrompts
    .filter((row) => String(row?.prompt_category || '').toUpperCase() === 'VISUAL_MEDIUM')
    .filter((row) => canonicalMediumKey(row?.visual_medium || row?.title) === mediumKey)
    .sort(preferProjectPrompt)
    .at(0);
  if (matched) {
    return {
      key: mediumKey,
      title: canonicalMediumTitle(matched.title || matched.visual_medium || mediumKey),
      promptId: String(matched.id),
      version: Number(matched.version || 1),
      promptText: String(matched.prompt_text || fallback.promptText),
      custom: true,
      projectId: matched.project_id ? String(matched.project_id) : null,
    };
  }
  return fallback;
}

function preferProjectPrompt(left: Record<string, any>, right: Record<string, any>): number {
  const leftProject = left?.project_id ? 1 : 0;
  const rightProject = right?.project_id ? 1 : 0;
  if (leftProject !== rightProject) return rightProject - leftProject;
  const leftUpdated = Date.parse(String(left?.updated_at || left?.created_at || 0));
  const rightUpdated = Date.parse(String(right?.updated_at || right?.created_at || 0));
  return rightUpdated - leftUpdated;
}

export function buildGenrePromptContext(prompts: readonly ResolvedCreativePrompt[]): string {
  if (prompts.length === 0) return '';
  const sections = prompts.map((prompt, index) => {
    const source = prompt.custom ? `custom prompt ${prompt.promptId} v${prompt.version}` : `built-in prompt v${prompt.version}`;
    return `${index + 1}. ${prompt.title} (${source})\n${prompt.promptText}`;
  });
  return [
    'SELECTED GENRE INSTRUCTIONS (ordered by project selection; earlier entries take precedence if instructions conflict):',
    ...sections,
    'GENRE COMPOSITION RULE: Combine every selected genre. Do not discard secondary genres. A genre prompt may shape story, character, atmosphere, dialogue, pacing, stakes, themes, episode structure, and emotional intensity, but it must never change the locked Visual Medium.',
  ].join('\n\n');
}

export function buildMediumPromptContext(prompt: ResolvedCreativePrompt): string {
  const source = prompt.custom ? `custom prompt ${prompt.promptId} v${prompt.version}` : `built-in prompt v${prompt.version}`;
  return [
    `LOCKED VISUAL MEDIUM: ${prompt.title}`,
    `VISUAL MEDIUM INSTRUCTIONS (${source}):`,
    prompt.promptText,
    'MEDIUM LOCK RULE: This visual identity is authoritative for every character, scene, image, and animation. No genre, BIBLE, EPISODE, IMAGE, or director prompt may override it.',
  ].join('\n\n');
}
