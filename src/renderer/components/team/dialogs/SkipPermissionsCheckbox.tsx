import React from 'react';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '@renderer/components/ui/checkbox';
import { Label } from '@renderer/components/ui/label';
import { Info } from 'lucide-react';

interface SkipPermissionsCheckboxProps {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export const SkipPermissionsCheckbox: React.FC<SkipPermissionsCheckboxProps> = ({
  id,
  checked,
  onCheckedChange,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <div className="mt-2 flex items-center gap-2">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
        />
        <Label
          htmlFor={id}
          className="flex cursor-pointer items-center gap-1.5 text-xs font-normal text-text-secondary"
        >
          {t('dialogs.skipPermissions.autoApprove')}
        </Label>
      </div>
      {checked ? (
        <div
          className="mt-1.5 rounded-md border px-3 py-2 text-xs"
          style={{
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            borderColor: 'rgba(59, 130, 246, 0.2)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 size-3.5 shrink-0 text-blue-400" />
            <p>{t('dialogs.skipPermissions.autonomousMode')}</p>
          </div>
        </div>
      ) : (
        <div
          className="mt-1.5 rounded-md border px-3 py-2 text-xs"
          style={{
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            borderColor: 'rgba(59, 130, 246, 0.2)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 size-3.5 shrink-0 text-blue-400" />
            <p>{t('dialogs.skipPermissions.manualMode')}</p>
          </div>
        </div>
      )}
    </>
  );
};
