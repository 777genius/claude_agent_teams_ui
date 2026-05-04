import { randomUUID } from 'crypto';

import type {
  OpenCodeBridgeRuntimeSnapshot,
  OpenCodeLaunchTeamCommandBody,
  OpenCodeLaunchTeamCommandData,
  OpenCodeObserveMessageDeliveryCommandBody,
  OpenCodeObserveMessageDeliveryCommandData,
  OpenCodeReconcileTeamCommandBody,
  OpenCodeSendMessageCommandBody,
  OpenCodeSendMessageCommandData,
  OpenCodeStopTeamCommandBody,
  OpenCodeStopTeamCommandData,
  OpenCodeTeamMemberLaunchBridgeState,
} from '../opencode/bridge/OpenCodeBridgeCommandContract';
import type { OpenCodeTeamLaunchReadiness } from '../opencode/readiness/OpenCodeTeamLaunchReadiness';
import type {
  TeamLaunchRuntimeAdapter,
  TeamRuntimeLaunchInput,
  TeamRuntimeLaunchResult,
  TeamRuntimeMemberLaunchEvidence,
  TeamRuntimeMemberStopEvidence,
  TeamRuntimePrepareResult,
  TeamRuntimeReconcileInput,
  TeamRuntimeReconcileResult,
  TeamRuntimeStopInput,
  TeamRuntimeStopResult,
} from './TeamRuntimeAdapter';
import type { AgentActionMode, TaskRef } from '@shared/types/team';

export interface OpenCodeTeamRuntimeBridgePort {
  checkOpenCodeTeamLaunchReadiness(input: {
    projectPath: string;
    selectedModel: string | null;
    requireExecutionProbe: boolean;
  }): Promise<OpenCodeTeamLaunchReadiness>;
  getLastOpenCodeRuntimeSnapshot?(projectPath: string): OpenCodeBridgeRuntimeSnapshot | null;
  launchOpenCodeTeam?(input: OpenCodeLaunchTeamCommandBody): Promise<OpenCodeLaunchTeamCommandData>;
  reconcileOpenCodeTeam?(
    input: OpenCodeReconcileTeamCommandBody
  ): Promise<OpenCodeLaunchTeamCommandData>;
  stopOpenCodeTeam?(input: OpenCodeStopTeamCommandBody): Promise<OpenCodeStopTeamCommandData>;
  sendOpenCodeTeamMessage?(
    input: OpenCodeSendMessageCommandBody
  ): Promise<OpenCodeSendMessageCommandData>;
  observeOpenCodeTeamMessageDelivery?(
    input: OpenCodeObserveMessageDeliveryCommandBody
  ): Promise<OpenCodeObserveMessageDeliveryCommandData>;
}

export interface OpenCodeTeamRuntimeMessageInput {
  runId?: string;
  teamName: string;
  laneId: string;
  memberName: string;
  cwd: string;
  text: string;
  messageId?: string;
  replyRecipient?: string;
  actionMode?: AgentActionMode;
  taskRefs?: TaskRef[];
  bootstrapCheckinRetry?: {
    runtimeSessionId: string;
    reason?: string;
  };
}

export interface OpenCodeTeamRuntimeMessageResult {
  ok: boolean;
  providerId: 'opencode';
  memberName: string;
  sessionId?: string;
  runtimePid?: number;
  prePromptCursor?: string | null;
  responseObservation?: OpenCodeSendMessageCommandData['responseObservation'];
  diagnostics: string[];
}

const REQUIRED_READY_CHECKPOINTS = new Set([
  'required_tools_proven',
  'delivery_ready',
  'member_ready',
  'run_ready',
]);
const GENERIC_OPEN_CODE_MEMBER_FAILURE_REASON = 'OpenCode bridge reported member launch failure';
const SECRET_FLAG_PATTERN =
  /(--(?:api-key|token|password|secret|authorization|auth-token)(?:=|\s+))("[^"]*"|'[^']*'|\S+)/gi;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SECRET_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{16,}\b/g;

export class OpenCodeTeamRuntimeAdapter implements TeamLaunchRuntimeAdapter {
  readonly providerId = 'opencode' as const;
  private readonly lastProjectPathByTeamName = new Map<string, string>();
  private readonly lastReadinessByProjectPath = new Map<string, OpenCodeTeamLaunchReadiness>();

  constructor(private readonly bridge: OpenCodeTeamRuntimeBridgePort) {}

