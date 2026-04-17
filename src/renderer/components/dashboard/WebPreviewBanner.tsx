import { isElectronMode } from '@renderer/api';
import { FlaskConical } from 'lucide-react';

export const WebPreviewBanner = (): React.JSX.Element | null => {
  if (isElectronMode()) {
    return null;
  }

  return (
    <div
      className="mb-6 flex items-start gap-3 rounded-lg border px-4 py-3"
      style={{
        borderColor: 'rgba(217, 119, 6, 0.28)',
        backgroundColor: 'rgba(245, 158, 11, 0.14)',
      }}
    >
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-amber-900">Web version is still in development</p>
        <p className="mt-1 text-xs leading-relaxed text-amber-800">
          Some desktop features are not available in the browser yet. Project actions, integrations,
          and live status data may be limited or not work as expected.
        </p>
      </div>
    </div>
  );
};
