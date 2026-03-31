import { useTranslation } from 'react-i18next';

import { assessmentColor } from '@renderer/utils/reportAssessments';
import { Activity } from 'lucide-react';

import { ReportSection } from '../ReportSection';

import type { ReportOverview } from '@renderer/types/sessionReport';

interface OverviewSectionProps {
  data: ReportOverview;
}

export const OverviewSection = ({ data }: OverviewSectionProps) => {
  const { t } = useTranslation();
  return (
    <ReportSection title={t('report.sections.overview.title')} icon={Activity}>
      <div className="mb-3 truncate text-xs text-text-muted">{data.firstMessage}</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <div className="text-xs text-text-muted">{t('report.sections.overview.duration')}</div>
          <div className="text-sm font-medium text-text">{data.durationHuman}</div>
        </div>
        <div>
          <div className="text-xs text-text-muted">{t('report.sections.overview.messages')}</div>
          <div className="text-sm font-medium text-text">{data.totalMessages.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-xs text-text-muted">
            {t('report.sections.overview.contextUsage')}
          </div>
          <div
            className="text-sm font-medium"
            style={{ color: assessmentColor(data.contextAssessment) }}
          >
            {data.contextConsumptionPct != null
              ? `${data.contextConsumptionPct}%`
              : t('report.sections.overview.notAvailable')}
            {data.contextAssessment && (
              <span className="ml-1 text-xs">({data.contextAssessment})</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-text-muted">{t('report.sections.overview.compactions')}</div>
          <div className="text-sm font-medium text-text">{data.compactionCount}</div>
        </div>
        <div>
          <div className="text-xs text-text-muted">{t('report.sections.overview.branch')}</div>
          <div className="truncate text-sm font-medium text-text">{data.gitBranch}</div>
        </div>
        <div>
          <div className="text-xs text-text-muted">{t('report.sections.overview.subagents')}</div>
          <div className="text-sm font-medium text-text">
            {data.hasSubagents
              ? t('report.sections.tokenUsage.yes')
              : t('report.sections.tokenUsage.no')}
          </div>
        </div>
        <div>
          <div className="text-xs text-text-muted">{t('report.sections.overview.project')}</div>
          <div className="truncate text-sm font-medium text-text" title={data.projectPath}>
            {data.projectPath}
          </div>
        </div>
        <div>
          <div className="text-xs text-text-muted">{t('report.sections.overview.sessionId')}</div>
          <div className="truncate text-sm font-medium text-text" title={data.sessionId}>
            {data.sessionId.slice(0, 12)}...
          </div>
        </div>
      </div>
    </ReportSection>
  );
};
