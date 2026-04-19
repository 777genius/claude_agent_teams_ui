import type { TeamProviderId } from '@shared/types';

type RuntimeProviderId = TeamProviderId;

function normalizeOptionalBackendId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getDefaultProviderBackendId(
  providerId: TeamProviderId | RuntimeProviderId | undefined
): string | undefined {
  return providerId === 'codex' ? 'codex-native' : undefined;
}

export function isLegacyCodexProviderBackendId(
  providerBackendId: string | null | undefined
): boolean {
  const normalizedBackendId = normalizeOptionalBackendId(providerBackendId);
  return (
    normalizedBackendId === 'auto' ||
    normalizedBackendId === 'adapter' ||
    normalizedBackendId === 'api'
  );
}

export function migrateProviderBackendId(
  providerId: TeamProviderId | RuntimeProviderId | undefined,
  providerBackendId: string | null | undefined
): string | undefined {
  const normalizedBackendId = normalizeOptionalBackendId(providerBackendId);
  if (providerId !== 'codex') {
    return normalizedBackendId;
  }

  if (!normalizedBackendId || isLegacyCodexProviderBackendId(normalizedBackendId)) {
    return 'codex-native';
  }

  return normalizedBackendId;
}

export function formatProviderBackendLabel(
  providerId: TeamProviderId | undefined,
  providerBackendId: string | undefined
): string | undefined {
  const normalizedBackendId = migrateProviderBackendId(providerId, providerBackendId);
  if (!normalizedBackendId) {
    return undefined;
  }

  if ((providerId ?? 'anthropic') === 'codex') {
    if (normalizedBackendId === 'codex-native') {
      return 'Codex native';
    }
    return normalizedBackendId;
  }

  if ((providerId ?? 'anthropic') === 'gemini') {
    switch (normalizedBackendId) {
      case 'cli-sdk':
        return 'CLI SDK';
      case 'api':
        return 'API';
      case 'auto':
        return undefined;
      default:
        return normalizedBackendId;
    }
  }

  return normalizedBackendId;
}
