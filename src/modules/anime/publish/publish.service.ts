import crypto from 'crypto';
import { animeSupabase } from '../db/anime.supabase';
import { decryptWithKeyVersion, encryptWithCurrentKey } from '../infrastructure/keyRegistry';

export type PublishPlatform = 'youtube' | 'instagram';

export interface PublishChannelPublic {
  id: string;
  platform: PublishPlatform;
  account_ref: string | null;
  channel_name: string | null;
  scopes: string[];
  status: string;
  expires_at: string | null;
  last_verified_at: string | null;
  created_at: string;
}

interface ChannelRecord extends PublishChannelPublic {
  user_id: string;
  project_id: string | null;
  encrypted_tokens: string;
  key_version: number;
  external_id: string | null;
  refresh_expires_at: string | null;
}

interface OAuthConfig {
  configured: boolean;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  redirectUri: string;
}

const STATE_TTL_SEC = 10 * 60;

function envText(name: string): string {
  return String(process.env[name] || '').trim();
}

export function platformConfig(platform: string): OAuthConfig | null {
  if (platform === 'youtube') {
    return {
      configured: Boolean(envText('YOUTUBE_CLIENT_ID') && envText('YOUTUBE_CLIENT_SECRET')),
      clientId: envText('YOUTUBE_CLIENT_ID'),
      clientSecret: envText('YOUTUBE_CLIENT_SECRET'),
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
      redirectUri: envText('YOUTUBE_REDIRECT_URI') || `${envText('PUBLIC_API_BASE_URL')}/v1/anime/publish/oauth/youtube/callback`,
    };
  }
  if (platform === 'instagram') {
    return {
      configured: Boolean(envText('META_APP_ID') && envText('META_APP_SECRET')),
      clientId: envText('META_APP_ID'),
      clientSecret: envText('META_APP_SECRET'),
      authorizeUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
      tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
      scope: 'instagram_basic,instagram_content_publish,pages_show_list',
      redirectUri: envText('META_REDIRECT_URI') || `${envText('PUBLIC_API_BASE_URL')}/v1/anime/publish/oauth/instagram/callback`,
    };
  }
  return null;
}

function toPublic(row: ChannelRecord): PublishChannelPublic {
  return {
    id: row.id,
    platform: row.platform,
    account_ref: row.account_ref,
    channel_name: row.channel_name,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    status: row.status,
    expires_at: row.expires_at,
    last_verified_at: row.last_verified_at,
    created_at: row.created_at,
  };
}

export async function listChannels(userId: string): Promise<PublishChannelPublic[]> {
  const { data, error } = await animeSupabase
    .from('publish_channels')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map((row) => toPublic(row as ChannelRecord));
}

export async function startOAuth(
  userId: string,
  platform: string,
  projectId: string | null
): Promise<{ configured: boolean; authorization_url: string | null; state: string | null }> {
  const config = platformConfig(platform);
  if (!config) throw Object.assign(new Error('Unsupported publishing platform.'), { code: 'PLATFORM_INVALID' });
  if (!config.configured) {
    return { configured: false, authorization_url: null, state: null };
  }

  const state = crypto.randomBytes(24).toString('hex');
  const { error } = await animeSupabase.from('publish_oauth_states').insert({
    state,
    user_id: userId,
    platform,
    project_id: projectId,
    expires_at: new Date(Date.now() + STATE_TTL_SEC * 1000).toISOString(),
  });
  if (error) throw Object.assign(new Error('Could not start OAuth flow.'), { code: 'OAUTH_STATE_FAILED' });

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scope,
    state,
    access_type: 'offline',
    prompt: 'consent',
  });
  return {
    configured: true,
    authorization_url: `${config.authorizeUrl}?${params.toString()}`,
    state,
  };
}

interface TokenPayload {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

async function exchangeCode(platform: string, code: string, config: OAuthConfig): Promise<TokenPayload> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  });
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    throw Object.assign(new Error(`Token exchange failed (HTTP ${response.status}).`), { code: 'OAUTH_EXCHANGE_FAILED' });
  }
  return await response.json() as TokenPayload;
}