  async prepare(input: TeamRuntimeLaunchInput): Promise<TeamRuntimePrepareResult> {
    const runtimeOnly = input.runtimeOnly === true;
    const readiness = await this.bridge.checkOpenCodeTeamLaunchReadiness({
      projectPath: input.cwd,
      selectedModel: input.model ?? null,
      requireExecutionProbe: !runtimeOnly,
    });
    this.lastReadinessByProjectPath.set(input.cwd, readiness);

    if (!readiness.launchAllowed) {
      return {
        ok: false,
        providerId: this.providerId,
        reason: readiness.state,
        retryable: isRetryableReadinessState(readiness.state),
        diagnostics: mergeDiagnostics(readiness.diagnostics, readiness.missing),
        warnings: [],
      };
    }

    return {
      ok: true,
      providerId: this.providerId,
      modelId: readiness.modelId,
      diagnostics: readiness.diagnostics,
      warnings: [],
    };
  }

  getLastOpenCodeTeamLaunchReadiness(projectPath: string): OpenCodeTeamLaunchReadiness | null {
    return this.lastReadinessByProjectPath.get(projectPath) ?? null;
  }

  async launch(input: TeamRuntimeLaunchInput): Promise<TeamRuntimeLaunchResult> {
    const memberValidationDiagnostics = validateOpenCodeRuntimeMembers(
      input.expectedMembers,
      input.cwd
    );
    if (memberValidationDiagnostics.length > 0) {
      return blockedLaunchResult(
        input,
        'opencode_invalid_expected_members',
        memberValidationDiagnostics
      );
    }

    const skipReadinessPreflight = input.skipReadinessPreflight === true;
    let selectedModel = input.model?.trim() ?? '';
    let launchWarnings: string[] = [];
    if (!skipReadinessPreflight) {
      const prepared = await this.prepare(input);
      if (!prepared.ok) {
        return blockedLaunchResult(input, prepared.reason, prepared.diagnostics, prepared.warnings);
      }
      selectedModel = prepared.modelId ?? selectedModel;
      launchWarnings = prepared.warnings;
    }

    if (!this.bridge.launchOpenCodeTeam) {
      return blockedLaunchResult(input, 'opencode_launch_bridge_missing', [
        'OpenCode state-changing launch bridge is not registered.',
      ]);
    }

    if (!selectedModel) {
      return blockedLaunchResult(input, 'opencode_model_unavailable', [
        'OpenCode launch requires a selected raw model id.',
      ]);
    }

    const runtimeSnapshot = skipReadinessPreflight
      ? null
      : (this.bridge.getLastOpenCodeRuntimeSnapshot?.(input.cwd) ?? null);
    this.lastProjectPathByTeamName.set(input.teamName, input.cwd);
    const data = await this.bridge.launchOpenCodeTeam({
      runId: input.runId,
      laneId: input.laneId?.trim() || 'primary',
      teamId: input.teamName,
      teamName: input.teamName,
      projectPath: input.cwd,
      selectedModel,
      members: input.expectedMembers.map((member) => ({
        name: member.name,
        role: member.role?.trim() || member.workflow?.trim() || 'teammate',
        prompt: buildMemberBootstrapPrompt(input, member),
      })),
      leadPrompt: input.prompt?.trim() ?? '',
      expectedCapabilitySnapshotId: runtimeSnapshot?.capabilitySnapshotId ?? null,
      manifestHighWatermark: null,
    });

    return mapOpenCodeLaunchDataToRuntimeResult(input, data, launchWarnings);
  }

