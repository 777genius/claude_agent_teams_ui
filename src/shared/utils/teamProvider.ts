import type { TeamProviderId } from '@shared/types';

export function isTeamProviderId(value: unknown): value is TeamProviderId {
  return value === 'anthropic' || value === 'codex' || value === 'gemini';
}

export function normalizeOptionalTeamProviderId(value: unknown): TeamProviderId | undefined {
  return isTeamProviderId(value) ? value : undefined;
}

export function normalizeTeamProviderId(
  value: unknown,
  fallback: TeamProviderId = 'anthropic'
): TeamProviderId {
  return normalizeOptionalTeamProviderId(value) ?? fallback;
}
