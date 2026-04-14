import {
  formatInstallButtonLabel,
  formatTmuxInstallerProgress,
  formatTmuxInstallerTitle,
  formatTmuxLocationLabel,
  formatTmuxOptionalBenefits,
  formatTmuxPlatformLabel,
} from '@features/tmux-installer/renderer/utils/formatTmuxInstallerText';

import type {
  TmuxInstallerSnapshot,
  TmuxInstallHint,
  TmuxStatus,
} from '@features/tmux-installer/contracts';

export interface TmuxInstallerBannerViewModel {
  visible: boolean;
  loading: boolean;
  title: string;
  body: string;
  benefitsBody: string | null;
  error: string | null;
  platformLabel: string | null;
  locationLabel: string | null;
  runtimeReadyLabel: string | null;
  versionLabel: string | null;
  phase: TmuxInstallerSnapshot['phase'];
  progressPercent: number | null;
  logs: string[];
  manualHints: TmuxInstallHint[];
  manualHintsCollapsible: boolean;
  primaryGuideUrl: string | null;
  installSupported: boolean;
  installDisabled: boolean;
  installLabel: string;
  installButtonPrimary: boolean;
  showRefreshButton: boolean;
  canCancel: boolean;
  acceptsInput: boolean;
  inputPrompt: string | null;
  inputSecret: boolean;
  detailsOpen: boolean;
}

interface AdaptInput {
  status: TmuxStatus | null;
  snapshot: TmuxInstallerSnapshot;
  loading: boolean;
  error: string | null;
  detailsOpen: boolean;
}

export class TmuxInstallerBannerAdapter {
  static create(): TmuxInstallerBannerAdapter {
    return new TmuxInstallerBannerAdapter();
  }

  adapt(input: AdaptInput): TmuxInstallerBannerViewModel {
    const status = input.status;
    const snapshot = input.snapshot;
    const visible = input.loading
      ? false
      : (status ? !status.effective.runtimeReady : true) || snapshot.phase !== 'idle';
    const title =
      snapshot.phase === 'idle' && status?.effective.available && !status.effective.runtimeReady
        ? 'tmux needs one more step'
        : snapshot.message &&
            (snapshot.phase === 'pending_external_elevation' ||
              snapshot.phase === 'waiting_for_external_step' ||
              snapshot.phase === 'needs_restart' ||
              snapshot.phase === 'needs_manual_step')
          ? snapshot.message
        : formatTmuxInstallerTitle(snapshot.phase);
    const primaryGuideUrl =
      status?.autoInstall.manualHints.find((hint) => typeof hint.url === 'string')?.url ?? null;
    const body =
      input.error ??
      snapshot.error ??
      snapshot.detail ??
      snapshot.message ??
      status?.effective.detail ??
      status?.wsl?.statusDetail ??
      'tmux improves persistent teammate reliability and cleaner recovery for long-running tasks.';
    const benefitsBody =
      status && !status.effective.runtimeReady ? formatTmuxOptionalBenefits(status.platform) : null;
    const runtimeReadyLabel = status
      ? status.effective.runtimeReady
        ? 'Ready for persistent teammates'
        : status.effective.available
          ? 'Installed, but not active yet'
          : null
      : null;
    const versionLabel =
      status?.effective.version ?? status?.host.version ?? status?.wsl?.tmuxVersion ?? null;
    const manualHints = status?.autoInstall.manualHints ?? [];
    const manualHintsCollapsible = status?.platform === 'win32' && manualHints.length > 0;
    const installLabel =
      snapshot.phase === 'idle' &&
      status?.platform === 'win32' &&
      status.autoInstall.strategy === 'wsl' &&
      status.autoInstall.supported
        ? !status.wsl?.wslInstalled
          ? 'Install WSL'
          : !status.wsl?.distroName
            ? 'Install Ubuntu in WSL'
            : 'Install tmux in WSL'
        : formatInstallButtonLabel(snapshot.phase);
    const installDisabled =
      input.loading ||
      snapshot.phase === 'preparing' ||
      snapshot.phase === 'checking' ||
      snapshot.phase === 'requesting_privileges' ||
      snapshot.phase === 'pending_external_elevation' ||
      snapshot.phase === 'waiting_for_external_step' ||
      snapshot.phase === 'installing' ||
      snapshot.phase === 'verifying';
    const installButtonPrimary =
      !installDisabled && (installLabel.startsWith('Install') || installLabel.startsWith('Retry'));
    const showRefreshButton =
      !(status?.autoInstall.supported ?? false) ||
      (installLabel !== 'Re-check' && installLabel !== 'Re-check after restart');

    return {
      visible,
      loading: input.loading,
      title,
      body,
      benefitsBody,
      error: input.error ?? snapshot.error ?? status?.error ?? null,
      platformLabel: formatTmuxPlatformLabel(status?.platform ?? null),
      locationLabel: formatTmuxLocationLabel(status?.effective.location ?? null),
      runtimeReadyLabel,
      versionLabel,
      phase: snapshot.phase,
      progressPercent: formatTmuxInstallerProgress(snapshot.phase),
      logs: snapshot.logs,
      manualHints,
      manualHintsCollapsible,
      primaryGuideUrl,
      installSupported: status?.autoInstall.supported ?? false,
      installDisabled,
      installLabel,
      installButtonPrimary,
      showRefreshButton,
      canCancel: snapshot.canCancel,
      acceptsInput: snapshot.acceptsInput,
      inputPrompt: snapshot.inputPrompt,
      inputSecret: snapshot.inputSecret,
      detailsOpen: input.detailsOpen,
    };
  }
}
