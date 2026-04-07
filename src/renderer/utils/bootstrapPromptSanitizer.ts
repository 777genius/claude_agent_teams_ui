import { displayMemberName } from '@renderer/utils/memberHelpers';

import type { InboxMessage } from '@shared/types';

const BOOTSTRAP_REQUIRED_MARKER_SETS = [
  [
    'Your FIRST action: call MCP tool member_briefing',
    'Do NOT start work, claim tasks, or improvise workflow/task/process rules before member_briefing succeeds.',
  ],
  [
    'Your FIRST action: call MCP tool member_briefing',
    'The team has already been created and you are being attached as a persistent teammate.',
  ],
  [
    'Your FIRST action: call MCP tool member_briefing',
    'The team has already been reconnected and you are being re-attached as a persistent teammate.',
  ],
] as const;

const BOOTSTRAP_SUPPORTING_MARKERS = [
  'If member_briefing fails, send',
  'member_briefing is expected to be available in your initial MCP tool list.',
  'IMPORTANT: When sending messages to the team lead',
  'Call member_briefing directly yourself. Do NOT use Agent',
  'wait for instructions from the lead and use team mailbox/task tools normally',
  'resume your queue normally and prioritize already-assigned board work',
] as const;

type TeamProviderId = 'anthropic' | 'codex' | 'gemini';

function parseProviderId(value: string | undefined): TeamProviderId | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'anthropic' || normalized === 'codex' || normalized === 'gemini') {
    return normalized;
  }
  return null;
}

function getTeamModelLabel(model: string): string {
  const trimmed = model.trim();
  switch (trimmed) {
    case 'gemini-2.5-pro':
      return 'Gemini 2.5 Pro';
    case 'gemini-2.5-flash':
      return 'Gemini 2.5 Flash';
    case 'gemini-2.5-flash-lite':
      return 'Gemini 2.5 Flash Lite';
    case 'gpt-5.4':
      return 'GPT-5.4';
    case 'gpt-5.4-mini':
      return 'GPT-5.4 Mini';
    case 'gpt-5.3-codex':
      return 'GPT-5.3 Codex';
    case 'gpt-5.3-codex-spark':
      return 'GPT-5.3 Codex Spark';
    case 'gpt-5.2':
      return 'GPT-5.2';
    case 'gpt-5.2-codex':
      return 'GPT-5.2 Codex';
    case 'gpt-5.1-codex-mini':
      return 'GPT-5.1 Codex Mini';
    case 'gpt-5.1-codex-max':
      return 'GPT-5.1 Codex Max';
    case 'claude-sonnet-4-6':
      return 'Sonnet 4.6';
    case 'claude-sonnet-4-6[1m]':
      return 'Sonnet 4.6 (1M)';
    case 'claude-opus-4-6':
      return 'Opus 4.6';
    case 'claude-opus-4-6[1m]':
      return 'Opus 4.6 (1M)';
    case 'claude-haiku-4-5-20251001':
      return 'Haiku 4.5';
    default:
      return trimmed || 'Default';
  }
}

function getTeamProviderLabel(providerId: TeamProviderId): string {
  switch (providerId) {
    case 'codex':
      return 'Codex';
    case 'gemini':
      return 'Gemini';
    case 'anthropic':
    default:
      return 'Anthropic';
  }
}

function getTeamEffortLabel(effort: string | undefined): string {
  const trimmed = effort?.trim() ?? '';
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : 'Default';
}

function matchField(text: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(text);
  const value = match?.[1]?.trim();
  return value ? value : undefined;
}

function buildRuntimeSummary(
  providerId: TeamProviderId | null,
  model: string | undefined,
  effort: string | undefined
): string | undefined {
  if (providerId) {
    const providerLabel = getTeamProviderLabel(providerId);
    const modelLabel = model ? getTeamModelLabel(model) : 'Default';
    const effortLabel = getTeamEffortLabel(effort);
    const normalizedProvider = providerLabel.trim().toLowerCase();
    const normalizedModel = modelLabel.trim().toLowerCase();
    const modelAlreadyCarriesProviderBrand =
      modelLabel !== 'Default' &&
      (normalizedModel.startsWith(normalizedProvider) ||
        (providerId === 'anthropic' && normalizedModel.startsWith('claude')) ||
        (providerId === 'codex' &&
          (normalizedModel.startsWith('codex') || normalizedModel.startsWith('gpt'))) ||
        (providerId === 'gemini' && normalizedModel.startsWith('gemini')));

    const providerActsAsBackendOnly =
      providerId !== 'anthropic' && modelLabel !== 'Default' && !modelAlreadyCarriesProviderBrand;

    const parts = modelAlreadyCarriesProviderBrand
      ? [modelLabel, effortLabel]
      : providerActsAsBackendOnly
        ? [modelLabel, `via ${providerLabel}`, effortLabel]
        : [providerLabel, modelLabel, effortLabel];
    return parts.filter(Boolean).join(' · ');
  }

  const modelLabel = model ? getTeamModelLabel(model) : '';
  const effortLabel = effort ? getTeamEffortLabel(effort) : '';
  const providerLabel = providerId ? getTeamProviderLabel(providerId) : '';
  return [providerLabel, modelLabel, effortLabel].filter(Boolean).join(' · ') || undefined;
}

