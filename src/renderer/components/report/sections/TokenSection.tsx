import { useTranslation } from 'react-i18next';
import { Coins } from 'lucide-react';

import { AssessmentBadge } from '../AssessmentBadge';
import { ReportSection } from '../ReportSection';

import type { ReportCacheEconomics, ReportTokenUsage } from '@renderer/types/sessionReport';

const fmt = (v: number) => v.toLocaleString();
const fmtCost = (v: number) => `$${v.toFixed(4)}`;

interface TokenSectionProps {
  data: ReportTokenUsage;
  cacheEconomics: ReportCacheEconomics;
  defaultCollapsed?: boolean;
}

export const TokenSection = ({ data, cacheEconomics, defaultCollapsed }: TokenSectionProps) => {
  const { t } = useTranslation();
  const modelEntries = Object.entries(data.byModel).sort((a, b) => b[1].costUsd - a[1].costUsd);

  return (
    <ReportSection
      title={t('report.sections.tokenUsage.title')}
      icon={Coins}
      defaultCollapsed={defaultCollapsed}
    >
      {/* By-model table */}
      <div className="mb-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-text-muted">
              <th className="pb-2 pr-4">{t('report.sections.tokenUsage.model')}</th>
              <th className="pb-2 pr-4 text-right">{t('report.sections.tokenUsage.apiCalls')}</th>
              <th className="pb-2 pr-4 text-right">{t('report.sections.tokenUsage.input')}</th>
              <th className="pb-2 pr-4 text-right">{t('report.sections.tokenUsage.output')}</th>
              <th className="pb-2 pr-4 text-right">{t('report.sections.tokenUsage.cacheRead')}</th>
              <th className="pb-2 pr-4 text-right">
                {t('report.sections.tokenUsage.cacheCreate')}
              </th>
              <th className="pb-2 text-right">{t('report.sections.tokenUsage.cost')}</th>
            </tr>
          </thead>
          <tbody>
            {modelEntries.map(([model, stats]) => (
              <tr key={model} className="border-border/50 border-b">
                <td className="py-1.5 pr-4 text-text">{model}</td>
                <td className="py-1.5 pr-4 text-right text-text">{fmt(stats.apiCalls)}</td>
                <td className="py-1.5 pr-4 text-right text-text">{fmt(stats.inputTokens)}</td>
                <td className="py-1.5 pr-4 text-right text-text">{fmt(stats.outputTokens)}</td>
                <td className="py-1.5 pr-4 text-right text-text">{fmt(stats.cacheRead)}</td>
                <td className="py-1.5 pr-4 text-right text-text">{fmt(stats.cacheCreation)}</td>
                <td className="py-1.5 text-right text-text">{fmtCost(stats.costUsd)}</td>
              </tr>
            ))}
            {/* Totals row */}
            <tr className="border-t border-border font-medium">
              <td className="py-1.5 pr-4 text-text">{t('report.sections.tokenUsage.total')}</td>
              <td className="py-1.5 pr-4 text-right text-text">
                {fmt(modelEntries.reduce((s, [, st]) => s + st.apiCalls, 0))}
              </td>
              <td className="py-1.5 pr-4 text-right text-text">{fmt(data.totals.inputTokens)}</td>
              <td className="py-1.5 pr-4 text-right text-text">{fmt(data.totals.outputTokens)}</td>
              <td className="py-1.5 pr-4 text-right text-text">{fmt(data.totals.cacheRead)}</td>
              <td className="py-1.5 pr-4 text-right text-text">{fmt(data.totals.cacheCreation)}</td>
              <td className="py-1.5 text-right text-text">
                {fmtCost(modelEntries.reduce((s, [, st]) => s + st.costUsd, 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cache economics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <div className="text-xs text-text-muted">
            {t('report.sections.tokenUsage.cacheEfficiency')}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text">
              {cacheEconomics.cacheEfficiencyPct}%
            </span>
            {cacheEconomics.cacheEfficiencyAssessment && (
              <AssessmentBadge
                assessment={cacheEconomics.cacheEfficiencyAssessment}
                metricKey="cacheEfficiency"
              />
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-text-muted">{t('report.sections.tokenUsage.rwRatio')}</div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text">
              {cacheEconomics.cacheReadToWriteRatio}x
            </span>
            {cacheEconomics.cacheRatioAssessment && (
              <AssessmentBadge
                assessment={cacheEconomics.cacheRatioAssessment}
                metricKey="cacheRatio"
              />
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-text-muted">
            {t('report.sections.tokenUsage.cacheReadPercent')}
          </div>
          <div className="text-sm font-medium text-text">{data.totals.cacheReadPct}%</div>
        </div>
        <div>
          <div className="text-xs text-text-muted">{t('report.sections.tokenUsage.coldStart')}</div>
          <div
            className="text-sm font-medium"
            style={{
              color: cacheEconomics.coldStartDetected
                ? 'var(--assess-warning)'
                : 'var(--assess-good)',
            }}
          >
            {cacheEconomics.coldStartDetected
              ? t('report.sections.tokenUsage.yes')
              : t('report.sections.tokenUsage.no')}
          </div>
        </div>
      </div>
    </ReportSection>
  );
};
