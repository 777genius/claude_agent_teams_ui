import { TmuxCommandRunner } from '@features/tmux-installer/main/infrastructure/installer/TmuxCommandRunner';
import { TmuxInstallStrategyResolver } from '@features/tmux-installer/main/infrastructure/installer/TmuxInstallStrategyResolver';
import { TmuxInstallTerminalSession } from '@features/tmux-installer/main/infrastructure/installer/TmuxInstallTerminalSession';
import { TmuxWslService } from '@features/tmux-installer/main/infrastructure/wsl/TmuxWslService';
import { WindowsElevatedStepRunner } from '@features/tmux-installer/main/infrastructure/wsl/WindowsElevatedStepRunner';
import { getErrorMessage } from '@shared/utils/errorHandling';

import type { TmuxInstallerProgressPresenter } from '../presenters/TmuxInstallerProgressPresenter';
import type { TmuxInstallerSnapshot, TmuxStatus } from '@features/tmux-installer/contracts';
import type { TmuxInstallerRunnerPort } from '@features/tmux-installer/core/application/ports/TmuxInstallerRunnerPort';
import type { TmuxInstallerSnapshotPort } from '@features/tmux-installer/core/application/ports/TmuxInstallerSnapshotPort';
import type { TmuxStatusSourcePort } from '@features/tmux-installer/core/application/ports/TmuxStatusSourcePort';
import type { TmuxInstallPlan } from '@features/tmux-installer/main/infrastructure/installer/TmuxInstallStrategyResolver';

const MAX_LOG_LINES = 400;
const RETRY_WITH_UPDATE_PATTERNS = ['unable to locate package', 'failed to fetch'];
const RECOMMENDED_WSL_DISTRO_NAME = 'Ubuntu';

class TmuxInstallCancelledError extends Error {
  constructor() {
    super('tmux installation cancelled');
    this.name = 'TmuxInstallCancelledError';
  }
}

