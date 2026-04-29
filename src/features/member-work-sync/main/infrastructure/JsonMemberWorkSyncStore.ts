import { atomicWriteAsync } from '@main/utils/atomicWrite';
import { createHash } from 'crypto';
import { mkdir, readFile, rename } from 'fs/promises';

import type {
  MemberWorkSyncReportIntent,
  MemberWorkSyncReportRequest,
  MemberWorkSyncStatus,
} from '../../contracts';
import type {
  MemberWorkSyncReportStorePort,
  MemberWorkSyncStatusStorePort,
} from '../../core/application';
import type { MemberWorkSyncStorePaths } from './MemberWorkSyncStorePaths';

interface StoreFile {
  schemaVersion: 1;
  members: Record<string, MemberWorkSyncStatus>;
}

interface PendingReportFile {
  schemaVersion: 1;
  intents: Record<string, MemberWorkSyncReportIntent>;
}

function normalizeMemberKey(memberName: string): string {
  return memberName.trim().toLowerCase();
}

function isStoreFile(value: unknown): value is StoreFile {
  return (
    value != null &&
    typeof value === 'object' &&
    (value as StoreFile).schemaVersion === 1 &&
    (value as StoreFile).members != null &&
    typeof (value as StoreFile).members === 'object' &&
    !Array.isArray((value as StoreFile).members)
  );
}

function isPendingReportFile(value: unknown): value is PendingReportFile {
  return (
    value != null &&
    typeof value === 'object' &&
    (value as PendingReportFile).schemaVersion === 1 &&
    (value as PendingReportFile).intents != null &&
    typeof (value as PendingReportFile).intents === 'object' &&
    !Array.isArray((value as PendingReportFile).intents)
  );
}

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function buildPendingReportIntentId(request: MemberWorkSyncReportRequest): string {
  const taskIds = [...new Set(request.taskIds ?? [])].sort();
  const payload = {
    teamName: request.teamName,
    memberName: normalizeMemberKey(request.memberName),
    state: request.state,
    agendaFingerprint: request.agendaFingerprint,
    reportToken: request.reportToken ?? '',
    ...(taskIds.length > 0 ? { taskIds } : {}),
    ...(request.note ? { note: request.note } : {}),
    ...(request.leaseTtlMs ? { leaseTtlMs: request.leaseTtlMs } : {}),
    ...(request.source ? { source: request.source } : {}),
  };
  return `member-work-sync-intent:${createHash('sha256')
    .update(stableStringify(payload))
    .digest('hex')}`;
}

async function quarantineFile(filePath: string): Promise<void> {
  try {
    await rename(filePath, `${filePath}.invalid.${Date.now()}`);
  } catch {
    // If quarantine fails, keep the feature degraded but do not block team operation.
  }
}

export class JsonMemberWorkSyncStore
  implements MemberWorkSyncStatusStorePort, MemberWorkSyncReportStorePort
{
  private readonly writeQueues = new Map<string, Promise<void>>();

  constructor(private readonly paths: MemberWorkSyncStorePaths) {}

  async read(input: {
    teamName: string;
    memberName: string;
  }): Promise<MemberWorkSyncStatus | null> {
    const file = await this.readFile(input.teamName);
    return file.members[normalizeMemberKey(input.memberName)] ?? null;
  }

  async write(status: MemberWorkSyncStatus): Promise<void> {
    await this.enqueue(status.teamName, async () => {
      const existing = await this.readFile(status.teamName);
      existing.members[normalizeMemberKey(status.memberName)] = status;
      await mkdir(this.paths.getTeamDir(status.teamName), { recursive: true });
      await atomicWriteAsync(
        this.paths.getStatusPath(status.teamName),
        JSON.stringify(existing, null, 2)
      );
    });
  }

  async appendPendingReport(request: MemberWorkSyncReportRequest, reason: string): Promise<void> {
    const id = buildPendingReportIntentId(request);
    await this.enqueue(request.teamName, async () => {
      const existing = await this.readPendingFile(request.teamName);
      const current = existing.intents[id];
      if (current && current.status !== 'pending') {
        return;
      }
      existing.intents[id] = {
        id,
        teamName: request.teamName,
        memberName: request.memberName,
        request,
        reason: current?.reason ?? reason,
        status: 'pending',
        recordedAt: current?.recordedAt ?? new Date().toISOString(),
      };
      await this.writePendingFile(request.teamName, existing);
    });
  }

  async listPendingReports(teamName: string): Promise<MemberWorkSyncReportIntent[]> {
    const file = await this.readPendingFile(teamName);
    return Object.values(file.intents)
      .filter((intent) => intent.status === 'pending')
      .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  }

  async markPendingReportProcessed(
    teamName: string,
    id: string,
    result: {
      status: MemberWorkSyncReportIntent['status'];
      resultCode: string;
      processedAt: string;
    }
  ): Promise<void> {
    await this.enqueue(teamName, async () => {
      const existing = await this.readPendingFile(teamName);
      const current = existing.intents[id];
      if (!current || current.status !== 'pending') {
        return;
      }
      existing.intents[id] = {
        ...current,
        status: result.status,
        resultCode: result.resultCode,
        processedAt: result.processedAt,
      };
      await this.writePendingFile(teamName, existing);
    });
  }

  private async readFile(teamName: string): Promise<StoreFile> {
    const filePath = this.paths.getStatusPath(teamName);
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (isStoreFile(parsed)) {
        return parsed;
      }
      await quarantineFile(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        await quarantineFile(filePath);
      }
    }
    return { schemaVersion: 1, members: {} };
  }

  private async readPendingFile(teamName: string): Promise<PendingReportFile> {
    const filePath = this.paths.getPendingReportsPath(teamName);
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (isPendingReportFile(parsed)) {
        return parsed;
      }
      await quarantineFile(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        await quarantineFile(filePath);
      }
    }
    return { schemaVersion: 1, intents: {} };
  }

  private async writePendingFile(teamName: string, file: PendingReportFile): Promise<void> {
    await mkdir(this.paths.getTeamDir(teamName), { recursive: true });
    await atomicWriteAsync(
      this.paths.getPendingReportsPath(teamName),
      JSON.stringify(file, null, 2)
    );
  }

  private async enqueue(teamName: string, operation: () => Promise<void>): Promise<void> {
    const previous = this.writeQueues.get(teamName) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    this.writeQueues.set(
      teamName,
      next.finally(() => {
        if (this.writeQueues.get(teamName) === next) {
          this.writeQueues.delete(teamName);
        }
      })
    );
    await next;
  }
}
