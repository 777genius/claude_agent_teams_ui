import { MemberWorkSyncReconciler } from './MemberWorkSyncReconciler';

import type { MemberWorkSyncStatus, MemberWorkSyncStatusRequest } from '../../contracts';
import type { MemberWorkSyncUseCaseDeps } from './ports';

export class MemberWorkSyncDiagnosticsReader {
  private readonly reconciler: MemberWorkSyncReconciler;

  constructor(deps: MemberWorkSyncUseCaseDeps) {
    this.reconciler = new MemberWorkSyncReconciler(deps);
  }

  async execute(request: MemberWorkSyncStatusRequest): Promise<MemberWorkSyncStatus> {
    return this.reconciler.execute(request);
  }
}