export class TmuxInstallerRunnerAdapter
  implements TmuxInstallerRunnerPort, TmuxInstallerSnapshotPort
{
  readonly #statusSource: TmuxStatusSourcePort;
  readonly #strategyResolver: TmuxInstallStrategyResolver;
  readonly #commandRunner: TmuxCommandRunner;
  readonly #terminalSession: TmuxInstallTerminalSession;
  readonly #wslService: TmuxWslService;
  readonly #windowsElevatedStepRunner: WindowsElevatedStepRunner;
  readonly #presenter: TmuxInstallerProgressPresenter;
  #cancelRequested = false;
  #snapshot: TmuxInstallerSnapshot = {
    phase: 'idle',
    strategy: null,
    message: null,
    detail: null,
    error: null,
    canCancel: false,
    logs: [],
    acceptsInput: false,
    inputPrompt: null,
    inputSecret: false,
    updatedAt: new Date().toISOString(),
  };

  constructor(
    statusSource: TmuxStatusSourcePort,
    presenter: TmuxInstallerProgressPresenter,
    strategyResolver = new TmuxInstallStrategyResolver(),
    commandRunner = new TmuxCommandRunner(),
    terminalSession = new TmuxInstallTerminalSession(),
    wslService = new TmuxWslService(),
    windowsElevatedStepRunner = new WindowsElevatedStepRunner()
  ) {
    this.#statusSource = statusSource;
    this.#presenter = presenter;
    this.#strategyResolver = strategyResolver;
    this.#commandRunner = commandRunner;
    this.#terminalSession = terminalSession;
    this.#wslService = wslService;
    this.#windowsElevatedStepRunner = windowsElevatedStepRunner;
  }

  getSnapshot(): TmuxInstallerSnapshot {
    return { ...this.#snapshot, logs: [...this.#snapshot.logs] };
  }

  async install(): Promise<void> {
    if (this.#snapshot.canCancel) {
      throw new Error('tmux installation is already in progress');
    }
    this.#cancelRequested = false;

    const currentStatus = await this.#statusSource.getStatus();
    if (currentStatus.effective.runtimeReady) {
      this.#setSnapshot({
        phase: 'completed',
        strategy: currentStatus.autoInstall.strategy,
        message: 'tmux is already installed',
        detail: currentStatus.effective.detail,
        error: null,
        canCancel: false,
        acceptsInput: false,
        inputPrompt: null,
        inputSecret: false,
        resetLogs: true,
      });
      return;
    }

    if (currentStatus.platform === 'win32') {
      await this.#installOnWindows(currentStatus);
      return;
    }

    const plan = await this.#strategyResolver.resolve();
    if (!plan.capability.supported || !plan.command) {
      this.#setSnapshot({
        phase: 'needs_manual_step',
        strategy: plan.capability.strategy,
        message: 'Automatic install is not available in this environment',
        detail: plan.capability.reasonIfUnsupported ?? null,
        error: null,
        canCancel: false,
        acceptsInput: false,
        inputPrompt: null,
        inputSecret: false,
        resetLogs: true,
      });
      return;
    }

    try {
      await this.#runResolvedPlan(plan);
    } catch (error) {
      if (this.#isCancelledError(error) || this.#cancelRequested) {
        return;
      }
      this.#setSnapshot({
        phase: 'error',
        strategy: plan.capability.strategy,
        message: 'tmux installation failed',
        detail: null,
        error: getErrorMessage(error),
        canCancel: false,
        acceptsInput: false,
        inputPrompt: null,
        inputSecret: false,
      });
      throw error;
    }
  }

  async cancel(): Promise<void> {
    if (!this.#snapshot.canCancel) {
      return;
    }

    this.#cancelRequested = true;
    this.#commandRunner.cancel();
    this.#terminalSession.cancel();
    this.#setSnapshot({
      phase: 'cancelled',
      strategy: this.#snapshot.strategy,
      message: 'tmux installation cancelled',
      detail: null,
      error: null,
      canCancel: false,
      acceptsInput: false,
      inputPrompt: null,
      inputSecret: false,
    });
  }

  async submitInput(input: string): Promise<void> {
    if (!this.#snapshot.acceptsInput) {
      throw new Error('tmux installer is not waiting for terminal input right now');
    }

    this.#terminalSession.writeLine(input);
  }

  async #installOnWindows(currentStatus: TmuxStatus): Promise<void> {
    this.#setSnapshot({
      phase: 'preparing',
      strategy: 'wsl',
      message: 'Preparing the Windows WSL tmux setup...',
      detail:
        'The app can keep working without tmux, but WSL-backed tmux gives the most reliable persistent teammate path on Windows.',
      error: null,
      canCancel: true,
      acceptsInput: false,
      inputPrompt: null,
      inputSecret: false,
      resetLogs: true,
    });

    try {
      let status = currentStatus;

      if (!status.wsl?.wslInstalled) {
        status = await this.#installWindowsWslCore();
        if (!status.wsl?.wslInstalled) {
          return;
        }
      }

      if (status.wsl?.rebootRequired) {
        this.#setSnapshot({
          phase: 'needs_restart',
          strategy: 'wsl',
          message: 'Restart Windows before continuing with tmux setup',
          detail:
            status.wsl.statusDetail ??
            'WSL was installed, but Windows still needs a restart before a distro and tmux can be configured.',
          error: null,
          canCancel: false,
          acceptsInput: false,
          inputPrompt: null,
          inputSecret: false,
        });
        return;
      }

      if (!status.wsl?.distroName) {
        status = await this.#installWindowsDistro();
        if (!status.wsl?.distroName) {
          return;
        }
      }

      if (status.wsl?.distroName) {
        await this.#wslService.persistPreferredDistro(status.wsl.distroName);
      }

      if (!status.wsl?.distroBootstrapped) {
        this.#setSnapshot({
          phase: 'waiting_for_external_step',
          strategy: 'wsl',
          message: `Finish the first Linux setup in ${status.wsl?.distroName ?? 'your WSL distro'}`,
          detail: status.wsl?.distroName
            ? `Open ${status.wsl.distroName} once, create the Linux user/password, then click Re-check or Install tmux again.`
            : 'Open your WSL distro once, finish the initial Linux user setup, then re-check.',
          error: null,
          canCancel: false,
          acceptsInput: false,
          inputPrompt: null,
          inputSecret: false,
        });
        return;
      }

      const plan = await this.#strategyResolver.resolve();
      if (!plan.capability.supported || !plan.command) {
        this.#setSnapshot({
          phase: 'needs_manual_step',
          strategy: plan.capability.strategy,
          message: 'Automatic tmux install is not available inside WSL right now',
          detail: plan.capability.reasonIfUnsupported ?? status.wsl?.statusDetail ?? null,
          error: null,
          canCancel: false,
          acceptsInput: false,
          inputPrompt: null,
          inputSecret: false,
        });
        return;
      }

      await this.#runResolvedPlan(plan);
    } catch (error) {
      if (this.#isCancelledError(error) || this.#cancelRequested) {
        return;
      }
      this.#setSnapshot({
        phase: 'error',
        strategy: 'wsl',
        message: 'Windows tmux setup failed',
        detail: null,
        error: getErrorMessage(error),
        canCancel: false,
        acceptsInput: false,
        inputPrompt: null,
        inputSecret: false,
      });
      throw error;
    }
  }

  async #installWindowsWslCore(): Promise<TmuxStatus> {
    this.#appendLog('Starting the elevated WSL core install step...');
    this.#setSnapshot({
      phase: 'pending_external_elevation',
      strategy: 'wsl',
      message: 'Install WSL',
      detail:
        'An administrator PowerShell window may open. Accept it to install the Windows Subsystem for Linux.',
      error: null,
      canCancel: false,
      acceptsInput: false,
      inputPrompt: null,
      inputSecret: false,
    });

    const elevationResult = await this.#windowsElevatedStepRunner.runWslCoreInstall();
    if (elevationResult.detail) {
      this.#appendLog(elevationResult.detail);
    }

    this.#setSnapshot({
      phase: 'waiting_for_external_step',
      strategy: 'wsl',
      message: 'Checking WSL after the administrator step...',
      detail: 'The app is refreshing the WSL status after the elevated install flow.',
      error: null,
      canCancel: false,
      acceptsInput: false,
      inputPrompt: null,
      inputSecret: false,
    });
    const status = await this.#refreshStatus();

    if (elevationResult.outcome === 'elevated_cancelled' && !status.wsl?.wslInstalled) {
      this.#setSnapshot({
        phase: 'needs_manual_step',
        strategy: 'wsl',
        message: 'WSL install was cancelled',
        detail:
          'The administrator step was cancelled before WSL finished installing. Try again or install WSL manually, then re-check.',
        error: null,
        canCancel: false,
        acceptsInput: false,
        inputPrompt: null,
        inputSecret: false,
      });
      return status;
    }

    if (status.wsl?.rebootRequired) {
      this.#setSnapshot({
        phase: 'needs_restart',
        strategy: 'wsl',
        message: 'Restart Windows before continuing with tmux setup',
        detail:
          status.wsl.statusDetail ??
          'WSL was installed, but Windows still needs a restart before tmux setup can continue.',
        error: null,
        canCancel: false,
        acceptsInput: false,
        inputPrompt: null,
        inputSecret: false,
      });
      return status;
    }

    if (!status.wsl?.wslInstalled) {
      this.#setSnapshot({
        phase: 'needs_manual_step',
        strategy: 'wsl',
        message: 'WSL still is not ready',
        detail:
          status.wsl?.statusDetail ??
          'The app could not confirm that WSL is ready after the administrator step. Continue manually from the Microsoft WSL guide, then re-check.',
        error: null,
        canCancel: false,
        acceptsInput: false,
        inputPrompt: null,
        inputSecret: false,
      });
    }

    return status;
  }

  async #installWindowsDistro(): Promise<TmuxStatus> {
    const distroCommand = {
      command: 'wsl.exe',
      args: ['--install', '-d', RECOMMENDED_WSL_DISTRO_NAME, '--no-launch'],
      env: process.env,
      cwd: process.cwd(),
      requiresPty: false,
      displayCommand: `wsl --install -d ${RECOMMENDED_WSL_DISTRO_NAME} --no-launch`,
    } satisfies NonNullable<TmuxInstallPlan['command']>;

    const fallbackDistroCommand = {
      command: 'wsl.exe',
      args: ['--install', '--web-download', '-d', RECOMMENDED_WSL_DISTRO_NAME, '--no-launch'],
      env: process.env,
      cwd: process.cwd(),
      requiresPty: false,
      displayCommand: `wsl --install --web-download -d ${RECOMMENDED_WSL_DISTRO_NAME} --no-launch`,
    } satisfies NonNullable<TmuxInstallPlan['command']>;

    const initialResult = await this.#runCommand({
      ...distroCommand,
    });
    if (initialResult.exitCode !== 0) {
      this.#appendLog('Retrying WSL distro install with --web-download...');
      const fallbackResult = await this.#runCommand(fallbackDistroCommand);
      if (fallbackResult.exitCode !== 0) {
        this.#setSnapshot({
          phase: 'needs_manual_step',
          strategy: 'wsl',
          message: 'Ubuntu install needs a manual WSL step',
          detail:
            'The app could not install Ubuntu automatically. Try the Microsoft WSL flow manually, then re-check.',
          error: null,
          canCancel: false,
          acceptsInput: false,
          inputPrompt: null,
          inputSecret: false,
        });
        return this.#refreshStatus();
      }
    }

    await this.#wslService.persistPreferredDistro(RECOMMENDED_WSL_DISTRO_NAME);

    this.#setSnapshot({
      phase: 'waiting_for_external_step',
      strategy: 'wsl',
      message: 'Checking the installed WSL distro...',
      detail:
        'If Ubuntu was just installed, it may still need its first Linux user setup before tmux can be installed there.',
      error: null,
      canCancel: false,
      acceptsInput: false,
      inputPrompt: null,
      inputSecret: false,
    });
    const status = await this.#refreshStatus();
    if (!status.wsl?.distroName) {
      this.#setSnapshot({
        phase: 'needs_manual_step',
        strategy: 'wsl',
        message: 'WSL distro install still needs a manual step',
        detail:
          status.wsl?.statusDetail ??
          'The app could not confirm that a WSL distro is ready yet. Finish the distro install manually, then re-check.',
        error: null,
        canCancel: false,
        acceptsInput: false,
        inputPrompt: null,
        inputSecret: false,
      });
      return status;
    }
    return status;
  }

  async #runResolvedPlan(plan: TmuxInstallPlan, resetLogs = true): Promise<void> {
    this.#setSnapshot({
      phase: 'preparing',
      strategy: plan.capability.strategy,
      message: `Preparing ${plan.capability.packageManagerLabel ?? plan.capability.strategy} install...`,
      detail: null,
      error: null,
      canCancel: true,
      acceptsInput: false,
      inputPrompt: null,
      inputSecret: false,
      resetLogs,
    });

    const initialResult = await this.#runCommand(plan.command!);
    if (
      initialResult.exitCode !== 0 &&
      plan.retryWithUpdateCommand &&
      this.#shouldRetryWithUpdate(this.#snapshot.logs)
    ) {
      this.#appendLog('Retrying after refreshing package metadata...');
      const updateResult = await this.#runCommand(plan.retryWithUpdateCommand);
      if (updateResult.exitCode !== 0) {
        throw new Error('Package metadata refresh failed');
      }
      const retryResult = await this.#runCommand(plan.command!);
      if (retryResult.exitCode !== 0) {
        throw new Error('tmux install command failed');
      }
    } else if (initialResult.exitCode !== 0) {
      throw new Error('tmux install command failed');
    }

    this.#setSnapshot({
      phase: 'verifying',
      strategy: plan.capability.strategy,
      message: 'Verifying tmux installation...',
      detail: null,
      error: null,
      canCancel: false,
      acceptsInput: false,
      inputPrompt: null,
      inputSecret: false,
    });

    const verifiedStatus = await this.#refreshStatus();
    if (!verifiedStatus.effective.runtimeReady) {
      throw new Error('tmux verification failed after install');
    }

    if (verifiedStatus.platform === 'win32' && verifiedStatus.wsl?.distroName) {
      await this.#wslService.persistPreferredDistro(verifiedStatus.wsl.distroName);
    }

    this.#setSnapshot({
      phase: 'completed',
      strategy: plan.capability.strategy,
      message: 'tmux installed successfully',
      detail: verifiedStatus.effective.detail,
      error: null,
      canCancel: false,
      acceptsInput: false,
      inputPrompt: null,
      inputSecret: false,
    });
  }

  async #runCommand(spec: NonNullable<TmuxInstallPlan['command']>): Promise<{ exitCode: number }> {
    if (spec.requiresPty) {
      this.#setSnapshot({
        phase: 'requesting_privileges',
        strategy: this.#snapshot.strategy,
        message: spec.displayCommand ?? [spec.command, ...spec.args].join(' '),
        detail:
          'The installer is running in an interactive terminal. Enter your password below if sudo prompts for it.',
        error: null,
        canCancel: true,
        acceptsInput: true,
        inputPrompt: 'Enter password if prompted',
        inputSecret: true,
      });
      const result = await this.#terminalSession.run(spec, {
        onLine: (line) => this.#appendLog(line),
      });
      this.#throwIfCancelled();
      this.#setSnapshot({
        phase: 'installing',
        strategy: this.#snapshot.strategy,
        message: spec.displayCommand ?? [spec.command, ...spec.args].join(' '),
        detail: 'Interactive install finished. Verifying tmux...',
        error: null,
        canCancel: false,
        acceptsInput: false,
        inputPrompt: null,
        inputSecret: false,
      });
      return result;
    }

    this.#setSnapshot({
      phase: 'installing',
      strategy: this.#snapshot.strategy,
      message: spec.displayCommand ?? [spec.command, ...spec.args].join(' '),
      detail: null,
      error: null,
      canCancel: true,
      acceptsInput: false,
      inputPrompt: null,
      inputSecret: false,
    });
    const result = await this.#commandRunner.run(spec, {
      onLine: (line) => this.#appendLog(line),
    });
    this.#throwIfCancelled();
    return result;
  }

  async #refreshStatus(): Promise<TmuxStatus> {
    this.#statusSource.invalidateStatus();
    return this.#statusSource.getStatus();
  }

  #throwIfCancelled(): void {
    if (this.#cancelRequested) {
      throw new TmuxInstallCancelledError();
    }
  }

  #isCancelledError(error: unknown): error is TmuxInstallCancelledError {
    return error instanceof TmuxInstallCancelledError;
  }

  #shouldRetryWithUpdate(logs: string[]): boolean {
    const combined = logs.join('\n').toLowerCase();
    return RETRY_WITH_UPDATE_PATTERNS.some((pattern) => combined.includes(pattern));
  }

  #appendLog(line: string): void {
    const nextLogs = [...this.#snapshot.logs, line].slice(-MAX_LOG_LINES);
    this.#setSnapshot({
      phase: this.#snapshot.phase,
      strategy: this.#snapshot.strategy,
      message: this.#snapshot.message,
      detail: this.#snapshot.detail,
      error: this.#snapshot.error,
      canCancel: this.#snapshot.canCancel,
      acceptsInput: this.#snapshot.acceptsInput,
      inputPrompt: this.#snapshot.inputPrompt,
      inputSecret: this.#snapshot.inputSecret,
      logs: nextLogs,
    });
  }

  #setSnapshot(
    next: Omit<TmuxInstallerSnapshot, 'updatedAt' | 'logs'> &
      Partial<Pick<TmuxInstallerSnapshot, 'logs'>> & { resetLogs?: boolean }
  ): void {
    this.#snapshot = {
      phase: next.phase,
      strategy: next.strategy,
      message: next.message,
      detail: next.detail,
      error: next.error,
      canCancel: next.canCancel,
      acceptsInput: next.acceptsInput,
      inputPrompt: next.inputPrompt,
      inputSecret: next.inputSecret,
      logs: next.resetLogs ? [] : (next.logs ?? this.#snapshot.logs),
      updatedAt: new Date().toISOString(),
    };
    this.#presenter.present(this.#snapshot);
  }
}
