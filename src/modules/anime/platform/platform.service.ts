import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

export type PlatformMode = 'byod' | 'platform_managed';

export interface PlatformManagedStatus {
  enabled: boolean;
  mode: PlatformMode;
  billing_enabled: boolean;
  reason: string;
  providers: Array<{ id: string; label: string; state: 'disabled' }>;
}

function platformManagedEnabled(): boolean {
  return process.env.ANIME_PLATFORM_MANAGED_ENABLED === 'true'
    && process.env.ANIME_PLATFORM_MANAGED_OWNER_APPROVED === 'true';
}

export function getPlatformManagedStatus(): PlatformManagedStatus {
  const enabled = platformManagedEnabled();
  return {
    enabled,
    mode: enabled ? 'platform_managed' : 'byod',
    billing_enabled: enabled && process.env.ANIME_PLATFORM_BILLING_ENABLED === 'true',
    reason: enabled
      ? 'Platform-Managed is enabled by explicit environment and Owner approval.'
      : 'Platform-Managed hosting, pooled capacity, and billing are disabled until the Owner explicitly approves them.',
    providers: [
      { id: 'platform_gpu_pool', label: 'Platform GPU Pool', state: 'disabled' },
      { id: 'platform_cpu_pool', label: 'Platform CPU Pool', state: 'disabled' },
      { id: 'platform_billing', label: 'Platform Billing', state: 'disabled' },
    ],
  };
}

export function assertPlatformManagedEnabled(action: string): void {
  if (!platformManagedEnabled()) {
    throw new AnimeError({
      code: AnimeErrorCode.PLATFORM_MANAGED_DISABLED,
      message: `Platform-Managed ${action} is disabled. BYOD remains the active mode.`,
    });
  }
}

export function assertPlatformActionAllowed(input: {
  mode?: string;
  action: string;
  confirmed?: boolean;
}): void {
  if (input.mode !== 'platform_managed') return;
  assertPlatformManagedEnabled(input.action);
  if (input.confirmed !== true) {
    throw new AnimeError({
      code: AnimeErrorCode.PLATFORM_MANAGED_DISABLED,
      message: 'Platform-Managed actions require explicit confirmation.',
    });
  }
}
