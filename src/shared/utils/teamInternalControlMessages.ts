const NATIVE_APP_MANAGED_BOOTSTRAP_CHECK_OPEN = '<agent_teams_native_app_managed_bootstrap_check>';
const LEAD_INBOX_RELAY_PROMPT_OPEN = 'You have new inbox messages addressed to you (team lead ';
const TEAMMATE_MESSAGE_OPEN_RE = /^<teammate-message\s/i;

function stripTranscriptSpeakerPrefix(value: string): string {
  let normalized = value.trim();
  for (let i = 0; i < 3; i += 1) {
    const next = normalized.replace(/^(?:Human|User):\s*/i, '').trimStart();
    if (next === normalized) break;
    normalized = next;
  }
  return normalized;
}

export function isNativeAppManagedBootstrapCheckText(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    stripTranscriptSpeakerPrefix(value).includes(NATIVE_APP_MANAGED_BOOTSTRAP_CHECK_OPEN)
  );
}

export function isLeadInboxRelayControlPromptText(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const text = stripTranscriptSpeakerPrefix(value);
  return (
    text.startsWith(LEAD_INBOX_RELAY_PROMPT_OPEN) &&
    text.includes('Process them in order (oldest first).') &&
    text.includes('\nMessages:')
  );
}

export function isTeammateProtocolControlText(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  return TEAMMATE_MESSAGE_OPEN_RE.test(stripTranscriptSpeakerPrefix(value));
}

export function isTeamInternalControlMessageText(value: unknown): boolean {
  return (
    isNativeAppManagedBootstrapCheckText(value) ||
    isLeadInboxRelayControlPromptText(value) ||
    isTeammateProtocolControlText(value)
  );
}
