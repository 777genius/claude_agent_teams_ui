/**
 * CliInstallWarningBanner — Global warning strip shown below the tab bar
 * when Claude Code CLI is not installed.
 *
 * Hidden on Dashboard pages (which have their own detailed CliStatusBanner).
 * Only rendered in Electron mode.
 */

import { isElectronMode } from '@renderer/api';
import { useStore } from '@renderer/store';
import { AlertTriangle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

export const CliInstallWarningBanner = (): React.JSX.Element | null => {
  const cliStatus = useStore(useShallow((s) => s.cliStatus));
  const openDashboard = useStore((s) => s.openDashboard);

  // Returns a primitive boolean — minimizes re-renders
  const isDashboardFocused = useStore((s) => {
    const fp = s.paneLayout.panes.find((p) => p.id === s.paneLayout.focusedPaneId);
    if (!fp) return false;
    if (fp.tabs.length === 0) return true; // empty pane = default DashboardView
    return fp.tabs.find((t) => t.id === fp.activeTabId)?.type === 'dashboard';
  });

  // Hide when: not Electron, status not loaded yet, CLI installed, or dashboard is focused
  if (!isElectronMode() || !cliStatus || cliStatus.installed || isDashboardFocused) {
    return null;
  }

  return (
    <div
      className="flex items-center gap-2 border-b px-4 py-2"
      style={{
        backgroundColor: 'var(--warning-bg)',
        borderColor: 'var(--warning-border)',
        color: 'var(--warning-text)',
      }}
    >
      <AlertTriangle className="size-3.5 shrink-0" />
      <span className="text-xs">
        {cliStatus.binaryPath && cliStatus.launchError
          ? 'Claude Code was found but failed to start. Open the Dashboard to repair or reinstall it.'
          : 'Claude Code is not installed. Install it from the Dashboard to enable all features.'}
      </span>
      <button
        onClick={openDashboard}
        className="ml-auto shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-white/5"
        style={{
          borderColor: 'var(--warning-border)',
          color: 'var(--warning-text)',
        }}
      >
        Go to Dashboard
      </button>
    </div>
  );
};