async function fetchChannelIdentity(platform: string, accessToken: string): Promise<{ id: string | null; name: string | null }> {
  try {
    if (platform === 'youtube') {
      const response = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        { headers: { authorization: `Bearer ${accessToken}` } }
      );
      if (!response.ok) return { id: null, name: null };
      const payload = await response.json() as { items?: Array<{ id?: string; snippet?: { title?: string } }> };
      const item = payload.items?.[0];
      return { id: item?.id ?? null, name: item?.snippet?.title ?? null };
    }
    const response = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id,username&access_token=${encodeURIComponent(accessToken)}`
    );
    if (!response.ok) return { id: null, name: null };
    const payload = await response.json() as { id?: string; username?: string };
    return { id: payload.id ?? null, name: payload.username ?? null };
  } catch {
    return { id: null, name: null };
  }
}

export async function completeOAuth(input: {
  platform: string;
  code: string;
  state: string;
}): Promise<{ channel: PublishChannelPublic; platform: PublishPlatform }> {
  const config = platformConfig(input.platform);
  if (!config || !config.configured) {
    throw Object.assign(new Error('OAuth is not configured for this platform.'), { code: 'OAUTH_NOT_CONFIGURED' });
  }

  const { data: stateRow } = await animeSupabase
    .from('publish_oauth_states')
    .select('*')
    .eq('state', input.state)
    .eq('platform', input.platform)
    .maybeSingle();
  const row = stateRow as Record<string, unknown> | null;
  if (!row) throw Object.assign(new Error('Invalid OAuth state.'), { code: 'OAUTH_STATE_INVALID' });
  if (row.consumed_at) throw Object.assign(new Error('OAuth state already used.'), { code: 'OAUTH_STATE_CONSUMED' });
  if (row.expires_at && new Date(String(row.expires_at)).getTime() < Date.now()) {
    throw Object.assign(new Error('OAuth state expired.'), { code: 'OAUTH_STATE_EXPIRED' });
  }
  await animeSupabase
    .from('publish_oauth_states')
    .update({ consumed_at: new Date().toISOString() })
    .eq('state', input.state);

  const tokens = await exchangeCode(input.platform, input.code, config);
  const identity = await fetchChannelIdentity(input.platform, tokens.access_token);
  const encrypted = encryptWithCurrentKey(JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    token_type: tokens.token_type ?? 'Bearer',
    scope: tokens.scope ?? config.scope,
  }));

  const record = {
    user_id: String(row.user_id || ''),
    project_id: row.project_id ? String(row.project_id) : null,
    platform: input.platform,
    account_ref: identity.id,
    channel_name: identity.name,
    external_id: identity.id,
    scopes: String(tokens.scope ?? config.scope).split(/[\s,]+/).filter(Boolean),
    status: 'active',
    encrypted_tokens: encrypted.ciphertext,
    key_version: encrypted.key_version,
    expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
    last_verified_at: new Date().toISOString(),
  };

  const existing = await animeSupabase
    .from('publish_channels')
    .select('id')
    .eq('user_id', record.user_id)
    .eq('platform', input.platform)
    .maybeSingle();

  let saved: ChannelRecord | null = null;
  if (existing.data && (existing.data as Record<string, unknown>).id) {
    const { data } = await animeSupabase
      .from('publish_channels')
      .update(record)
      .eq('id', String((existing.data as Record<string, unknown>).id))
      .select()
      .single();
    saved = (data as ChannelRecord | null) ?? null;
  } else {
    const { data } = await animeSupabase
      .from('publish_channels')
      .insert(record)
      .select()
      .single();
    saved = (data as ChannelRecord | null) ?? null;
  }
  if (!saved) throw Object.assign(new Error('Could not persist the publishing channel.'), { code: 'OAUTH_PERSIST_FAILED' });

  // Keep the canonical workflow contract working: WF-07 reads user_infrastructure.youtube.
  await syncInfrastructureMirror(record.user_id, input.platform, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    channel_id: identity.id,
    channel_name: identity.name,
  }).catch(() => undefined);

  return { channel: toPublic(saved), platform: input.platform as PublishPlatform };
}

async function syncInfrastructureMirror(
  userId: string,
  platform: string,
  config: Record<string, unknown>
): Promise<void> {
  if (!userId) return;
  const encrypted = encryptWithCurrentKey(JSON.stringify(config));
  const existing = await animeSupabase
    .from('user_infrastructure')
    .select('id')
    .eq('user_id', userId)
    .eq('provider_type', platform)
    .maybeSingle();
  if (existing.data && (existing.data as Record<string, unknown>).id) {
    await animeSupabase
      .from('user_infrastructure')
      .update({
        config_encrypted: encrypted.ciphertext,
        key_version: encrypted.key_version,
        status: 'active',
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', String((existing.data as Record<string, unknown>).id));
    return;
  }
  await animeSupabase.from('user_infrastructure').insert({
    user_id: userId,
    name: `${platform} OAuth channel`,
    provider_type: platform,
    config_encrypted: encrypted.ciphertext,
    key_version: encrypted.key_version,
    capabilities: {},
    status: 'active',
    is_default: false,
    last_verified_at: new Date().toISOString(),
  });
}

function decryptTokens(row: ChannelRecord): Record<string, unknown> {
  try {
    return JSON.parse(decryptWithKeyVersion(row.encrypted_tokens, row.key_version)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function testChannel(userId: string, channelId: string): Promise<{ ok: boolean; channel: PublishChannelPublic | null; reason?: string }> {
  const { data } = await animeSupabase
    .from('publish_channels')
    .select('*')
    .eq('id', channelId)
    .eq('user_id', userId)
    .maybeSingle();
  const row = data as ChannelRecord | null;
  if (!row) return { ok: false, channel: null, reason: 'CHANNEL_NOT_FOUND' };

  const tokens = decryptTokens(row);
  const accessToken = String(tokens.access_token || '');
  if (!accessToken) return { ok: false, channel: toPublic(row), reason: 'TOKEN_MISSING' };

  const identity = await fetchChannelIdentity(row.platform, accessToken);
  const ok = Boolean(identity.id);
  await animeSupabase
    .from('publish_channels')
    .update({
      status: ok ? 'active' : 'error',
      last_verified_at: new Date().toISOString(),
      channel_name: identity.name ?? row.channel_name,
    })
    .eq('id', channelId);
  return { ok, channel: toPublic({ ...row, status: ok ? 'active' : 'error' }), reason: ok ? undefined : 'VERIFY_FAILED' };
}

export async function disconnectChannel(userId: string, channelId: string): Promise<boolean> {
  const { error } = await animeSupabase
    .from('publish_channels')
    .update({ status: 'revoked', encrypted_tokens: '', updated_at: new Date().toISOString() })
    .eq('id', channelId)
    .eq('user_id', userId);
  return !error;
}
