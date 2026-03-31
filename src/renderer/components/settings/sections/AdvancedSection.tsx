/**
 * AdvancedSection - Advanced settings including config management and about info.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, isElectronMode } from '@renderer/api';
import appIcon from '@renderer/favicon.png';
import { useStore } from '@renderer/store';
import { CheckCircle, Code2, Download, FileEdit, Loader2, RefreshCw, Upload } from 'lucide-react';

import { SettingsSectionHeader } from '../components';

import { CliStatusSection } from './CliStatusSection';
import { ConfigEditorDialog } from './ConfigEditorDialog';

interface AdvancedSectionProps {
  readonly saving: boolean;
  readonly onResetToDefaults: () => void;
  readonly onExportConfig: () => void;
  readonly onImportConfig: () => void;
  readonly onOpenInEditor: () => void;
}

export const AdvancedSection = ({
  saving,
  onResetToDefaults,
  onExportConfig,
  onImportConfig,
  onOpenInEditor,
}: AdvancedSectionProps): React.JSX.Element => {
  const { t } = useTranslation();
  const isElectron = useMemo(() => isElectronMode(), []);
  const [version, setVersion] = useState<string>('');
  const [configEditorOpen, setConfigEditorOpen] = useState(false);
  const updateStatus = useStore((s) => s.updateStatus);
  const availableVersion = useStore((s) => s.availableVersion);
  const checkForUpdates = useStore((s) => s.checkForUpdates);

  // Auto-revert "not-available" / "error" status back to idle after a brief display
  const revertTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (updateStatus === 'not-available' || updateStatus === 'error') {
      revertTimerRef.current = setTimeout(() => {
        useStore.setState({ updateStatus: 'idle' });
      }, 3000);
    }
    return () => {
      if (revertTimerRef.current) clearTimeout(revertTimerRef.current);
    };
  }, [updateStatus]);

  useEffect(() => {
    api.getAppVersion().then(setVersion).catch(console.error);
  }, []);

  const handleCheckForUpdates = useCallback(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  const getUpdateButtonContent = (): React.JSX.Element => {
    switch (updateStatus) {
      case 'checking':
        return (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            {t('settings.advanced.checking')}
          </>
        );
      case 'not-available':
        return (
          <>
            <CheckCircle className="size-3.5" />
            {t('settings.advanced.upToDate')}
          </>
        );
      case 'available':
      case 'downloaded':
        return (
          <>
            <Download className="size-3.5" />
            {updateStatus === 'downloaded'
              ? t('settings.advanced.updateReady')
              : `v${availableVersion ?? 'unknown'} ${t('settings.advanced.available')}`}
          </>
        );
      default:
        return (
          <>
            <RefreshCw className="size-3.5" />
            {t('settings.advanced.checkForUpdates')}
          </>
        );
    }
  };

  return (
    <div>
      <SettingsSectionHeader title={t('settings.advanced.configuration')} />
      <div className="flex flex-wrap gap-2 py-2">
        <button
          onClick={() => setConfigEditorOpen(true)}
          className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-all duration-150 hover:bg-white/5"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
          }}
        >
          <FileEdit className="size-4" />
          {t('settings.advanced.editConfig')}
        </button>
        <button
          onClick={onResetToDefaults}
          disabled={saving}
          className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-all duration-150 hover:bg-white/5 ${saving ? 'cursor-not-allowed opacity-50' : ''}`}
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <RefreshCw className="size-4" />
          {t('settings.advanced.resetToDefaults')}
        </button>
        <button
          onClick={onExportConfig}
          disabled={saving}
          className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-all duration-150 hover:bg-white/5 ${saving ? 'cursor-not-allowed opacity-50' : ''}`}
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <Download className="size-4" />
          {t('settings.advanced.exportConfig')}
        </button>
        <button
          onClick={onImportConfig}
          disabled={saving}
          className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-all duration-150 hover:bg-white/5 ${saving ? 'cursor-not-allowed opacity-50' : ''}`}
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <Upload className="size-4" />
          {t('settings.advanced.importConfig')}
        </button>
        {isElectron && (
          <button
            onClick={onOpenInEditor}
            className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-all duration-150 hover:bg-white/5"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <Code2 className="size-4" />
            {t('settings.advanced.openInEditor')}
          </button>
        )}
      </div>

      <CliStatusSection />

      <SettingsSectionHeader title={t('settings.advanced.about')} />
      <div className="flex items-start gap-4 py-3">
        <img src={appIcon} alt="App Icon" className="size-10 rounded-lg" />
        <div>
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {t('settings.advanced.claudeAgentTeamsUi')}
            </p>
            {isElectron && (
              <button
                onClick={handleCheckForUpdates}
                disabled={updateStatus === 'checking'}
                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-white/5 disabled:opacity-50"
                style={{
                  borderColor: 'var(--color-border)',
                  color:
                    updateStatus === 'not-available'
                      ? 'var(--color-text-muted)'
                      : updateStatus === 'available' || updateStatus === 'downloaded'
                        ? '#60a5fa'
                        : 'var(--color-text-secondary)',
                }}
              >
                {getUpdateButtonContent()}
              </button>
            )}
            {!isElectron && (
              <span
                className="rounded-md border px-2.5 py-1 text-xs font-medium"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-muted)',
                }}
              >
                {t('settings.advanced.standalone', 'Standalone')}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {t('settings.advanced.version')} {version || '...'}
          </p>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            {t('settings.advanced.appDescription')}
          </p>
        </div>
      </div>

      <ConfigEditorDialog
        open={configEditorOpen}
        onClose={() => setConfigEditorOpen(false)}
        onConfigSaved={() => {
          // Config saved via editor — settings page will pick up changes on next render
        }}
      />
    </div>
  );
};
