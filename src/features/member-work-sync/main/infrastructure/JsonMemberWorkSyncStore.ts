import { atomicWriteAsync } from '@main/utils/atomicWrite';
import { mkdir, readFile, appendFile } from 'fs/promises';

import type { MemberWorkSyncReportRequest, MemberWorkSyncStatus } from '../../contracts';
import type {
  MemberWorkSyncReportStorePort,
  MemberWorkSyncStatusStorePort,
} from '../../core/application';
import type { MemberWorkSyncStorePaths } from './MemberWorkSyncStorePaths';

interface StoreFile {
  schemaVersion: 1;
  members: Record<string, MemberWorkSyncStatus>;
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
    await mkdir(this.paths.getTeamDir(request.teamName), { recursive: true });
    await appendFile(
      this.paths.getPendingReportsPath(request.teamName),
      `${JSON.stringify({ schemaVersion: 1, reason, request, recordedAt: new Date().toISOString() })}\n`,
      'utf8'
    );
  }

  private async readFile(teamName: string): Promise<StoreFile> {
    try {
      const raw = await readFile(this.paths.getStatusPath(teamName), 'utf8');
      const parsed = JSON.parse(raw);
      if (isStoreFile(parsed)) {
        return parsed;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    return { schemaVersion: 1, members: {} };
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