export interface BootstrapPromptDisplay {
  teammateName?: string;
  teamName?: string;
  runtime?: string;
  summary: string;
  body: string;
}

export interface BootstrapAcknowledgementDisplay {
  teammateName?: string;
  teamName?: string;
  summary: string;
  body: string;
}

export function getBootstrapPromptDisplay(
  message: Pick<InboxMessage, 'text' | 'to'>
): BootstrapPromptDisplay | null {
  const text = typeof message.text === 'string' ? message.text.trim() : '';
  const hasRequiredMarkers = BOOTSTRAP_REQUIRED_MARKER_SETS.some((markerSet) =>
    markerSet.every((marker) => text.includes(marker))
  );
  const hasSupportingMarker = BOOTSTRAP_SUPPORTING_MARKERS.some((marker) => text.includes(marker));
  if (!text.startsWith('You are ') || !hasRequiredMarkers || !hasSupportingMarker) {
    return null;
  }

  const teammateName =
    matchField(text, /^You are\s+([^,\n]+),/m) ??
    (typeof message.to === 'string' ? message.to.trim() : undefined);
  const teamName = matchField(text, /on team "([^"]+)"/);
  const providerId = parseProviderId(
    matchField(text, /Provider override(?: for this teammate)?:\s*([^\.\n]+)/i)
  );
  const model = matchField(text, /Model override(?: for this teammate)?:\s*([^\.\n]+)/i);
  const effort = matchField(text, /Effort override(?: for this teammate)?:\s*([^\.\n]+)/i);
  const runtime = buildRuntimeSummary(providerId, model, effort);
  const displayName = teammateName ? displayMemberName(teammateName) : 'teammate';
  const summary = `Starting ${displayName}`;
  const bodyLines = [`Lead is starting \`${displayName}\` as a teammate.`];

  if (runtime) {
    bodyLines.push(`Runtime: ${runtime}`);
  } else if (teamName) {
    bodyLines.push(`Team: \`${teamName}\``);
  }

  bodyLines.push('Startup instructions are hidden in the UI.');

  return {
    teammateName,
    teamName,
    runtime,
    summary,
    body: bodyLines.join('\n\n'),
  };
}

export function getBootstrapAcknowledgementDisplay(
  message: Pick<InboxMessage, 'text' | 'from'>
): BootstrapAcknowledgementDisplay | null {
  const text = typeof message.text === 'string' ? message.text.trim() : '';
  if (!text.startsWith('{') || !text.endsWith('}')) {
    return null;
  }

  const markers = [
    "'concerns':",
    "'existingRelationships':",
    "'hasBootstrapGuidance':",
    "'hasAcknowledged':",
    "'isTeamLead':",
    "'memberName':",
    "'teamName':",
  ];
  if (!markers.every((marker) => text.includes(marker))) {
    return null;
  }

  const teammateName =
    matchField(text, /'memberName':\s*'([^']+)'/) ??
    (typeof message.from === 'string' ? message.from.trim() : undefined);
  const teamName = matchField(text, /'teamName':\s*'([^']+)'/);
  const displayName = teammateName ? displayMemberName(teammateName) : 'teammate';

  return {
    teammateName,
    teamName,
    summary: `${displayName} acknowledged bootstrap`,
    body: `${displayName} acknowledged bootstrap.`,
  };
}

export function getSanitizedInboxMessageText(message: Pick<InboxMessage, 'text' | 'to'>): string {
  return (
    getBootstrapPromptDisplay(message)?.body ??
    getBootstrapAcknowledgementDisplay(message as Pick<InboxMessage, 'text' | 'from'>)?.body ??
    message.text ??
    ''
  );
}

export function getSanitizedInboxMessageSummary(
  message: Pick<InboxMessage, 'text' | 'to' | 'from' | 'summary'>
): string {
  return (
    getBootstrapPromptDisplay(message)?.summary ??
    getBootstrapAcknowledgementDisplay(message)?.summary ??
    message.summary ??
    ''
  );
}
