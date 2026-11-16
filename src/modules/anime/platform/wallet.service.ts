import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

export interface WalletSummary {
  tenant_id: string;
  currency: string;
  balance: number;
  updated_at: string | null;
}

function dbError(message: string, cause: unknown): AnimeError {
  return new AnimeError({ code: AnimeErrorCode.INTERNAL, message, cause });
}

export async function getWalletSummary(tenantId: string): Promise<WalletSummary> {
  const { data, error } = await animeSupabase
    .from('anime_platform_wallets')
    .select('tenant_id, currency, balance, updated_at')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw dbError('Wallet lookup failed.', error);
  return {
    tenant_id: tenantId,
    currency: String(data?.currency ?? 'USD'),
    balance: Number(data?.balance ?? 0),
    updated_at: data?.updated_at ?? null,
  };
}

export async function creditWallet(input: {
  tenantId: string;
  amount: number;
  reason: string;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{ status: string; balance: number; currency: string; idempotent: boolean }> {
  const { data, error } = await animeSupabase.rpc('credit_anime_wallet', {
    p_tenant_id: input.tenantId,
    p_amount: input.amount,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (error) throw dbError('Wallet credit failed.', error);
  return data as { status: string; balance: number; currency: string; idempotent: boolean };
}

export async function debitWallet(input: {
  tenantId: string;
  amount: number;
  reason: string;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{ status: string; balance: number; currency: string; idempotent: boolean }> {
  const { data, error } = await animeSupabase.rpc('debit_anime_wallet', {
    p_tenant_id: input.tenantId,
    p_amount: input.amount,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (error) throw dbError('Wallet debit failed.', error);
  return data as { status: string; balance: number; currency: string; idempotent: boolean };
}

export async function assertWalletCanReserve(tenantId: string): Promise<void> {
  if (process.env.ANIME_PLATFORM_BILLING_ENABLED !== 'true') return;
  const wallet = await getWalletSummary(tenantId);
  if (wallet.balance <= 0) {
    throw new AnimeError({
      code: AnimeErrorCode.PAID_BUDGET_REQUIRED,
      message: 'Platform-managed usage requires a positive wallet balance.',
    });
  }
}

export async function listWalletLedger(tenantId: string, limit = 50): Promise<any[]> {
  const { data, error } = await animeSupabase
    .from('anime_platform_wallet_ledger')
    .select('id, delta, balance_after, currency, reason, metadata, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(Math.min(200, Math.max(1, limit)));
  if (error) throw dbError('Wallet ledger lookup failed.', error);
  return data ?? [];
}
