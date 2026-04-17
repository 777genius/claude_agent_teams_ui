import type { ProviderId } from './ProviderId';
import type { RecentProjectOpenTarget } from './RecentProjectOpenTarget';

export interface RecentProjectAggregate {
  identity: string;
  displayName: string;
  primaryPath: string;
  associatedPaths: string[];
  lastActivityAt: number;
  providerIds: ProviderId[];
  source: 'claude' | 'codex' | 'mixed';
  openTarget: RecentProjectOpenTarget;
  branchName?: string;
}
