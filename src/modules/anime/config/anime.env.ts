import { z } from 'zod';
export const AnimeProcessRoleEnum = z.enum(['api', 'dispatcher', 'supervisor', 'worker']);
export type AnimeProcessRole = z.infer<typeof AnimeProcessRoleEnum>;
export const animeEnvSchema = z.object({
  ANIME_SUPABASE_URL: z.string().url(), ANIME_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1), ANIME_SUPABASE_ANON_KEY: z.string().min(1),
  ANIME_N8N_CALLBACK_SECRET: z.string().min(1), ANIME_WORKER_CALLBACK_SECRET: z.string().min(1), ANIME_PROCESS_ROLE: AnimeProcessRoleEnum,
  ANIME_ENCRYPTION_KEY: z.string().optional(),
  ANIME_ASSETS_BUCKET: z.string().optional(),
  ANIME_FINAL_EPISODES_BUCKET: z.string().optional(),
});
export type AnimeEnv = z.infer<typeof animeEnvSchema>;
function parseAnimeEnvOnce(rawEnv: NodeJS.ProcessEnv): Readonly<AnimeEnv> {
  const parsed = animeEnvSchema.safeParse(rawEnv);
  if (parsed.success === false) throw new Error('[AnimeEngine] Invalid env: ' + parsed.error.issues.map(i => i.path.join('.')).join(', '));
  return Object.freeze(parsed.data);
}
export const animeEnv: Readonly<AnimeEnv> = parseAnimeEnvOnce(process.env);
