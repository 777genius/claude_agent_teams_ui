import React from 'react';

import { IS_MAC } from '@renderer/utils/platformKeys';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const mod = IS_MAC ? '\u2318' : 'Ctrl';
const alt = IS_MAC ? '\u2325' : 'Alt';
const shift = IS_MAC ? '\u21E7' : 'Shift';

const shortcutKeys = [
  { keys: [`${alt}+J`], actionKey: 'review.keyboardShortcuts.nextChange' },
  { keys: [`${alt}+K`], actionKey: 'review.keyboardShortcuts.previousChange' },
  { keys: [`${alt}+\u2193`], actionKey: 'review.keyboardShortcuts.nextFile' },
  { keys: [`${alt}+\u2191`], actionKey: 'review.keyboardShortcuts.previousFile' },
  { keys: [`${mod}+Y`], actionKey: 'review.keyboardShortcuts.acceptChange' },
  { keys: [`${mod}+N`], actionKey: 'review.keyboardShortcuts.rejectChange' },
  { keys: [`${mod}+S`], actionKey: 'review.keyboardShortcuts.saveFile' },
  { keys: [`${mod}+Z`], actionKey: 'review.keyboardShortcuts.undo' },
  { keys: [`${mod}+${shift}+Z`], actionKey: 'review.keyboardShortcuts.redo' },
  { keys: ['?'], actionKey: 'review.keyboardShortcuts.toggleShortcuts' },
  { keys: ['Esc'], actionKey: 'review.keyboardShortcuts.closeDialog' },
];

export const KeyboardShortcutsHelp = ({
  open,
  onOpenChange,
}: KeyboardShortcutsHelpProps): React.ReactElement | null => {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="absolute right-4 top-14 z-50 w-64 rounded-lg border border-border bg-surface-overlay p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-text">{t('review.keyboardShortcuts.title')}</span>
        <button
          onClick={() => onOpenChange(false)}
          className="rounded p-0.5 text-text-muted hover:bg-surface-raised hover:text-text"
        >
          <X className="size-3" />
        </button>
      </div>
      <div className="space-y-1">
        {shortcutKeys.map(({ keys, actionKey }) => (
          <div key={actionKey} className="flex items-center justify-between text-xs">
            <span className="text-text-secondary">{t(actionKey)}</span>
            <div className="flex gap-1">
              {keys.map((key) => (
                <kbd
                  key={key}
                  className="rounded border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] text-text-muted"
                >
                  {key}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
