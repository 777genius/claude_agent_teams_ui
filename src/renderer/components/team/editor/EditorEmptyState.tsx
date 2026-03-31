/**
 * Empty state shown when no file is open in the editor.
 * Shows keyboard shortcuts cheatsheet.
 */

import { useTranslation } from 'react-i18next';

import { shortcutLabel } from '@renderer/utils/platformKeys';
import { FileCode } from 'lucide-react';

const SHORTCUT_KEYS = [
  { keys: shortcutLabel('⌘ P', 'Ctrl+P'), labelKey: 'editor.emptyState.shortcutQuickOpen' },
  {
    keys: shortcutLabel('⌘ ⇧ F', 'Ctrl+Shift+F'),
    labelKey: 'editor.emptyState.shortcutSearchInFiles',
  },
  { keys: shortcutLabel('⌘ S', 'Ctrl+S'), labelKey: 'editor.emptyState.shortcutSave' },
  { keys: shortcutLabel('⌘ B', 'Ctrl+B'), labelKey: 'editor.emptyState.shortcutToggleSidebar' },
  { keys: shortcutLabel('⌘ G', 'Ctrl+G'), labelKey: 'editor.emptyState.shortcutGoToLine' },
  { keys: 'Esc', labelKey: 'editor.emptyState.shortcutCloseEditor' },
];

export const EditorEmptyState = (): React.ReactElement => {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-text-muted">
      <FileCode className="size-12 opacity-30" />
      <p className="text-sm">{t('editor.emptyState.selectFilePrompt')}</p>
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5">
        {SHORTCUT_KEYS.map((s) => (
          <div key={s.keys} className="flex items-center justify-between gap-4 text-xs">
            <span className="text-text-muted">{t(s.labelKey)}</span>
            <kbd className="rounded border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
              {s.keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
};
