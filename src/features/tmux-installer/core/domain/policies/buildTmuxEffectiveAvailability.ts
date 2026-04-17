import type {
  TmuxBinaryProbe,
  TmuxEffectiveAvailability,
  TmuxPlatform,
  TmuxWslStatus,
} from '@features/tmux-installer/contracts';

interface BuildTmuxEffectiveAvailabilityInput {
  platform: TmuxPlatform;
  nativeSupported: boolean;
  host: TmuxBinaryProbe;
  wsl: TmuxWslStatus | null;
}

export function buildTmuxEffectiveAvailability(
  input: BuildTmuxEffectiveAvailabilityInput
): TmuxEffectiveAvailability {
  if (input.platform === 'win32') {
    if (input.wsl?.tmuxAvailableInsideWsl) {
      return {
        available: true,
        location: 'wsl',
        version: input.wsl.tmuxVersion,
        binaryPath: input.wsl.tmuxBinaryPath,
        runtimeReady: input.wsl.distroBootstrapped,
        detail: input.wsl.distroBootstrapped
          ? 'tmux is available inside WSL for the persistent teammate runtime.'
          : 'tmux is installed inside WSL, but the Linux distro still needs first-launch setup.',
      };
    }

    if (input.host.available) {
      return {
        available: true,
        location: 'host',
        version: input.host.version,
        binaryPath: input.host.binaryPath,
        runtimeReady: false,
        detail:
          'tmux was found on Windows, but the app currently relies on a WSL-backed tmux runtime for the most reliable teammate path.',
      };
    }

    if (!input.wsl?.wslInstalled) {
      return {
        available: false,
        location: null,
        version: null,
        binaryPath: null,
        runtimeReady: false,
        detail:
          input.wsl?.statusDetail ??
          'You can keep using the app, but Windows needs WSL before tmux can improve teammate reliability.',
      };
    }

    return {
      available: false,
      location: null,
      version: null,
      binaryPath: null,
      runtimeReady: false,
      detail:
        input.wsl?.statusDetail ??
        'WSL is available, but tmux is not ready there yet. Finish the Linux setup, install tmux, then re-check.',
    };
  }

  if (input.host.available) {
    return {
      available: true,
      location: 'host',
      version: input.host.version,
      binaryPath: input.host.binaryPath,
      runtimeReady: input.nativeSupported,
      detail: 'tmux is available for the persistent teammate runtime.',
    };
  }

  return {
    available: false,
    location: null,
    version: null,
    binaryPath: null,
    runtimeReady: false,
    detail:
      input.platform === 'darwin'
        ? 'You can keep using the app, but tmux improves persistent teammate reliability and restart behavior.'
        : input.platform === 'linux'
          ? 'You can keep using the app, but tmux improves long-running teammate stability and cleaner recovery.'
          : 'You can keep using the app, but tmux improves persistent teammate reliability.',
  };
}