  async reconcile(input: TeamRuntimeReconcileInput): Promise<TeamRuntimeReconcileResult> {
    const memberValidationDiagnostics = validateOpenCodeRuntimeMembers(input.expectedMembers);
    if (memberValidationDiagnostics.length > 0) {
      return {
        ...blockedLaunchResult(
          {
            runId: input.runId,
            teamName: input.teamName,
            cwd: input.expectedMembers[0]?.cwd ?? '',
            providerId: this.providerId,
            skipPermissions: false,
            expectedMembers: input.expectedMembers,
            previousLaunchState: input.previousLaunchState,
          },
          'opencode_invalid_expected_members',
          memberValidationDiagnostics
        ),
        snapshot: input.previousLaunchState,
      };
    }

    if (this.bridge.reconcileOpenCodeTeam) {
      const projectPath =
        input.expectedMembers[0]?.cwd ?? this.lastProjectPathByTeamName.get(input.teamName);
      const runtimeSnapshot = projectPath
        ? (this.bridge.getLastOpenCodeRuntimeSnapshot?.(projectPath) ?? null)
        : null;
      const data = await this.bridge.reconcileOpenCodeTeam({
        runId: input.runId,
        laneId: input.laneId?.trim() || 'primary',
        teamId: input.teamName,
        teamName: input.teamName,
        projectPath,
        expectedCapabilitySnapshotId: runtimeSnapshot?.capabilitySnapshotId ?? null,
        manifestHighWatermark: null,
        reconcileAttemptId: `opencode-reconcile-${randomUUID()}`,
        expectedMembers: input.expectedMembers.map((member) => ({
          name: member.name,
          model: member.model ?? null,
        })),
        reason: input.reason,
      });
      const mapped = mapOpenCodeLaunchDataToRuntimeResult(
        {
          runId: input.runId,
          teamName: input.teamName,
          cwd: input.expectedMembers[0]?.cwd ?? '',
          providerId: this.providerId,
          skipPermissions: false,
          expectedMembers: input.expectedMembers,
          previousLaunchState: input.previousLaunchState,
        },
        data,
        []
      );
      return {
        ...mapped,
        snapshot: input.previousLaunchState,
      };
    }

    const snapshot = input.previousLaunchState;
    if (!snapshot) {
      return {
        runId: input.runId,
        teamName: input.teamName,
        launchPhase: 'reconciled',
        teamLaunchState: 'partial_pending',
        members: {},
        snapshot: null,
        warnings: [],
        diagnostics: ['No previous OpenCode launch snapshot was available for reconciliation.'],
      };
    }

    return {
      runId: input.runId,
      teamName: input.teamName,
      launchPhase: snapshot.launchPhase,
      teamLaunchState: snapshot.teamLaunchState,
      members: Object.fromEntries(
        Object.entries(snapshot.members).map(([memberName, member]) => [
          memberName,
          {
            memberName,
            providerId: this.providerId,
            launchState: member.launchState,
            agentToolAccepted: member.agentToolAccepted,
            runtimeAlive: member.bootstrapConfirmed === true,
            bootstrapConfirmed: member.bootstrapConfirmed,
            hardFailure: member.hardFailure,
            hardFailureReason: member.hardFailureReason,
            diagnostics: member.diagnostics ?? [],
          } satisfies TeamRuntimeMemberLaunchEvidence,
        ])
      ),
      snapshot,
      warnings: [],
      diagnostics: [`OpenCode launch snapshot reconciled from ${input.reason}.`],
    };
  }

  async sendMessageToMember(
    input: OpenCodeTeamRuntimeMessageInput
  ): Promise<OpenCodeTeamRuntimeMessageResult> {
    if (!this.bridge.sendOpenCodeTeamMessage) {
      return {
        ok: false,
        providerId: this.providerId,
        memberName: input.memberName,
        diagnostics: ['OpenCode message bridge is not registered.'],
      };
    }

    const data = await this.bridge.sendOpenCodeTeamMessage({
      runId: input.runId,
      laneId: input.laneId,
      teamId: input.teamName,
      teamName: input.teamName,
      projectPath: input.cwd,
      memberName: input.memberName,
      text: buildOpenCodeRuntimeMessageText(input),
      messageId: input.messageId,
      actionMode: input.actionMode,
      taskRefs: input.taskRefs,
      agent: 'teammate',
    });

    return {
      ok: data.accepted,
      providerId: this.providerId,
      memberName: input.memberName,
      sessionId: data.sessionId,
      runtimePid: data.runtimePid,
      prePromptCursor: data.prePromptCursor,
      responseObservation: data.responseObservation,
      diagnostics: data.diagnostics.map((diagnostic) => diagnostic.message),
    };
  }

  async observeMessageDelivery(
    input: OpenCodeTeamRuntimeMessageInput & { prePromptCursor?: string | null }
  ): Promise<OpenCodeTeamRuntimeMessageResult> {
    if (!this.bridge.observeOpenCodeTeamMessageDelivery) {
      return {
        ok: false,
        providerId: this.providerId,
        memberName: input.memberName,
        diagnostics: ['OpenCode message delivery observe bridge is not registered.'],
      };
    }
    if (!input.messageId?.trim()) {
      return {
        ok: false,
        providerId: this.providerId,
        memberName: input.memberName,
        diagnostics: ['OpenCode message delivery observe requires messageId.'],
      };
    }

    const data = await this.bridge.observeOpenCodeTeamMessageDelivery({
      runId: input.runId,
      laneId: input.laneId,
      teamId: input.teamName,
      teamName: input.teamName,
      projectPath: input.cwd,
      memberName: input.memberName,
      messageId: input.messageId,
      prePromptCursor: input.prePromptCursor ?? null,
    });

    return {
      ok: data.observed,
      providerId: this.providerId,
      memberName: input.memberName,
      sessionId: data.sessionId,
      runtimePid: data.runtimePid,
      responseObservation: data.responseObservation,
      diagnostics: data.diagnostics.map((diagnostic) => diagnostic.message),
    };
  }

