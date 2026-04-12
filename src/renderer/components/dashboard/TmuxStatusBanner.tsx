import { useCallback, useEffect, useMemo, useState } from 'react';

import { api, isElectronMode } from '@renderer/api';
import { AlertTriangle, ExternalLink, RefreshCw, Wrench } from 'lucide-react';

import type { TmuxStatus } from '@shared/types';

const OFFICIAL_TMUX_INSTALL_URL = 'https://github.com/tmux/tmux/wiki/Installing';

type BannerState =
  | { loading: true; status: null; error: null }
  | { loading: false; status: TmuxStatus; error: null }
  | { loading: false; status: null; error: string };

const INITIAL_STATE: BannerState = { loading: true, status: null, error: null };

function PlatformInstallMatrix(): React.JSX.Element {
  return (
    <div className="mt-3 grid gap-2 lg:grid-cols-3">
      <div
        className="rounded-md border px-3 py-2"
        style={{
          borderColor: 'rgba(245, 158, 11, 0.18)',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
        }}
      >
        <div className="mb-1 text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
          macOS
        </div>
        <div className="space-y-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          <div>Homebrew</div>
          <code className="block rounded bg-black/20 px-2 py-1 font-mono">brew install tmux</code>
          <div>MacPorts</div>
          <code className="block rounded bg-black/20 px-2 py-1 font-mono">port install tmux</code>
        </div>
      </div>

      <div
        className="rounded-md border px-3 py-2"
        style={{
          borderColor: 'rgba(245, 158, 11, 0.18)',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
        }}
      >
        <div className="mb-1 text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
          Linux
        </div>
        <div className="space-y-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          <code className="block rounded bg-black/20 px-2 py-1 font-mono">apt install tmux</code>
          <code className="block rounded bg-black/20 px-2 py-1 font-mono">dnf install tmux</code>
          <code className="block rounded bg-black/20 px-2 py-1 font-mono">yum install tmux</code>
          <code className="block rounded bg-black/20 px-2 py-1 font-mono">zypper install tmux</code>
          <code className="block rounded bg-black/20 px-2 py-1 font-mono">pacman -S tmux</code>
        </div>
      </div>

      <div
        className="rounded-md border px-3 py-2"
        style={{
          borderColor: 'rgba(245, 158, 11, 0.18)',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
        }}
      >
        <div className="mb-1 text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
          Windows
        </div>
        <div className="space-y-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          <p>В official tmux wiki нет native Windows install command.</p>
          <p>
            Рекомендуемый путь: WSL, затем внутри Linux-дистрибутива использовать одну из Linux
            команд выше, например <code className="font-mono">apt install tmux</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

function getPrimaryDetail(status: TmuxStatus): string {
  if (status.platform === 'darwin') {
    return 'На macOS проще всего поставить tmux через Homebrew или MacPorts.';
  }
  if (status.platform === 'linux') {
    return 'На Linux команда зависит от дистрибутива: apt, dnf, yum, zypper или pacman.';
  }
  if (status.platform === 'win32') {
    return 'На Windows у official tmux wiki нет native installer; safest путь — WSL и установка tmux внутри Linux-дистрибутива.';
  }
  return 'Поставь tmux через пакетный менеджер своей ОС.';
}

export const TmuxStatusBanner = (): React.JSX.Element | null => {
  const isElectron = useMemo(() => isElectronMode(), []);
  const [state, setState] = useState<BannerState>(INITIAL_STATE);

  const fetchStatus = useCallback(async () => {
    setState(
      (prev) =>
        ({
          loading: true,
          status: prev.status,
          error: null,
        }) as BannerState
    );

    try {
      const status = await api.tmux.getStatus();
      setState({ loading: false, status, error: null });
    } catch (error) {
      setState({
        loading: false,
        status: null,
        error: error instanceof Error ? error.message : 'Failed to check tmux status',
      });
    }
  }, []);

  useEffect(() => {
    if (!isElectron) {
      return;
    }
    void fetchStatus();
  }, [fetchStatus, isElectron]);

  if (!isElectron) return null;
  if (state.loading && !state.status) return null;

  if (state.error && !state.status) {
    return (
      <div
        className="mb-6 rounded-lg border-l-4 px-4 py-3"
        style={{
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.06)',
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: '#fbbf24' }} />
            <div>
              <div className="text-sm font-medium" style={{ color: '#fbbf24' }}>
                Failed to check tmux availability
              </div>
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {state.error}
              </p>
            </div>
          </div>
          <button
            onClick={() => void fetchStatus()}
            className="flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            <RefreshCw className="size-3.5" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!state.status || state.status.available) {
    return null;
  }

  return (
    <div
      className="mb-6 rounded-lg border-l-4 px-4 py-3"
      style={{
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.06)',
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Wrench className="mt-0.5 size-4 shrink-0" style={{ color: '#fbbf24' }} />
          <div className="min-w-0">
            <div className="text-sm font-medium" style={{ color: '#fbbf24' }}>
              tmux is not installed
            </div>
            <p
              className="mt-1 text-xs leading-relaxed"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Persistent team agents работают стабильнее в process/tmux path. Без tmux app остаётся
              на более тяжёлом in-process пути. {getPrimaryDetail(state.status)}
            </p>
            {state.status.error && (
              <p className="mt-1 text-xs" style={{ color: '#fbbf24' }}>
                Last check error: {state.status.error}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => void fetchStatus()}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            <RefreshCw className={`size-3.5 ${state.loading ? 'animate-spin' : ''}`} />
            Re-check
          </button>
          <button
            onClick={() => void api.openExternal(OFFICIAL_TMUX_INSTALL_URL)}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            <ExternalLink className="size-3.5" />
            Open guide
          </button>
        </div>
      </div>

      <PlatformInstallMatrix />
    </div>
  );
};
