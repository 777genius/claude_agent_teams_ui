/**
 * GeneralSection - General settings including startup, appearance, browser access, and local Claude root.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, isElectronMode } from '@renderer/api';
import { confirm } from '@renderer/components/common/ConfirmDialog';
import { Combobox } from '@renderer/components/ui/combobox';
import { cn } from '@renderer/lib/utils';
import { useStore } from '@renderer/store';
import { getFullResetState } from '@renderer/store/utils/stateResetHelpers';
import { AGENT_LANGUAGE_OPTIONS, resolveLanguageName } from '@shared/utils/agentLanguage';
import { Check, Copy, FolderOpen, Laptop, Loader2, RotateCcw } from 'lucide-react';

import { SettingRow, SettingsSectionHeader, SettingsToggle } from '../components';

import type { SafeConfig } from '../hooks/useSettingsConfig';
import type { ClaudeRootInfo, WslClaudeRootCandidate } from '@shared/types';
import type { HttpServerStatus } from '@shared/types/api';
import type { AppConfig } from '@shared/types/notifications';

// Theme option values — labels are resolved via i18n at render time.
const THEME_VALUES = ['dark', 'light', 'system'] as const;

interface GeneralSectionProps {
  readonly safeConfig: SafeConfig;
  readonly saving: boolean;
  readonly onGeneralToggle: (key: keyof AppConfig['general'], value: boolean) => void;
  readonly onThemeChange: (value: 'dark' | 'light' | 'system') => void;
  readonly onLanguageChange: (value: string) => void;
}

export const GeneralSection = ({
  safeConfig,
  saving,
  onGeneralToggle,
  onThemeChange,
  onLanguageChange,
}: GeneralSectionProps): React.JSX.Element => {
  const { t } = useTranslation();
  const [serverStatus, setServerStatus] = useState<HttpServerStatus>({
    running: false,
    port: 3456,
  });
  const [serverLoading, setServerLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Claude Root state
  const connectionMode = useStore((s) => s.connectionMode);
  const fetchProjects = useStore((s) => s.fetchProjects);
  const fetchRepositoryGroups = useStore((s) => s.fetchRepositoryGroups);

  const [claudeRootInfo, setClaudeRootInfo] = useState<ClaudeRootInfo | null>(null);
  const [updatingClaudeRoot, setUpdatingClaudeRoot] = useState(false);
  const [claudeRootError, setClaudeRootError] = useState<string | null>(null);
  const [findingWslRoots, setFindingWslRoots] = useState(false);
  const [wslCandidates, setWslCandidates] = useState<WslClaudeRootCandidate[]>([]);
  const [showWslModal, setShowWslModal] = useState(false);

  // Fetch server status and Claude root info on mount
  useEffect(() => {
    void api.httpServer.getStatus().then(setServerStatus);
  }, []);

  const loadClaudeRootInfo = useCallback(async () => {
    try {
      const info = await api.config.getClaudeRootInfo();
      setClaudeRootInfo(info);
    } catch (error) {
      setClaudeRootError(
        error instanceof Error ? error.message : t('settings.general.failedToLoadRoot')
      );
    }
  }, []);

  useEffect(() => {
    void loadClaudeRootInfo();
  }, [loadClaudeRootInfo]);

  const handleServerToggle = useCallback(async (enabled: boolean) => {
    setServerLoading(true);
    try {
      const status = enabled ? await api.httpServer.start() : await api.httpServer.stop();
      setServerStatus(status);
    } catch {
      // Status didn't change
    } finally {
      setServerLoading(false);
    }
  }, []);

  const serverUrl = `http://localhost:${serverStatus.port}`;

  const handleCopyUrl = useCallback(() => {
    void navigator.clipboard.writeText(serverUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [serverUrl]);

  // Claude Root handlers
  const resetWorkspaceForRootChange = useCallback((): void => {
    useStore.setState({
      projects: [],
      repositoryGroups: [],
      openTabs: [],
      activeTabId: null,
      selectedTabIds: [],
      paneLayout: {
        panes: [
          {
            id: 'pane-default',
            tabs: [],
            activeTabId: null,
            selectedTabIds: [],
            widthFraction: 1,
          },
        ],
        focusedPaneId: 'pane-default',
      },
      ...getFullResetState(),
    });
  }, []);

  const applyClaudeRootPath = useCallback(
    async (claudeRootPath: string | null): Promise<void> => {
      try {
        setUpdatingClaudeRoot(true);
        setClaudeRootError(null);

        await api.config.update('general', { claudeRootPath });
        await loadClaudeRootInfo();

        if (connectionMode === 'local') {
          resetWorkspaceForRootChange();
          await Promise.all([fetchProjects(), fetchRepositoryGroups()]);
        }
      } catch (error) {
        setClaudeRootError(
          error instanceof Error ? error.message : t('settings.general.failedToUpdateRoot')
        );
      } finally {
        setUpdatingClaudeRoot(false);
      }
    },
    [
      connectionMode,
      fetchProjects,
      fetchRepositoryGroups,
      loadClaudeRootInfo,
      resetWorkspaceForRootChange,
    ]
  );

  const handleSelectClaudeRootFolder = useCallback(async (): Promise<void> => {
    setClaudeRootError(null);

    const selection = await api.config.selectClaudeRootFolder();
    if (!selection) {
      return;
    }

    if (!selection.isClaudeDirName) {
      const proceed = await confirm({
        title: t('settings.general.selectedFolderNotClaude'),
        message: t('settings.general.selectedFolderNotClaudeMessage', {
          name: selection.path.split(/[\\/]/).pop() ?? selection.path,
        }),
        confirmLabel: t('settings.general.useFolderButton'),
      });
      if (!proceed) {
        return;
      }
    }

    if (!selection.hasProjectsDir) {
      const proceed = await confirm({
        title: t('settings.general.noProjectsDirectory'),
        message: t('settings.general.noProjectsDirectoryMessage'),
        confirmLabel: t('settings.general.useFolderButton'),
      });
      if (!proceed) {
        return;
      }
    }

    await applyClaudeRootPath(selection.path);
  }, [applyClaudeRootPath]);

  const handleResetClaudeRoot = useCallback(async (): Promise<void> => {
    await applyClaudeRootPath(null);
  }, [applyClaudeRootPath]);

  const applyWslCandidate = useCallback(
    async (candidate: WslClaudeRootCandidate): Promise<void> => {
      if (!candidate.hasProjectsDir) {
        const proceed = await confirm({
          title: t('settings.general.wslPathMissingProjects'),
          message: t('settings.general.wslPathMissingProjectsMessage', { path: candidate.path }),
          confirmLabel: t('settings.general.usePathButton'),
        });
        if (!proceed) {
          return;
        }
      }

      await applyClaudeRootPath(candidate.path);
      setShowWslModal(false);
    },
    [applyClaudeRootPath]
  );

  const handleUseWslForClaude = useCallback(async (): Promise<void> => {
    try {
      setFindingWslRoots(true);
      setClaudeRootError(null);
      const candidates = await api.config.findWslClaudeRoots();
      setWslCandidates(candidates);

      if (candidates.length === 0) {
        const pickManually = await confirm({
          title: t('settings.general.noWslClaudePaths'),
          message: t('settings.general.noWslClaudePathsMessage'),
          confirmLabel: t('settings.general.selectFolderButton'),
        });
        if (pickManually) {
          await handleSelectClaudeRootFolder();
        }
        return;
      }

      const candidatesWithProjects = candidates.filter((candidate) => candidate.hasProjectsDir);
      if (candidatesWithProjects.length === 1) {
        await applyWslCandidate(candidatesWithProjects[0]);
        return;
      }

      setShowWslModal(true);
    } catch (error) {
      setClaudeRootError(
        error instanceof Error ? error.message : t('settings.general.failedToDetectWslPaths')
      );
    } finally {
      setFindingWslRoots(false);
    }
  }, [applyWslCandidate, handleSelectClaudeRootFolder]);

  const isCustomClaudeRoot = Boolean(claudeRootInfo?.customPath);
  const resolvedClaudeRootPath = claudeRootInfo?.resolvedPath ?? '~/.claude';
  const defaultClaudeRootPath = claudeRootInfo?.defaultPath ?? '~/.claude';
  const isWindowsStyleDefaultPath =
    /^[a-zA-Z]:\\/.test(defaultClaudeRootPath) || defaultClaudeRootPath.startsWith('\\\\');

  const isElectron = useMemo(() => isElectronMode(), []);

  const themeOptions = useMemo(
    () =>
      THEME_VALUES.map((value) => ({
        value,
        label: t(`settings.general.theme${value.charAt(0).toUpperCase() + value.slice(1)}`),
      })),
    [t]
  );

  const agentLanguageDescription = useMemo(() => {
    const current = safeConfig.general.agentLanguage ?? 'system';
    if (current === 'system') {
      const browserLang = navigator.language;
      const primaryCode = browserLang.includes('-') ? browserLang.split('-')[0] : browserLang;
      const detected = resolveLanguageName('system', browserLang);
      const detectedFlag = AGENT_LANGUAGE_OPTIONS.find((o) => o.value === primaryCode)?.flag ?? '';
      const flagPrefix = detectedFlag ? `${detectedFlag} ` : '';
      return `${t('settings.general.languageDescription')} (${t('settings.general.detected')}: ${flagPrefix}${detected})`;
    }
    return t('settings.general.languageDescription');
  }, [safeConfig.general.agentLanguage, t]);

  const languageComboboxOptions = useMemo(
    () =>
      AGENT_LANGUAGE_OPTIONS.map((opt) => ({
        value: opt.value,
        label: `${opt.flag}  ${opt.label}`,
        meta: { flag: opt.flag },
      })),
    []
  );

  const renderLanguageOption = useCallback(
    (
      option: { value: string; label: string; meta?: Record<string, unknown> },
      isSelected: boolean
    ) => (
      <>
        <Check className={`mr-2 size-3.5 shrink-0 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
        <span className="text-[var(--color-text)]">{option.label}</span>
      </>
    ),
    []
  );

  return (
    <div>
      <SettingsSectionHeader title={t('settings.general.agentLanguage')} />
      <SettingRow label={t('settings.general.language')} description={agentLanguageDescription}>
        <Combobox
          options={languageComboboxOptions}
          value={safeConfig.general.agentLanguage ?? 'system'}
          onValueChange={onLanguageChange}
          placeholder={t('settings.general.selectLanguage')}
          searchPlaceholder={t('settings.general.searchLanguage')}
          emptyMessage={t('settings.general.noLanguageFound')}
          disabled={saving}
          className="min-w-[180px]"
          renderOption={renderLanguageOption}
        />
      </SettingRow>

      {isElectron && (
        <>
          <SettingsSectionHeader title={t('settings.general.startup')} />
          <SettingRow
            label={t('settings.general.launchAtLogin')}
            description={t('settings.general.launchAtLoginDescription')}
          >
            <SettingsToggle
              enabled={safeConfig.general.launchAtLogin}
              onChange={(v) => onGeneralToggle('launchAtLogin', v)}
              disabled={saving}
            />
          </SettingRow>
          {window.navigator.userAgent.includes('Macintosh') && (
            <SettingRow
              label={t('settings.general.showDockIcon')}
              description={t('settings.general.showDockIconDescription')}
            >
              <SettingsToggle
                enabled={safeConfig.general.showDockIcon}
                onChange={(v) => onGeneralToggle('showDockIcon', v)}
                disabled={saving}
              />
            </SettingRow>
          )}
        </>
      )}

      <SettingsSectionHeader title={t('settings.general.appearance')} />
      <SettingRow
        label={t('settings.general.theme')}
        description={t('settings.general.themeDescription')}
      >
        <div className="inline-flex rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={saving}
              className={cn(
                'rounded-[3px] px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                safeConfig.general.theme === opt.value
                  ? 'bg-[var(--color-surface-raised)] text-[var(--color-text)] shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              )}
              onClick={() => onThemeChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </SettingRow>
      <SettingRow
        label={t('settings.general.expandAIResponses')}
        description={t('settings.general.expandAIResponsesDescription')}
      >
        <SettingsToggle
          enabled={safeConfig.general.autoExpandAIGroups ?? false}
          onChange={(v) => onGeneralToggle('autoExpandAIGroups', v)}
          disabled={saving}
        />
      </SettingRow>
      {isElectron && !window.navigator.userAgent.includes('Macintosh') && (
        <SettingRow
          label={t('settings.general.nativeTitleBar')}
          description={t('settings.general.nativeTitleBarDescription')}
        >
          <SettingsToggle
            enabled={safeConfig.general.useNativeTitleBar}
            onChange={async (v) => {
              const shouldRelaunch = await confirm({
                title: t('settings.general.restartRequired'),
                message: t('settings.general.restartRequiredMessage'),
                confirmLabel: t('settings.general.restartButton'),
              });
              if (shouldRelaunch) {
                // Await config write before relaunch to avoid race condition on Windows
                // (antivirus/NTFS can delay file writes beyond a fixed timeout)
                try {
                  await api.config.update('general', { useNativeTitleBar: v });
                } catch {
                  // If save fails, still try to toggle via the normal path
                  onGeneralToggle('useNativeTitleBar', v);
                  await new Promise((r) => setTimeout(r, 500));
                }
                void window.electronAPI?.windowControls?.relaunch();
              }
            }}
            disabled={saving}
          />
        </SettingRow>
      )}

      {isElectron && (
        <>
          <SettingsSectionHeader title={t('settings.general.localClaudeRoot')} />
          <p className="mb-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {t('settings.general.chooseLocalFolder')}
          </p>

          <SettingRow
            label={t('settings.general.currentLocalRoot')}
            description={
              isCustomClaudeRoot
                ? t('settings.general.usingCustomPath')
                : t('settings.general.usingAutoDetectedPath')
            }
          >
            <div className="max-w-96 text-right">
              <div className="truncate font-mono text-xs" style={{ color: 'var(--color-text)' }}>
                {resolvedClaudeRootPath}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                {t('settings.general.autoDetected')}: {defaultClaudeRootPath}
              </div>
            </div>
          </SettingRow>

          <div className="flex items-center gap-3 py-2">
            <button
              onClick={() => void handleSelectClaudeRootFolder()}
              disabled={updatingClaudeRoot}
              className="rounded-md px-4 py-1.5 text-sm transition-colors disabled:opacity-50"
              style={{
                backgroundColor: 'var(--color-surface-raised)',
                color: 'var(--color-text)',
              }}
            >
              <span className="flex items-center gap-2">
                {updatingClaudeRoot ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <FolderOpen className="size-3" />
                )}
                {t('settings.general.selectFolderButton')}
              </span>
            </button>

            <button
              onClick={() => void handleResetClaudeRoot()}
              disabled={updatingClaudeRoot || !isCustomClaudeRoot}
              className="rounded-md px-4 py-1.5 text-sm transition-colors disabled:opacity-50"
              style={{
                backgroundColor: 'var(--color-surface-raised)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <span className="flex items-center gap-2">
                <RotateCcw className="size-3" />
                {t('settings.general.useAutoDetect')}
              </span>
            </button>

            {isWindowsStyleDefaultPath && (
              <button
                onClick={() => void handleUseWslForClaude()}
                disabled={updatingClaudeRoot || findingWslRoots}
                className="rounded-md px-4 py-1.5 text-sm transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--color-surface-raised)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <span className="flex items-center gap-2">
                  {findingWslRoots ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Laptop className="size-3" />
                  )}
                  {t('settings.general.usingLinuxWsl')}
                </span>
              </button>
            )}
          </div>

          {claudeRootError && (
            <div className="rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3">
              <p className="text-sm text-red-400">{claudeRootError}</p>
            </div>
          )}

          {showWslModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <button
                className="absolute inset-0 cursor-default"
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
                onClick={() => setShowWslModal(false)}
                aria-label={t('settings.general.closeWslModal')}
                tabIndex={-1}
              />
              <div
                className="relative mx-4 w-full max-w-2xl rounded-lg border p-5 shadow-xl"
                style={{
                  backgroundColor: 'var(--color-surface-overlay)',
                  borderColor: 'var(--color-border-emphasis)',
                }}
              >
                <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  {t('settings.general.selectWslClaudeRoot')}
                </h3>
                <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {t('settings.general.detectedWslDistributions')}
                </p>

                <div className="mt-4 space-y-2">
                  {wslCandidates.map((candidate) => (
                    <div
                      key={`${candidate.distro}:${candidate.path}`}
                      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                      style={{ borderColor: 'var(--color-border)' }}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                          {candidate.distro}
                        </p>
                        <p
                          className="truncate font-mono text-[11px]"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          {candidate.path}
                        </p>
                        {!candidate.hasProjectsDir && (
                          <p className="text-[11px]" style={{ color: 'var(--warning-text)' }}>
                            {t('settings.general.noProjectsDirectoryDetected')}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => void applyWslCandidate(candidate)}
                        className="rounded-md px-3 py-1.5 text-xs transition-colors"
                        style={{
                          backgroundColor: 'var(--color-surface-raised)',
                          color: 'var(--color-text)',
                        }}
                      >
                        {t('settings.general.useThisPath')}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setShowWslModal(false)}
                    className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-white/5"
                    style={{
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {t('settings.general.cancel')}
                  </button>
                  <button
                    onClick={() => {
                      setShowWslModal(false);
                      void handleSelectClaudeRootFolder();
                    }}
                    className="rounded-md px-3 py-1.5 text-xs transition-colors"
                    style={{
                      backgroundColor: 'var(--color-surface-raised)',
                      color: 'var(--color-text)',
                    }}
                  >
                    {t('settings.general.selectFolderManually')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {isElectron ? (
        <>
          <SettingsSectionHeader title={t('settings.general.browserAccess')} />
          <SettingRow
            label={t('settings.general.enableServerMode')}
            description={t('settings.general.enableServerModeDescription')}
          >
            {serverLoading ? (
              <Loader2
                className="size-5 animate-spin"
                style={{ color: 'var(--color-text-muted)' }}
              />
            ) : (
              <SettingsToggle
                enabled={serverStatus.running}
                onChange={handleServerToggle}
                disabled={saving}
              />
            )}
          </SettingRow>

          {serverStatus.running && (
            <div
              className="mb-2 flex items-center gap-3 rounded-md px-3 py-2.5"
              style={{ backgroundColor: 'var(--color-surface-raised)' }}
            >
              <div
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: '#22c55e' }}
              />
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {t('settings.general.runningOn')}
              </span>
              <code
                className="rounded px-1.5 py-0.5 font-mono text-xs"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {serverUrl}
              </code>
              <button
                onClick={handleCopyUrl}
                className="ml-auto flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-white/5"
                style={{
                  borderColor: 'var(--color-border)',
                  color: copied ? '#22c55e' : 'var(--color-text-secondary)',
                }}
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                {copied ? t('settings.general.copied') : t('settings.general.copyUrl')}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <SettingsSectionHeader title={t('settings.general.server')} />
          <div
            className="mb-2 flex items-center gap-3 rounded-md px-3 py-2.5"
            style={{ backgroundColor: 'var(--color-surface-raised)' }}
          >
            <div className="size-2 shrink-0 rounded-full" style={{ backgroundColor: '#22c55e' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t('settings.general.runningOn')}
            </span>
            <code
              className="rounded px-1.5 py-0.5 font-mono text-xs"
              style={{
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
              }}
            >
              {window.location.origin}
            </code>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(window.location.origin);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="ml-auto flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-white/5"
              style={{
                borderColor: 'var(--color-border)',
                color: copied ? '#22c55e' : 'var(--color-text-secondary)',
              }}
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copied ? t('settings.general.copied') : t('settings.general.copyUrl')}
            </button>
          </div>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {t('settings.general.standaloneDescription')}
          </p>
        </>
      )}

      {/* Privacy / Telemetry — only visible when Sentry DSN is baked into the build */}
      {import.meta.env.VITE_SENTRY_DSN && (
        <>
          <SettingsSectionHeader title={t('settings.general.privacy')} />
          <SettingRow
            label={t('settings.general.sendCrashReports')}
            description={t('settings.general.sendCrashReportsDescription')}
          >
            <SettingsToggle
              enabled={safeConfig.general.telemetryEnabled ?? true}
              onChange={(v) => onGeneralToggle('telemetryEnabled', v)}
              disabled={saving}
            />
          </SettingRow>
        </>
      )}
    </div>
  );
};