  async stop(input: TeamRuntimeStopInput): Promise<TeamRuntimeStopResult> {
    if (this.bridge.stopOpenCodeTeam) {
      const projectPath = input.cwd ?? this.lastProjectPathByTeamName.get(input.teamName);
      const runtimeSnapshot = projectPath
        ? (this.bridge.getLastOpenCodeRuntimeSnapshot?.(projectPath) ?? null)
        : null;
      const data = await this.bridge.stopOpenCodeTeam({
        runId: input.runId,
        laneId: input.laneId?.trim() || 'primary',
        teamId: input.teamName,
        teamName: input.teamName,
        projectPath,
        expectedCapabilitySnapshotId: runtimeSnapshot?.capabilitySnapshotId ?? null,
        manifestHighWatermark: null,
        reason: input.reason,
        force: input.force,
      });
      if (data.stopped) {
        this.lastProjectPathByTeamName.delete(input.teamName);
      }
      return {
        runId: input.runId,
        teamName: input.teamName,
        stopped: data.stopped,
        members: Object.fromEntries(
          Object.entries(data.members).map(([memberName, member]) => [
            memberName,
            {
              memberName,
              providerId: this.providerId,
              stopped: member.stopped,
              sessionId: member.sessionId,
              diagnostics: member.diagnostics,
            } satisfies TeamRuntimeMemberStopEvidence,
          ])
        ),
        warnings: data.warnings.map((warning) => warning.message),
        diagnostics: data.diagnostics.map(formatOpenCodeBridgeDiagnostic),
      };
    }

    const members = input.previousLaunchState
      ? Object.fromEntries(
          Object.keys(input.previousLaunchState.members).map((memberName) => [
            memberName,
            {
              memberName,
              providerId: this.providerId,
              stopped: true,
              diagnostics: [
                'No live OpenCode session stop command is wired in this adapter shell.',
              ],
            } satisfies TeamRuntimeMemberStopEvidence,
          ])
        )
      : {};

    return {
      runId: input.runId,
      teamName: input.teamName,
      stopped: true,
      members,
      warnings: [],
      diagnostics: input.previousLaunchState
        ? ['OpenCode stop was acknowledged without live session ownership changes.']
        : ['No previous OpenCode launch snapshot was available to stop.'],
    };
  }
}

