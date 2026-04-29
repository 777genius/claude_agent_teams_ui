export type RuntimeTurnSettledProvider = 'claude' | 'codex';

export function isRuntimeTurnSettledProvider(value: unknown): value is RuntimeTurnSettledProvider {
  return value === 'claude' || value === 'codex';
}
