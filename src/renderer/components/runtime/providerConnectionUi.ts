import type { CliProviderAuthMode, CliProviderStatus } from '@shared/types';

const CODEX_NATIVE_LABEL = 'Codex native';
const ANTHROPIC_SUBSCRIPTION_LABEL = 'Anthropic subscription';

const AUTH_MODE_LABELS: Record<CliProviderAuthMode, string> = {
  auto: 'Auto',
  oauth: 'Subscription / OAuth',
  api_key: 'API key',
};

export function formatProviderAuthModeLabel(authMode: CliProviderAuthMode | null): string | null {
  return authMode ? AUTH_MODE_LABELS[authMode] : null;
}

export function formatProviderAuthModeLabelForProvider(
  providerId: CliProviderStatus['providerId'],
  authMode: CliProviderAuthMode | null
): string | null {
  if (!authMode) {
    return null;
  }

  if (providerId === 'anthropic' && authMode === 'oauth') {
    return ANTHROPIC_SUBSCRIPTION_LABEL;
  }

  return formatProviderAuthModeLabel(authMode);
}

export function formatProviderAuthMethodLabel(authMethod: string | null): string {
  switch (authMethod) {
    case 'api_key':
      return 'API key';
    case 'api_key_helper':
      return 'API key helper';
    case 'oauth_token':
      return 'OAuth';
    case 'claude.ai':
      return 'Claude subscription';
    case 'cli_oauth_personal':
      return 'Gemini CLI';
    case 'gemini_adc_authorized_user':
      return 'Google account';
    case 'gemini_adc_service_account':
      return 'service account';
    default:
      return authMethod ? authMethod.replaceAll('_', ' ') : 'Not connected';
  }
}

export function formatProviderAuthMethodLabelForProvider(
  providerId: CliProviderStatus['providerId'],
  authMethod: string | null
): string {
  if (providerId === 'anthropic' && (authMethod === 'oauth_token' || authMethod === 'claude.ai')) {
    return ANTHROPIC_SUBSCRIPTION_LABEL;
  }

  return formatProviderAuthMethodLabel(authMethod);
}

function isCodexNativeLane(provider: CliProviderStatus): boolean {
  return (
    provider.providerId === 'codex' &&
    (provider.resolvedBackendId === 'codex-native' || provider.selectedBackendId === 'codex-native')
  );
}

function getSelectedRuntimeBackendOption(
  provider: CliProviderStatus
): NonNullable<CliProviderStatus['availableBackends']>[number] | null {
  const options = provider.availableBackends ?? [];
  if (options.length === 0) {
    return null;
  }

  const selectedBackendId = provider.selectedBackendId ?? null;
  const resolvedBackendId = provider.resolvedBackendId ?? null;

  return (
    options.find((option) => option.id === selectedBackendId) ??
    options.find((option) => option.id === resolvedBackendId) ??
    null
  );
}

export function isConnectionManagedRuntimeProvider(provider: CliProviderStatus): boolean {
  return false;
}

function getCodexCurrentRuntimeLabel(provider: CliProviderStatus): string {
  return provider.backend?.label ?? CODEX_NATIVE_LABEL;
}

export function getProviderCurrentRuntimeSummary(provider: CliProviderStatus): string | null {
  if (provider.providerId !== 'codex' || !isConnectionManagedRuntimeProvider(provider)) {
    return null;
  }

  const prefix = provider.authenticated ? 'Current runtime' : 'Selected runtime';
  return `${prefix}: ${getCodexCurrentRuntimeLabel(provider)}`;
}

export function formatProviderStatusText(provider: CliProviderStatus): string {
  const selectedBackendOption = getSelectedRuntimeBackendOption(provider);

  if (provider.providerId === 'codex') {
    if (selectedBackendOption?.statusMessage) {
      return selectedBackendOption.statusMessage;
    }
    return (
      provider.statusMessage ?? (provider.authenticated ? 'Codex native ready' : 'Not connected')
    );
  }

  if (
    isCodexNativeLane(provider) &&
    selectedBackendOption &&
    selectedBackendOption.state &&
    selectedBackendOption.state !== 'ready'
  ) {
    return (
      selectedBackendOption.statusMessage ?? provider.statusMessage ?? 'Codex native unavailable'
    );
  }

  if (
    isCodexNativeLane(provider) &&
    selectedBackendOption?.audience === 'internal' &&
    selectedBackendOption.statusMessage
  ) {
    return selectedBackendOption.statusMessage;
  }

  if (!provider.supported) {
    return provider.statusMessage ?? 'Unavailable in current runtime';
  }

  if (provider.authenticated) {
    return `Connected via ${formatProviderAuthMethodLabelForProvider(
      provider.providerId,
      provider.authMethod
    )}`;
  }

  if (provider.verificationState === 'offline') {
    return provider.statusMessage ?? 'Unable to verify';
  }

  return provider.statusMessage ?? 'Not connected';
}

