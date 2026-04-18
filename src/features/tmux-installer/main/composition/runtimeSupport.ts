import { TmuxStatusSourceAdapter } from '../adapters/output/sources/TmuxStatusSourceAdapter';
import { TmuxPlatformCommandExecutor } from '../infrastructure/runtime/TmuxPlatformCommandExecutor';

const runtimeStatusSource = new TmuxStatusSourceAdapter();
const runtimeCommandExecutor = new TmuxPlatformCommandExecutor();

export async function isTmuxRuntimeReadyForCurrentPlatform(): Promise<boolean> {
  const status = await runtimeStatusSource.getStatus();
  return status.effective.available && status.effective.runtimeReady;
}

export function invalidateTmuxRuntimeStatusCache(): void {
  runtimeStatusSource.invalidateStatus();
}

export async function killTmuxPaneForCurrentPlatform(paneId: string): Promise<void> {
  await runtimeCommandExecutor.killPane(paneId);
  invalidateTmuxRuntimeStatusCache();
}

export async function listTmuxPanePidsForCurrentPlatform(
  paneIds: readonly string[]
): Promise<Map<string, number>> {
  return runtimeCommandExecutor.listPanePids(paneIds);
}

export function killTmuxPaneForCurrentPlatformSync(paneId: string): void {
  runtimeCommandExecutor.killPaneSync(paneId);
  invalidateTmuxRuntimeStatusCache();
}