function mapOpenCodeLaunchDataToRuntimeResult(
  input: TeamRuntimeLaunchInput,
  data: OpenCodeLaunchTeamCommandData,
  prepareWarnings: string[]
): TeamRuntimeLaunchResult {
  const bridgeDiagnostics = data.diagnostics.map(formatOpenCodeBridgeDiagnostic);
  const memberBridgeDiagnostics = bridgeDiagnostics.filter(
    (diagnostic) => !isOpenCodeLaunchTimingDiagnostic(diagnostic)
  );
  const checkpointNames = extractCheckpointNames(data);
  const readyCheckpointsPresent = [...REQUIRED_READY_CHECKPOINTS].every((name) =>
    checkpointNames.has(name)
  );
  const bridgeReady = data.teamLaunchState === 'ready';
  const missingExpectedMembers = input.expectedMembers
    .map((member) => member.name)
    .filter((memberName) => data.members[memberName] == null);
  const unconfirmedExpectedMembers = input.expectedMembers
    .map((member) => member.name)
    .filter((memberName) => data.members[memberName]?.launchState !== 'confirmed_alive');
  const anyExpectedMemberFailed = input.expectedMembers.some(
    (member) => data.members[member.name]?.launchState === 'failed'
  );
  const allExpectedMembersConfirmed =
    input.expectedMembers.length > 0 && unconfirmedExpectedMembers.length === 0;
  const success = bridgeReady && readyCheckpointsPresent && allExpectedMembersConfirmed;
  const checkpointDiagnostic = success
    ? []
    : bridgeReady && !readyCheckpointsPresent
      ? [
          `OpenCode bridge reported ready without all required durable checkpoints: missing ${[
            ...REQUIRED_READY_CHECKPOINTS,
          ]
            .filter((name) => !checkpointNames.has(name))
            .join(', ')}`,
        ]
      : [];
  const incompleteReadyDiagnostic =
    bridgeReady && readyCheckpointsPresent && !allExpectedMembersConfirmed
      ? [
          `OpenCode bridge reported ready before all expected members were confirmed: pending ${unconfirmedExpectedMembers.join(', ')}`,
        ]
      : [];

  const members = Object.fromEntries(
    input.expectedMembers.map((member) => {
      const bridgeMember = data.members[member.name];
      const fallbackLaunchState = bridgeMember
        ? bridgeMember.launchState
        : data.teamLaunchState === 'failed'
          ? 'failed'
          : 'created';
      const checkpointDiagnosticsForMember = [
        ...checkpointDiagnostic,
        ...(missingExpectedMembers.includes(member.name) ? incompleteReadyDiagnostic : []),
      ];
      const memberDiagnostics = [
        ...(bridgeMember
          ? []
          : [
              `OpenCode bridge response did not include ${member.name}; keeping the member pending until lane state materializes.`,
            ]),
        ...(bridgeMember?.diagnostics ?? []),
        ...(bridgeMember?.evidence ?? []).map(
          (evidence) => `${evidence.kind} at ${evidence.observedAt}`
        ),
        ...memberBridgeDiagnostics,
        ...checkpointDiagnosticsForMember,
      ];
      return [
        member.name,
        mapBridgeMemberToRuntimeEvidence(
          member.name,
          fallbackLaunchState,
          bridgeMember?.sessionId,
          bridgeMember?.runtimePid,
          bridgeMember?.pendingPermissionRequestIds,
          bridgeMember != null,
          memberDiagnostics,
          selectOpenCodeMemberFailureReason({
            memberDiagnostics: bridgeMember?.diagnostics ?? [],
            bridgeDiagnostics: data.diagnostics,
            checkpointDiagnostics: checkpointDiagnosticsForMember,
            fallback: GENERIC_OPEN_CODE_MEMBER_FAILURE_REASON,
          })
        ),
      ];
    })
  );

  return {
    runId: input.runId,
    teamName: input.teamName,
    launchPhase: success
      ? 'finished'
      : data.teamLaunchState === 'launching' || (bridgeReady && !anyExpectedMemberFailed)
        ? 'active'
        : 'finished',
    teamLaunchState: success
      ? 'clean_success'
      : anyExpectedMemberFailed || data.teamLaunchState === 'failed'
        ? 'partial_failure'
        : data.teamLaunchState === 'launching' ||
            data.teamLaunchState === 'permission_blocked' ||
            bridgeReady
          ? 'partial_pending'
          : 'partial_failure',
    members,
    warnings: [...prepareWarnings, ...data.warnings.map((warning) => warning.message)],
    diagnostics: [...bridgeDiagnostics, ...checkpointDiagnostic, ...incompleteReadyDiagnostic],
  };
}

function mapBridgeMemberToRuntimeEvidence(
  memberName: string,
  launchState: OpenCodeTeamMemberLaunchBridgeState,
  sessionId: string | undefined,
  runtimePid: number | undefined,
  pendingPermissionRequestIds: string[] | undefined,
  runtimeMaterialized: boolean,
  diagnostics: string[],
  selectedHardFailureReason: string
): TeamRuntimeMemberLaunchEvidence {
  const confirmed = launchState === 'confirmed_alive';
  const failed = launchState === 'failed';
  const hasRuntimePid =
    typeof runtimePid === 'number' && Number.isFinite(runtimePid) && runtimePid > 0;
  const hasSessionId = typeof sessionId === 'string' && sessionId.trim().length > 0;
  const hasRuntimeHandle = hasRuntimePid || hasSessionId;
  const pendingRuntimeObserved = launchState === 'created' && hasRuntimeHandle;
  const livenessKind = confirmed
    ? 'confirmed_bootstrap'
    : pendingRuntimeObserved
      ? 'runtime_process_candidate'
      : launchState === 'permission_blocked'
        ? 'permission_blocked'
        : 'registered_only';
  const runtimeDiagnostic = pendingRuntimeObserved
    ? hasRuntimePid
      ? 'OpenCode runtime pid reported by bridge without local process verification'
      : 'OpenCode session exists without verified runtime pid'
    : launchState === 'permission_blocked'
      ? 'OpenCode runtime is waiting for permission approval'
      : runtimeMaterialized
        ? 'OpenCode bridge did not report a runtime session or pid for this member'
        : undefined;
  const runtimeDiagnosticSeverity = failed
    ? 'error'
    : pendingRuntimeObserved || launchState === 'permission_blocked' || runtimeMaterialized
      ? 'warning'
      : undefined;
  return {
    memberName,
    providerId: 'opencode',
    launchState: failed
      ? 'failed_to_start'
      : confirmed
        ? 'confirmed_alive'
        : launchState === 'permission_blocked'
          ? 'runtime_pending_permission'
          : 'runtime_pending_bootstrap',
    agentToolAccepted:
      confirmed ||
      pendingRuntimeObserved ||
      launchState === 'permission_blocked' ||
      hasRuntimeHandle,
    runtimeAlive: confirmed,
    bootstrapConfirmed: confirmed,
    hardFailure: failed,
    hardFailureReason: failed ? selectedHardFailureReason : undefined,
    pendingPermissionRequestIds:
      pendingPermissionRequestIds && pendingPermissionRequestIds.length > 0
        ? [...new Set(pendingPermissionRequestIds)]
        : undefined,
    sessionId,
    ...(hasRuntimePid ? { runtimePid } : {}),
    livenessKind,
    ...(hasRuntimePid ? { pidSource: 'opencode_bridge' as const } : {}),
    ...(runtimeDiagnostic ? { runtimeDiagnostic } : {}),
    ...(runtimeDiagnosticSeverity ? { runtimeDiagnosticSeverity } : {}),
    diagnostics,
  };
}

