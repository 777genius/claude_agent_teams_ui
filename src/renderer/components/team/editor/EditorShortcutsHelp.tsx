/**
 * Keyboard shortcuts help modal for the project editor.
 *
 * Cross-platform: detects Mac vs Windows/Linux and shows
 * the appropriate modifier symbols.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog';
import { IS_MAC } from '@renderer/utils/platformKeys';

// =============================================================================
// Types
// =============================================================================

interface EditorShortcutsHelpProps {
  onClose: () => void;
}

interface ShortcutDef {
  mac: string;
  other: string;
  descriptionKey: string;
}

// =============================================================================
// Shortcuts data (uses i18n keys for titles and descriptions)
// =============================================================================

const SHORTCUT_GROUPS: { titleKey: string; shortcuts: ShortcutDef[] }[] = [
  {
    titleKey: 'editor.shortcuts.fileOperations',
    shortcuts: [
      { mac: '⌘ P', other: 'Ctrl+P', descriptionKey: 'editor.shortcuts.quickOpen' },
      { mac: '⌘ S', other: 'Ctrl+S', descriptionKey: 'editor.shortcuts.save' },
      { mac: '⌘ ⇧ S', other: 'Ctrl+Shift+S', descriptionKey: 'editor.shortcuts.saveAll' },
      { mac: '⌘ W', other: 'Ctrl+W', descriptionKey: 'editor.shortcuts.closeTab' },
    ],
  },
  {
    titleKey: 'editor.shortcuts.search',
    shortcuts: [
      { mac: '⌘ F', other: 'Ctrl+F', descriptionKey: 'editor.shortcuts.findInFile' },
      { mac: '⌘ ⇧ F', other: 'Ctrl+Shift+F', descriptionKey: 'editor.shortcuts.searchInFiles' },
      { mac: '⌘ G', other: 'Ctrl+G', descriptionKey: 'editor.shortcuts.goToLine' },
    ],
  },
  {
    titleKey: 'editor.shortcuts.navigation',
    shortcuts: [
      { mac: '⌘ ⇧ ]', other: 'Ctrl+Shift+]', descriptionKey: 'editor.shortcuts.nextTab' },
      { mac: '⌘ ⇧ [', other: 'Ctrl+Shift+[', descriptionKey: 'editor.shortcuts.previousTab' },
      { mac: '⌃ Tab', other: 'Ctrl+Tab', descriptionKey: 'editor.shortcuts.cycleTabs' },
      { mac: '⌘ B', other: 'Ctrl+B', descriptionKey: 'editor.shortcuts.toggleSidebar' },
    ],
  },
  {
    titleKey: 'editor.shortcuts.editing',
    shortcuts: [
      { mac: '⌘ Z', other: 'Ctrl+Z', descriptionKey: 'editor.shortcuts.undo' },
      { mac: '⌘ ⇧ Z', other: 'Ctrl+Y', descriptionKey: 'editor.shortcuts.redo' },
      { mac: '⌘ D', other: 'Ctrl+D', descriptionKey: 'editor.shortcuts.selectNextMatch' },
      { mac: '⌘ /', other: 'Ctrl+/', descriptionKey: 'editor.shortcuts.toggleComment' },
    ],
  },
  {
    titleKey: 'editor.shortcuts.markdown',
    shortcuts: [
      { mac: '⌘ ⇧ M', other: 'Ctrl+Shift+M', descriptionKey: 'editor.shortcuts.splitPreview' },
      { mac: '⌘ ⇧ V', other: 'Ctrl+Shift+V', descriptionKey: 'editor.shortcuts.fullPreview' },
    ],
  },
  {
    titleKey: 'editor.shortcuts.general',
    shortcuts: [{ mac: 'Esc', other: 'Esc', descriptionKey: 'editor.shortcuts.closeEditor' }],
  },
];

// =============================================================================
// Component
// =============================================================================

export const EditorShortcutsHelp = ({ onClose }: EditorShortcutsHelpProps): React.ReactElement => {
  const { t } = useTranslation();

  // Resolve platform-specific keys and translate labels
  const resolvedGroups = useMemo(
    () =>
      SHORTCUT_GROUPS.map((group) => ({
        title: t(group.titleKey),
        shortcuts: group.shortcuts.map((s) => ({
          keys: IS_MAC ? s.mac : s.other,
          description: t(s.descriptionKey),
        })),
      })),
    [t]
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[480px] max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-sm">{t('editor.shortcuts.dialogTitle')}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          {resolvedGroups.map((group) => (
            <div key={group.title}>
              <h3 className="mb-1.5 text-xs font-medium text-text-secondary">{group.title}</h3>
              <div className="space-y-1">
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.keys} className="flex items-center justify-between text-xs">
                    <span className="text-text-muted">{shortcut.description}</span>
                    <kbd className="rounded border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
