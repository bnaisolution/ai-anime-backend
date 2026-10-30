import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { animeEnv } from '../config/anime.env';
export const animeSupabase: SupabaseClient = createClient(animeEnv.ANIME_SUPABASE_URL, animeEnv.ANIME_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
