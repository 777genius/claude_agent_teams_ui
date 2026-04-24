export type TeamMemberLivenessMode = 'diagnostics' | 'strict';

export const CLAUDE_TEAM_MEMBER_LIVENESS_MODE_ENV = 'CLAUDE_TEAM_MEMBER_LIVENESS_MODE';

export function resolveTeamMemberLivenessModeFromEnv(
  env: NodeJS.ProcessEnv = process.env
): TeamMemberLivenessMode {
  const raw = env[CLAUDE_TEAM_MEMBER_LIVENESS_MODE_ENV]?.trim().toLowerCase();
  return raw === 'strict' ? 'strict' : 'diagnostics';
}

export function isStrictTeamMemberLivenessMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveTeamMemberLivenessModeFromEnv(env) === 'strict';
}
