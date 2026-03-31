import { useTranslation } from 'react-i18next';

import { assessmentColor } from '@renderer/utils/reportAssessments';
import { Wrench } from 'lucide-react';

import { AssessmentBadge } from '../AssessmentBadge';
import { ReportSection, sectionId } from '../ReportSection';

import type { ReportToolUsage } from '@renderer/types/sessionReport';

interface ToolSectionProps {
  data: ReportToolUsage;
  defaultCollapsed?: boolean;
}

export const ToolSection = ({ data, defaultCollapsed }: ToolSectionProps) => {
  const { t } = useTranslation();
  const toolEntries = Object.entries(data.successRates).sort(
    (a, b) => b[1].totalCalls - a[1].totalCalls
  );

  return (
    <ReportSection
      title={t('report.sections.toolUsage.title')}
      icon={Wrench}
      defaultCollapsed={defaultCollapsed}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs text-text-muted">
          {t('report.sections.toolUsage.totalCallsSummary', {
            totalCalls: data.totalCalls.toLocaleString(),
            toolCount: toolEntries.length,
          })}
        </span>
        <AssessmentBadge assessment={data.overallToolHealth} metricKey="toolHealth" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-text-muted">
              <th className="pb-2 pr-4">{t('report.sections.toolUsage.tool')}</th>
              <th className="pb-2 pr-4 text-right">{t('report.sections.toolUsage.calls')}</th>
              <th className="pb-2 pr-4 text-right">{t('report.sections.toolUsage.errors')}</th>
              <th className="pb-2 pr-4 text-right">
                {t('report.sections.toolUsage.successPercent')}
              </th>
              <th className="pb-2 text-right">{t('report.sections.toolUsage.health')}</th>
            </tr>
          </thead>
          <tbody>
            {toolEntries.map(([tool, stats]) => {
              const color = assessmentColor(stats.assessment);
              return (
                <tr key={tool} className="border-border/50 border-b">
                  <td className="py-1.5 pr-4 text-text">{tool}</td>
                  <td className="py-1.5 pr-4 text-right text-text">
                    {stats.totalCalls.toLocaleString()}
                  </td>
                  <td className="py-1.5 pr-4 text-right text-text">
                    {stats.errors > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById(sectionId('Errors'));
                          if (el) el.dispatchEvent(new CustomEvent('report-section-expand'));
                        }}
                        className="text-red-400 underline decoration-red-400/30 underline-offset-2 hover:decoration-red-400"
                      >
                        {stats.errors.toLocaleString()}
                      </button>
                    ) : (
                      stats.errors.toLocaleString()
                    )}
                  </td>
                  <td className="py-1.5 pr-4 text-right" style={{ color }}>
                    {stats.successRatePct}%
                  </td>
                  <td className="py-1.5 text-right">
                    <AssessmentBadge assessment={stats.assessment} metricKey="toolHealth" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ReportSection>
  );
};