function selectOpenCodeMemberFailureReason(input: {
  memberDiagnostics: readonly string[];
  bridgeDiagnostics: readonly {
    code: string;
    severity: 'info' | 'warning' | 'error';
    message: string;
  }[];
  checkpointDiagnostics: readonly string[];
  fallback: string;
}): string {
  return (
    firstDisplayableOpenCodeFailureMessage(input.memberDiagnostics, { includeGeneric: false }) ??
    firstDisplayableOpenCodeFailureMessage(
      input.bridgeDiagnostics
        .filter((diagnostic) => diagnostic.severity === 'error')
        .map((diagnostic) => diagnostic.message),
      { includeGeneric: false }
    ) ??
    firstDisplayableOpenCodeFailureMessage(input.memberDiagnostics, { includeGeneric: true }) ??
    firstDisplayableOpenCodeFailureMessage(input.checkpointDiagnostics, { includeGeneric: true }) ??
    firstDisplayableOpenCodeFailureMessage(
      input.bridgeDiagnostics
        .filter((diagnostic) => diagnostic.severity !== 'info')
        .map((diagnostic) => diagnostic.message),
      { includeGeneric: true }
    ) ??
    normalizeOpenCodeFailureMessage(input.fallback) ??
    GENERIC_OPEN_CODE_MEMBER_FAILURE_REASON
  );
}

function firstDisplayableOpenCodeFailureMessage(
  values: readonly string[],
  options: { includeGeneric: boolean }
): string | undefined {
  for (const value of values) {
    const normalized = normalizeOpenCodeFailureMessage(value);
    if (!normalized) {
      continue;
    }
    if (!options.includeGeneric && isGenericOpenCodeFailureMessage(normalized)) {
      continue;
    }
    return normalized;
  }
  return undefined;
}

function normalizeOpenCodeFailureMessage(value: string | undefined): string | undefined {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed
    .replace(SECRET_FLAG_PATTERN, '$1[redacted]')
    .replace(BEARER_TOKEN_PATTERN, 'Bearer [redacted]')
    .replace(SECRET_KEY_PATTERN, '[redacted-api-key]');
}

function isGenericOpenCodeFailureMessage(message: string): boolean {
  return (
    message === GENERIC_OPEN_CODE_MEMBER_FAILURE_REASON ||
    message.startsWith(`${GENERIC_OPEN_CODE_MEMBER_FAILURE_REASON}:`) ||
    message.startsWith('OpenCode secondary lane timing:') ||
    message.startsWith(
      'OpenCode bridge reported ready without all required durable checkpoints:'
    ) ||
    message.startsWith(
      'OpenCode bridge reported ready before all expected members were confirmed:'
    ) ||
    message.startsWith(
      'OpenCode bootstrap MCP did not complete required tools before assistant response:'
    ) ||
    isOpenCodeLaunchTimingDiagnostic(message)
  );
}

