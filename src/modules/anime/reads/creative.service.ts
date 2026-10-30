import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
export async function getBible(projectId: string): Promise<any> { const { data } = await animeSupabase.from('projects').select('id, name, current_season, current_episode, story_bible').eq('id', projectId).single(); if (data === null) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Not found' }); return data; }
export async function getCanon(projectId: string): Promise<any[]> { const { data } = await animeSupabase.from('canon_facts').select('*').eq('project_id', projectId); return data ?? []; }
export async function getCharacters(projectId: string): Promise<any[]> { const { data } = await animeSupabase.from('characters').select('*').eq('project_id', projectId); return data ?? []; }
export async function getTimeline(projectId: string): Promise<any[]> { const { data } = await animeSupabase.from('story_timeline').select('*').eq('project_id', projectId); return data ?? []; }
