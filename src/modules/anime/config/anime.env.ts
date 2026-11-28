import { z } from 'zod';
export const AnimeProcessRoleEnum = z.enum(['api', 'dispatcher', 'supervisor', 'worker']);
export type AnimeProcessRole = z.infer<typeof AnimeProcessRoleEnum>;

const booleanFlag = z
  .string()
  .optional()
  .transform((value) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase()));

export const animeEnvSchema = z.object({
  ANIME_SUPABASE_URL: z.string().url(), ANIME_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1), ANIME_SUPABASE_ANON_KEY: z.string().min(1),
  ANIME_N8N_CALLBACK_SECRET: z.string().min(1), ANIME_WORKER_CALLBACK_SECRET: z.string().min(1), ANIME_WORKER_JOB_TOKEN_SECRET: z.string().optional(), ANIME_WORKFLOW_GATEWAY_TOKEN: z.string().optional(), ANIME_WORKFLOW_SYSTEM_TOKEN: z.string().optional(), ANIME_PROCESS_ROLE: AnimeProcessRoleEnum,
  ANIME_ENCRYPTION_KEY: z.string().optional(),
  ANIME_ASSETS_BUCKET: z.string().optional(),
  ANIME_FINAL_EPISODES_BUCKET: z.string().optional(),
  S1E1_STRICT_GATES: booleanFlag,
  STAGE2_ACT_GROUNDING: booleanFlag,
  WF03_SINGLE_FETCH: booleanFlag,
  GPU_CONCURRENCY_ONE: booleanFlag,
  NARRATIVE_MEMORY: booleanFlag,
  SHOT_LEVEL_ASSEMBLY: booleanFlag,
  KEYFRAME_CANDIDATES: booleanFlag,
});
export type AnimeEnv = z.infer<typeof animeEnvSchema>;
function parseAnimeEnvOnce(rawEnv: NodeJS.ProcessEnv): Readonly<AnimeEnv> {
  const parsed = animeEnvSchema.safeParse(rawEnv);
  if (parsed.success === false) throw new Error('[AnimeEngine] Invalid env: ' + parsed.error.issues.map(i => i.path.join('.')).join(', '));
  return Object.freeze(parsed.data);
}
export const animeEnv: Readonly<AnimeEnv> = parseAnimeEnvOnce(process.env);

export const animeFlags = Object.freeze({
  s1e1StrictGates: animeEnv.S1E1_STRICT_GATES,
  stage2ActGrounding: animeEnv.STAGE2_ACT_GROUNDING,
  wf03SingleFetch: animeEnv.WF03_SINGLE_FETCH,
  gpuConcurrencyOne: animeEnv.GPU_CONCURRENCY_ONE,
  narrativeMemory: animeEnv.NARRATIVE_MEMORY,
  shotLevelAssembly: animeEnv.SHOT_LEVEL_ASSEMBLY,
  keyframeCandidates: animeEnv.KEYFRAME_CANDIDATES,
});
