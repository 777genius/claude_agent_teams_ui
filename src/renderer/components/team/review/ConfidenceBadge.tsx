import { useTranslation } from 'react-i18next';

import type { TaskScopeConfidence } from '@shared/types';

interface ConfidenceBadgeProps {
  confidence: TaskScopeConfidence;
  showTooltip?: boolean;
}

const TIER_COLORS: Record<number, string> = {
  1: 'bg-green-500/20 text-green-400 border-green-500/30',
  2: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  3: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  4: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const TIER_LABEL_KEYS: Record<number, string> = {
  1: 'review.confidence.high',
  2: 'review.confidence.medium',
  3: 'review.confidence.low',
  4: 'review.confidence.bestEffort',
};

export const ConfidenceBadge = ({ confidence, showTooltip = true }: ConfidenceBadgeProps) => {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${TIER_COLORS[confidence.tier] ?? TIER_COLORS[4]}`}
      title={showTooltip ? confidence.reason : undefined}
    >
      {t(TIER_LABEL_KEYS[confidence.tier] ?? TIER_LABEL_KEYS[4])}
    </span>
  );
};
