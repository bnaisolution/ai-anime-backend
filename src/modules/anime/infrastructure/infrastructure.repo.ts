import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import type { InfrastructureRecord, ProviderType } from './infrastructure.types';

export async function listByUser(userId: string): Promise<InfrastructureRecord[]> {
  const { data, error } = await animeSupabase
    .from('user_infrastructure')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'List infrastructure failed', cause: error });
  return (data ?? []) as InfrastructureRecord[];
}

export async function getById(id: string, userId: string): Promise<InfrastructureRecord | null> {
  const { data, error } = await animeSupabase
    .from('user_infrastructure')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle<InfrastructureRecord>();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Fetch infrastructure failed', cause: error });
  return data;
}

export async function getActiveByUser(userId: string): Promise<InfrastructureRecord[]> {
  const { data, error } = await animeSupabase
    .from('user_infrastructure')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Fetch active infrastructure failed', cause: error });
  return (data ?? []) as InfrastructureRecord[];
}

export async function insert(input: {
  user_id: string;
  name: string;
  provider_type: ProviderType;
  config_encrypted: string;
  capabilities: Record<string, unknown>;
  is_default: boolean;
}): Promise<InfrastructureRecord> {
  if (input.is_default) {
    await animeSupabase.from('user_infrastructure').update({ is_default: false }).eq('user_id', input.user_id);
  }
  const { data, error } = await animeSupabase.from('user_infrastructure').insert(input).select().single<InfrastructureRecord>();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Insert infrastructure failed', cause: error });
  return data;
}

export async function update(id: string, userId: string, patch: Record<string, unknown>): Promise<InfrastructureRecord> {
  if (patch.is_default === true) {
    await animeSupabase.from('user_infrastructure').update({ is_default: false }).eq('user_id', userId);
  }
  const { data, error } = await animeSupabase
    .from('user_infrastructure')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', userId)
    .select().single<InfrastructureRecord>();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Update infrastructure failed', cause: error });
  return data;
}

export async function remove(id: string, userId: string): Promise<void> {
  const { error } = await animeSupabase.from('user_infrastructure').delete().eq('id', id).eq('user_id', userId);
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Delete infrastructure failed', cause: error });
}

export async function setDefault(id: string, userId: string): Promise<void> {
  await animeSupabase.from('user_infrastructure').update({ is_default: false }).eq('user_id', userId);
  await animeSupabase.from('user_infrastructure').update({ is_default: true }).eq('id', id).eq('user_id', userId);
}
