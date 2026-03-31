import React from 'react';
import { useTranslation } from 'react-i18next';

import { Label } from '@renderer/components/ui/label';
import { cn } from '@renderer/lib/utils';
import { Brain } from 'lucide-react';

const EFFORT_OPTION_KEYS = [
  { value: '', labelKey: 'dialogs.effortLevel.default' },
  { value: 'low', labelKey: 'dialogs.effortLevel.low' },
  { value: 'medium', labelKey: 'dialogs.effortLevel.medium' },
  { value: 'high', labelKey: 'dialogs.effortLevel.high' },
] as const;

export interface EffortLevelSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
}

export const EffortLevelSelector: React.FC<EffortLevelSelectorProps> = ({
  value,
  onValueChange,
  id,
}) => {
  const { t } = useTranslation();
  return (
    <div className="mb-3">
      <Label htmlFor={id} className="label-optional mb-1.5 block">
        {t('dialogs.effortLevel.label')}
      </Label>
      <div className="flex items-center gap-2">
        <Brain size={16} className="shrink-0 text-[var(--color-text-muted)]" />
        <div className="inline-flex rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5">
          {EFFORT_OPTION_KEYS.map((opt) => (
            <button
              key={opt.value || '__default__'}
              type="button"
              id={opt.value === value ? id : undefined}
              className={cn(
                'rounded-[3px] px-3 py-1 text-xs font-medium transition-colors',
                value === opt.value
                  ? 'bg-[var(--color-surface-raised)] text-[var(--color-text)] shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              )}
              onClick={() => onValueChange(opt.value)}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
        {t('dialogs.effortLevel.description')}
      </p>
    </div>
  );
};
