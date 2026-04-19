import {
  formatProviderBackendLabel,
  getDefaultProviderBackendId,
  migrateProviderBackendId,
} from '@shared/utils/providerBackend';

import type { CliProviderStatus, TeamProviderId } from '@shared/types';

function normalizeOptionalBackendId(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export { formatProviderBackendLabel, getDefaultProviderBackendId };

export function resolveEffectiveProviderBackendId(
  provider: Pick<CliProviderStatus, 'selectedBackendId' | 'resolvedBackendId'> | null | undefined
): string | undefined {
  return normalizeOptionalBackendId(provider?.resolvedBackendId ?? provider?.selectedBackendId);
}

export function resolveUiOwnedProviderBackendId(
  providerId: TeamProviderId | CliProviderStatus['providerId'] | undefined,
  provider: Pick<CliProviderStatus, 'selectedBackendId' | 'resolvedBackendId'> | null | undefined
): string | undefined {
  return migrateProviderBackendId(
    providerId,
    provider?.selectedBackendId ?? provider?.resolvedBackendId
  );
}

export function formatTeamProviderBackendLabel(
  providerId: TeamProviderId | undefined,
  providerBackendId: string | undefined
): string | undefined {
  return formatProviderBackendLabel(providerId, providerBackendId);
}
