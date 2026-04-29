import type { FastMCP } from 'fastmcp';
import { z } from 'zod';

import { getController } from '../controller';
import { jsonTextContent } from '../utils/format';
import { assertConfiguredTeam } from '../utils/teamConfig';

const controlContextSchema = {
  teamName: z.string().min(1),
  claudeDir: z.string().min(1).optional(),
  controlUrl: z.string().optional(),
  waitTimeoutMs: z.number().int().min(1000).max(600000).optional(),
};

const reportStateSchema = z.enum(['still_working', 'blocked', 'caught_up']);

export function registerWorkSyncTools(server: Pick<FastMCP, 'addTool'>) {
  server.addTool({
    name: 'member_work_sync_status',
    description:
      'Read your current actionable-work agenda and agendaFingerprint before reporting whether you are still working, blocked, or caught up.',
    parameters: z.object({
      ...controlContextSchema,
      memberName: z.string().min(1).optional(),
      from: z.string().min(1).optional(),
    }),
    execute: async ({ teamName, claudeDir, controlUrl, waitTimeoutMs, memberName, from }) => {
      assertConfiguredTeam(teamName, claudeDir);
      return jsonTextContent(
        await getController(teamName, claudeDir).workSync.memberWorkSyncStatus({
          ...(memberName ? { memberName } : {}),
          ...(from ? { from } : {}),
          ...(controlUrl ? { controlUrl } : {}),
          ...(waitTimeoutMs ? { waitTimeoutMs } : {}),
        })
      );
    },
  });

  server.addTool({
    name: 'member_work_sync_report',
    description:
      'Report your validated work-sync state for the current agendaFingerprint. This never completes tasks. Use still_working while actively continuing, blocked only when the board has blocker evidence, and caught_up only when the status agenda is empty.',
    parameters: z.object({
      ...controlContextSchema,
      memberName: z.string().min(1).optional(),
      from: z.string().min(1).optional(),
      state: reportStateSchema,
      agendaFingerprint: z.string().min(1),
      taskIds: z.array(z.string().min(1)).optional(),
      note: z.string().optional(),
      leaseTtlMs: z.number().int().min(60000).max(3600000).optional(),
    }),
    execute: async ({
      teamName,
      claudeDir,
      controlUrl,
      waitTimeoutMs,
      memberName,
      from,
      state,
      agendaFingerprint,
      taskIds,
      note,
      leaseTtlMs,
    }) => {
      assertConfiguredTeam(teamName, claudeDir);
      return jsonTextContent(
        await getController(teamName, claudeDir).workSync.memberWorkSyncReport({
          ...(memberName ? { memberName } : {}),
          ...(from ? { from } : {}),
          state,
          agendaFingerprint,
          ...(taskIds ? { taskIds } : {}),
          ...(note ? { note } : {}),
          ...(leaseTtlMs ? { leaseTtlMs } : {}),
          ...(controlUrl ? { controlUrl } : {}),
          ...(waitTimeoutMs ? { waitTimeoutMs } : {}),
        })
      );
    },
  });
}