export function getProviderConnectionModeSummary(provider: CliProviderStatus): string | null {
  if (provider.providerId !== 'anthropic' && provider.providerId !== 'codex') {
    return null;
  }

  if (provider.authenticated) {
    return null;
  }

  if (provider.providerId === 'anthropic' && provider.connection?.configuredAuthMode === 'auto') {
    return null;
  }

  const authModeLabel = formatProviderAuthModeLabelForProvider(
    provider.providerId,
    provider.connection?.configuredAuthMode ?? null
  );
  return authModeLabel ? `Preferred auth: ${authModeLabel}` : null;
}

export function getProviderCredentialSummary(provider: CliProviderStatus): string | null {
  if (!provider.connection?.apiKeyConfigured) {
    return null;
  }

  if (
    provider.providerId === 'anthropic' &&
    provider.connection.apiKeySource === 'stored' &&
    provider.connection.configuredAuthMode === 'auto'
  ) {
    return 'Saved API key available in Manage';
  }

  if (provider.authMethod !== 'api_key' && provider.providerId === 'anthropic') {
    return provider.connection.apiKeySource === 'stored'
      ? 'API key also configured in Manage'
      : (provider.connection.apiKeySourceLabel ?? 'API key is configured');
  }

  if (provider.authMethod !== 'api_key' && provider.providerId === 'gemini') {
    return provider.connection.apiKeySource === 'stored'
      ? 'API key is configured in Manage'
      : (provider.connection.apiKeySourceLabel ?? 'API key is configured');
  }

  if (provider.providerId === 'codex') {
    return provider.connection.apiKeySource === 'stored'
      ? 'Saved API key available in Manage'
      : (provider.connection.apiKeySourceLabel ?? 'API key is configured');
  }

  return provider.connection.apiKeySourceLabel ?? null;
}

export function getProviderDisconnectAction(provider: CliProviderStatus): {
  label: string;
  confirmLabel: string;
  title: string;
  message: string;
} | null {
  if (!provider.authenticated) {
    return null;
  }

  if (provider.providerId === 'anthropic') {
    if (provider.authMethod !== 'oauth_token' && provider.authMethod !== 'claude.ai') {
      return null;
    }

    return {
      label: 'Disconnect',
      confirmLabel: 'Disconnect',
      title: 'Disconnect Anthropic subscription?',
      message: provider.connection?.apiKeyConfigured
        ? 'This removes the local Anthropic subscription session from the Claude CLI runtime. Saved API keys in Manage stay available.'
        : 'This removes the local Anthropic subscription session from the Claude CLI runtime.',
    };
  }

  if (provider.providerId === 'gemini' && provider.authMethod === 'cli_oauth_personal') {
    return {
      label: 'Disconnect',
      confirmLabel: 'Disconnect',
      title: 'Disconnect Gemini CLI?',
      message:
        'This clears the local Gemini CLI session metadata. External ADC credentials and saved API keys are not removed.',
    };
  }

  return null;
}

export function getProviderConnectLabel(provider: CliProviderStatus): string {
  if (provider.providerId === 'anthropic') {
    return 'Connect Anthropic';
  }

  if (provider.providerId === 'codex') {
    return 'Configure API key';
  }

  if (provider.providerId === 'gemini') {
    return 'Open Login';
  }

  return 'Connect';
}

export function shouldShowProviderConnectAction(provider: CliProviderStatus): boolean {
  if (provider.providerId === 'codex') {
    return false;
  }

  if (!provider.canLoginFromUi || provider.authenticated) {
    return false;
  }

  if (provider.connection?.configuredAuthMode === 'api_key') {
    return false;
  }

  return true;
}
