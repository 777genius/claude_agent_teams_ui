import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';

import { useStore } from '@renderer/store';
import { ChevronDown, Columns3, History, MessageSquare, Terminal, Users } from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

interface TeamTabSectionNavProps {
  teamName: string;
  onActivate?: () => void;
}

const SECTION_DEFS: readonly { id: string; labelKey: string; icon: LucideIcon }[] = [
  { id: 'team', labelKey: 'layout.sectionNav.team', icon: Users },
  { id: 'sessions', labelKey: 'layout.sectionNav.sessions', icon: History },
  { id: 'kanban', labelKey: 'layout.sectionNav.kanban', icon: Columns3 },
  { id: 'claude-logs', labelKey: 'layout.sectionNav.claudeLogs', icon: Terminal },
  { id: 'messages', labelKey: 'layout.sectionNav.messages', icon: MessageSquare },
];

export const TeamTabSectionNav = ({
  teamName,
  onActivate,
}: TeamTabSectionNavProps): React.JSX.Element => {
  const { t } = useTranslation();
  const messagesPanelMode = useStore((s) => s.messagesPanelMode);
  const [open, setOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });
  const visibleSections = useMemo(
    () =>
      SECTION_DEFS.filter(
        (section) =>
          messagesPanelMode !== 'sidebar' ||
          (section.id !== 'messages' && section.id !== 'claude-logs')
      ).map((s) => ({ ...s, label: t(s.labelKey) })),
    [messagesPanelMode, t]
  );

  const handleNavigate = useCallback(
    (sectionId: string) => {
      onActivate?.();
      const el = document.querySelector(
        `[data-team-name="${CSS.escape(teamName)}"] [data-section-id="${sectionId}"]`
      );
      if (el) {
        el.dispatchEvent(new CustomEvent('team-section-navigate'));
      }
      setOpen(false);
    },
    [teamName, onActivate]
  );

  useEffect(() => {
    if (!open) return;
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 120),
      });
    }
    const handleDismiss = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleDismiss);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleDismiss);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div className="shrink-0" onPointerDown={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        className="flex size-4 items-center justify-center rounded-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        title={t('layout.sectionNav.jumpToSection')}
      >
        <ChevronDown size={10} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            tabIndex={-1}
            className="fixed z-50 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface-overlay)] py-0.5 shadow-lg"
            style={{ top: menuPos.top, left: menuPos.left, minWidth: menuPos.width }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
            }}
          >
            {visibleSections.map((section) => {
              const SectionIcon = section.icon;
              return (
                <button
                  key={section.id}
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-2.5 py-1 text-left text-xs transition-colors"
                  style={{
                    color:
                      hoveredId === section.id
                        ? 'var(--color-text)'
                        : 'var(--color-text-secondary)',
                    backgroundColor:
                      hoveredId === section.id ? 'var(--color-surface-raised)' : 'transparent',
                  }}
                  onMouseEnter={() => setHoveredId(section.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNavigate(section.id);
                  }}
                >
                  <SectionIcon size={12} className="shrink-0" />
                  {section.label}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
};