function extractCheckpointNames(data: OpenCodeLaunchTeamCommandData): Set<string> {
  const names = new Set<string>();
  for (const checkpoint of data.durableCheckpoints ?? []) {
    if (checkpoint.name.trim()) names.add(checkpoint.name);
  }
  for (const member of Object.values(data.members)) {
    for (const evidence of member.evidence) {
      if (evidence.kind.trim()) names.add(evidence.kind);
    }
  }
  return names;
}

function buildMemberBootstrapPrompt(
  input: TeamRuntimeLaunchInput,
  member: TeamRuntimeLaunchInput['expectedMembers'][number]
): string {
  const teamPrompt = input.prompt?.trim();
  const role = member.role?.trim() || member.workflow?.trim() || 'teammate';
  const workflow = member.workflow?.trim();
  return [
    `You are ${member.name}, a ${role} on team "${input.teamName}".`,
    teamPrompt ? `Team launch context:\n${teamPrompt}` : null,
    workflow ? `Workflow:\n${workflow}` : null,
    '',
    'This OpenCode session is already attached by the desktop app. Do NOT create local team files, run join scripts, or search the project for a fake team registry.',
    'Use the app MCP tools exposed by the "agent-teams" server for team communication and task state.',
    'The desktop bridge may prepend runtime identity and bootstrap instructions. Follow those first.',
    'After runtime identity check-in, if you have not already done so, call MCP tool agent-teams_member_briefing (or mcp__agent-teams__member_briefing if that is the exposed name) with:',
    `{ "teamName": "${input.teamName}", "memberName": "${member.name}", "runtimeProvider": "opencode" }`,
    'If that tool is not available, stay idle and wait for app-delivered instructions. Do not improvise a replacement workflow.',
    'Launch bootstrap is a silent attach, not a user/team conversation turn.',
    'After runtime_bootstrap_checkin and member_briefing both succeed, stop this turn immediately and wait for app-delivered messages or actionable task assignments.',
    'Do not call task_briefing, message_send, or cross_team_send just to announce readiness, say understood, report no tasks, or ask for work.',
    'If the briefing says there are no actionable tasks, stay idle silently.',
    '',
    'When you need to message the human user, team lead, or another teammate, call MCP tool agent-teams_message_send (or mcp__agent-teams__message_send) with teamName, to, from, text, and optional summary.',
    `Always set from="${member.name}" when sending a team message from this OpenCode teammate.`,
    'Do not answer team/app messages only as plain assistant text when agent-teams_message_send is available.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function buildOpenCodeRuntimeMessageText(input: OpenCodeTeamRuntimeMessageInput): string {
  if (input.bootstrapCheckinRetry) {
    const runtimeSessionId = input.bootstrapCheckinRetry.runtimeSessionId.trim();
    return [
      '<opencode_runtime_bootstrap_checkin_retry>',
      'The desktop app detected that this OpenCode session exists, but runtime_bootstrap_checkin has not committed durable runtime evidence yet.',
      input.bootstrapCheckinRetry.reason
        ? `Reason: ${input.bootstrapCheckinRetry.reason.trim()}`
        : null,
      'Before any other tool or message, call MCP tool agent-teams_runtime_bootstrap_checkin or mcp__agent-teams__runtime_bootstrap_checkin with exactly:',
      JSON.stringify({
        runId: input.runId,
        teamName: input.teamName,
        memberName: input.memberName,
        runtimeSessionId,
      }),
      'Do not call member_briefing, task tools, message_send, or cross_team_send before runtime_bootstrap_checkin completes.',
      'After runtime_bootstrap_checkin succeeds, stop this turn immediately and wait silently.',
      'If runtime_bootstrap_checkin is unavailable or fails, reply with one short sentence containing the exact error text, then stop.',
      '</opencode_runtime_bootstrap_checkin_retry>',
    ]
      .filter((line): line is string => line !== null)
      .join('\n');
  }

  const replyRecipient = input.replyRecipient?.trim() || 'user';
  const deliveryContext =
    input.messageId && input.taskRefs?.length
      ? JSON.stringify({
          schemaVersion: 1,
          kind: 'opencode-delivery-context',
          teamName: input.teamName,
          laneId: input.laneId,
          memberName: input.memberName,
          inboundMessageId: input.messageId,
          taskRefs: input.taskRefs,
        })
      : null;

  return [
    '<opencode_app_message_delivery>',
    deliveryContext
      ? `<opencode_delivery_context>${deliveryContext}</opencode_delivery_context>`
      : null,
    'You are running in OpenCode, not Claude Code or Codex native.',
    'To make your reply visible in the app Messages UI, call MCP tool agent-teams_message_send (or mcp__agent-teams__message_send if that is the exposed name).',
    `Use teamName="${input.teamName}", to="${replyRecipient}", from="${input.memberName}", text, and summary.`,
    'Include source="runtime_delivery" in that message_send call.',
    input.messageId
      ? `Include relayOfMessageId="${input.messageId}" in that message_send call.`
      : null,
    'Do not call runtime_bootstrap_checkin or member_briefing just to answer this delivered app message.',
    'Do not answer only with plain assistant text when agent-teams_message_send is available.',
    'Do not use SendMessage or runtime_deliver_message for ordinary visible replies.',
    'Do not invent placeholder task labels. If no explicit taskRefs are provided and the reply is not about a real board task, do not prefix text or summary with a # task label; never use #00000000.',
    'The inbound app message follows. Treat it as the actual instruction to process now, not as background context.',
    'If the inbound message asks for exact reply text, use that exact text. Do not replace concrete instructions with a generic greeting or availability message.',
    input.actionMode ? `Action mode for this message: ${input.actionMode}.` : null,
    '</opencode_app_message_delivery>',
    '',
    '<opencode_inbound_app_message>',
    input.text,
    '</opencode_inbound_app_message>',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function validateOpenCodeRuntimeMembers(
  members: TeamRuntimeLaunchInput['expectedMembers'],
  launchCwd?: string
): string[] {
  if (members.length === 0) {
    return ['OpenCode runtime adapter requires at least one expected OpenCode member.'];
  }

  const diagnostics = members.flatMap((member, index) => {
    const name = member.name.trim() || `<index ${index}>`;
    if (member.providerId === 'opencode') {
      return [];
    }
    return [
      `OpenCode runtime adapter received non-OpenCode member "${name}" with provider "${member.providerId}".`,
    ];
  });
  const memberCwds = [
    ...new Set(members.map((member) => member.cwd.trim()).filter((cwd) => cwd.length > 0)),
  ];
  if (memberCwds.length > 1) {
    diagnostics.push(
      'OpenCode runtime adapter currently supports one project path per lane. Launch isolated OpenCode teammates as separate side lanes.'
    );
  }
  const onlyMemberCwd = memberCwds.length === 1 ? memberCwds[0] : null;
  if (launchCwd?.trim() && onlyMemberCwd && onlyMemberCwd !== launchCwd.trim()) {
    diagnostics.push(
      `OpenCode runtime lane cwd mismatch: launch cwd "${launchCwd.trim()}" differs from member cwd "${onlyMemberCwd}".`
    );
  }
  return diagnostics;
}

function formatOpenCodeBridgeDiagnostic(diagnostic: {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
}): string {
  return `${diagnostic.severity}:${diagnostic.code}: ${diagnostic.message}`;
}

function isOpenCodeLaunchTimingDiagnostic(diagnostic: string): boolean {
  return (
    diagnostic.startsWith('info:opencode_launch_member_timing:') ||
    diagnostic.startsWith('info:opencode_launch_total_timing:')
  );
}

function blockedLaunchResult(
  input: TeamRuntimeLaunchInput,
  reason: string,
  diagnostics: string[],
  warnings: string[] = []
): TeamRuntimeLaunchResult {
  const hardFailureReason =
    reason === 'unknown_error' && diagnostics[0]?.trim() ? diagnostics[0].trim() : reason;
  const members = Object.fromEntries(
    input.expectedMembers.map((member) => [
      member.name,
      {
        memberName: member.name,
        providerId: 'opencode' as const,
        launchState: 'failed_to_start' as const,
        agentToolAccepted: false,
        runtimeAlive: false,
        bootstrapConfirmed: false,
        hardFailure: true,
        hardFailureReason,
        diagnostics,
      },
    ])
  );

  return {
    runId: input.runId,
    teamName: input.teamName,
    launchPhase: 'finished',
    teamLaunchState: 'partial_failure',
    members,
    warnings,
    diagnostics,
  };
}

function isRetryableReadinessState(state: OpenCodeTeamLaunchReadiness['state']): boolean {
  return (
    state === 'not_installed' ||
    state === 'not_authenticated' ||
    state === 'runtime_store_blocked' ||
    state === 'mcp_unavailable' ||
    state === 'model_unavailable' ||
    state === 'unknown_error'
  );
}

function mergeDiagnostics(left: string[], right: string[]): string[] {
  return [...new Set([...left, ...right].filter((value) => value.trim().length > 0))];
}
