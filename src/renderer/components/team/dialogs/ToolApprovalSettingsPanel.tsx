import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '@renderer/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { useStore } from '@renderer/store';
import { ChevronDown, ChevronRight, Settings } from 'lucide-react';

import type { ToolApprovalSettings, ToolApprovalTimeoutAction } from '@shared/types';

export const ToolApprovalSettingsToggle: React.FC<{ expanded: boolean; onToggle: () => void }> = ({
  expanded,
  onToggle,
}) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors"
      style={{ color: 'var(--color-text-muted)' }}
      onMouseEnter={(e) => {
        Object.assign(e.currentTarget.style, {
          backgroundColor: 'var(--color-surface-raised)',
        });
      }}
      onMouseLeave={(e) => {
        Object.assign(e.currentTarget.style, { backgroundColor: 'transparent' });
      }}
    >
      <Settings className="size-3" />
      <span>{t('dialogs.toolApproval.settings')}</span>
      {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
    </button>
  );
};

export const ToolApprovalSettingsContent: React.FC<{
  expanded: boolean;
  teamName?: string;
}> = ({ expanded, teamName }) => {
  const [localSeconds, setLocalSeconds] = useState<string>('');
  const settings = useStore((s) => s.toolApprovalSettings);
  const rawUpdateSettings = useStore((s) => s.updateToolApprovalSettings);
  const { t } = useTranslation();
  const updateSettings = useCallback(
    (patch: Partial<ToolApprovalSettings>) => rawUpdateSettings(patch, teamName),
    [rawUpdateSettings, teamName]
  );

  if (!expanded) return null;

  return (
    <div
      className="mx-4 mb-2 space-y-3 rounded-md border p-3"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      {/* Auto-allow ALL */}
      <label
        className="flex items-center gap-2 text-xs font-medium"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <Checkbox
          checked={settings.autoAllowAll}
          onCheckedChange={(checked) => void updateSettings({ autoAllowAll: checked === true })}
        />
        {t('dialogs.toolApproval.autoAllowAll')}
      </label>

      {/* Separator */}
      <div className="border-t" style={{ borderColor: 'var(--color-border)' }} />

      {/* Auto-allow file edits */}
      <label
        className="flex items-center gap-2 text-xs"
        style={{
          color: 'var(--color-text-secondary)',
          opacity: settings.autoAllowAll ? 0.5 : 1,
        }}
      >
        <Checkbox
          checked={settings.autoAllowAll || settings.autoAllowFileEdits}
          disabled={settings.autoAllowAll}
          onCheckedChange={(checked) =>
            void updateSettings({ autoAllowFileEdits: checked === true })
          }
        />
        {t('dialogs.toolApproval.autoAllowFileEdits')}
      </label>

      {/* Auto-allow safe bash */}
      <label
        className="flex items-center gap-2 text-xs"
        style={{
          color: 'var(--color-text-secondary)',
          opacity: settings.autoAllowAll ? 0.5 : 1,
        }}
      >
        <Checkbox
          checked={settings.autoAllowAll || settings.autoAllowSafeBash}
          disabled={settings.autoAllowAll}
          onCheckedChange={(checked) =>
            void updateSettings({ autoAllowSafeBash: checked === true })
          }
        />
        {t('dialogs.toolApproval.autoAllowSafeBash')}
      </label>

      {/* Separator */}
      <div className="border-t" style={{ borderColor: 'var(--color-border)' }} />

      {/* Timeout section */}
      <div
        className="flex items-center gap-2 text-xs"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <span className="shrink-0">{t('dialogs.toolApproval.onTimeout')}</span>
        <Select
          value={settings.timeoutAction}
          onValueChange={(value) =>
            void updateSettings({ timeoutAction: value as ToolApprovalTimeoutAction })
          }
        >
          <SelectTrigger className="h-7 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[60]">
            <SelectItem value="wait">{t('dialogs.toolApproval.waitForever')}</SelectItem>
            <SelectItem value="allow">{t('dialogs.toolApproval.allow')}</SelectItem>
            <SelectItem value="deny">{t('dialogs.toolApproval.deny')}</SelectItem>
          </SelectContent>
        </Select>

        {settings.timeoutAction !== 'wait' && (
          <>
            <span className="shrink-0">{t('dialogs.toolApproval.after')}</span>
            <input
              type="number"
              min={5}
              max={300}
              value={localSeconds !== '' ? localSeconds : String(settings.timeoutSeconds)}
              onChange={(e) => setLocalSeconds(e.target.value)}
              onBlur={() => {
                const val = parseInt(localSeconds, 10);
                if (!isNaN(val) && val >= 5 && val <= 300) {
                  void updateSettings({ timeoutSeconds: val });
                }
                setLocalSeconds('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              className="w-14 rounded border px-1.5 py-0.5 text-center text-xs"
              style={{
                backgroundColor: 'var(--color-surface-raised)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
            <span className="shrink-0">{t('dialogs.toolApproval.sec')}</span>
          </>
        )}
      </div>
    </div>
  );
};
