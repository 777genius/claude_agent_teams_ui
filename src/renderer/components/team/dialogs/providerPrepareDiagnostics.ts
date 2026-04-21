import { getProviderScopedTeamModelLabel } from '@renderer/utils/teamModelCatalog';
import { isDefaultProviderModelSelection } from '@shared/utils/providerModelSelection';

import type { TeamProviderId, TeamProvisioningPrepareResult } from '@shared/types';

export type ProviderPrepareCheckStatus = 'ready' | 'notes' | 'failed';

type PrepareProvisioningFn = (
  cwd?: string,
  providerId?: TeamProviderId,
  providerIds?: TeamProviderId[],
  selectedModels?: string[],
  limitContext?: boolean
) => Promise<TeamProvisioningPrepareResult>;

interface ProviderPrepareDiagnosticsProgress {
  details: string[];
  completedCount: number;
  totalCount: number;
}

export interface ProviderPrepareDiagnosticsModelResult {
  status: 'ready' | 'notes' | 'failed';
  line: string;
  warningLine?: string | null;
}

export interface ProviderPrepareDiagnosticsCachedSnapshot {
  status: ProviderPrepareCheckStatus | 'checking';
  details: string[];
  completedCount: number;
  totalCount: number;
}

export interface ProviderPrepareDiagnosticsResult {
  status: ProviderPrepareCheckStatus;
  details: string[];
  warnings: string[];
  modelResultsById: Record<string, ProviderPrepareDiagnosticsModelResult>;
}

export function buildReusableProviderPrepareModelResults(
  modelResultsById: Record<string, ProviderPrepareDiagnosticsModelResult>
): Record<string, ProviderPrepareDiagnosticsModelResult> {
  return Object.fromEntries(
    Object.entries(modelResultsById).filter(([, result]) => result.status !== 'notes')
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getModelLabel(providerId: TeamProviderId, modelId: string): string {
  if (isDefaultProviderModelSelection(modelId)) {
    return 'Default';
  }
  return getProviderScopedTeamModelLabel(providerId, modelId) ?? modelId;
}

export function buildProviderPrepareModelCheckingLine(
  providerId: TeamProviderId,
  modelId: string
): string {
  return `${getModelLabel(providerId, modelId)} - checking...`;
}

function buildModelSuccessLine(providerId: TeamProviderId, modelId: string): string {
  return `${getModelLabel(providerId, modelId)} - verified`;
}

export function getProviderPrepareCachedSnapshot({
  providerId,
  selectedModelIds,
  cachedModelResultsById,
}: {
  providerId: TeamProviderId;
  selectedModelIds: string[];
  cachedModelResultsById?: Record<string, ProviderPrepareDiagnosticsModelResult>;
}): ProviderPrepareDiagnosticsCachedSnapshot {
  const reusableModelResultsById = cachedModelResultsById ?? {};
  const orderedModelIds = Array.from(
    new Set(selectedModelIds.map((modelId) => modelId.trim()).filter(Boolean))
  );

  let completedCount = 0;
  let hasFailure = false;
  let hasNotes = false;
  let hasChecking = false;

  const details = orderedModelIds.map((modelId) => {
    const cachedResult = reusableModelResultsById[modelId];
    if (!cachedResult) {
      hasChecking = true;
      return buildProviderPrepareModelCheckingLine(providerId, modelId);
    }

    completedCount += 1;
    if (cachedResult.status === 'failed') {
      hasFailure = true;
    } else if (cachedResult.status === 'notes') {
      hasNotes = true;
    }
    return cachedResult.line;
  });

  return {
    status: hasChecking ? 'checking' : hasFailure ? 'failed' : hasNotes ? 'notes' : 'ready',
    details,
    completedCount,
    totalCount: orderedModelIds.length,
  };
}

function stripSelectedModelPrefix(modelId: string, message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return trimmed;
  }

  const patterns = [
    new RegExp(`^Selected model ${escapeRegExp(modelId)} is unavailable\\.\\s*`, 'i'),
    new RegExp(`^Selected model ${escapeRegExp(modelId)} could not be verified\\.\\s*`, 'i'),
    new RegExp(`^Selected model ${escapeRegExp(modelId)} verified for launch\\.\\s*`, 'i'),
  ];
  for (const pattern of patterns) {
    if (pattern.test(trimmed)) {
      return trimmed.replace(pattern, '').trim();
    }
  }

  return trimmed;
}

function decodeQuotedJsonString(value: string): string {
  try {
    return JSON.parse(`"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`) as string;
  } catch {
    return value;
  }
}

function normalizeModelReason(rawReason: string | null | undefined): string | null {
  const trimmed = rawReason?.trim() ?? '';
  if (!trimmed) {
    return null;
  }

  if (
    /The '[^']+' model is not supported when using Codex with a ChatGPT account\./i.test(trimmed)
  ) {
    return 'Not available on this Codex native runtime';
  }
  if (/The requested model is not available for your account\./i.test(trimmed)) {
    return 'Not available for this account';
  }
  if (/token refresh failed:\s*401/i.test(trimmed)) {
    return 'OpenCode provider authentication failed (token refresh 401)';
  }
  if (/unauthorized|forbidden|\b401\b|\b403\b/i.test(trimmed)) {
    return 'OpenCode provider authentication failed';
  }
  if (
    trimmed.toLowerCase().includes('timeout running:') ||
    trimmed.toLowerCase().includes('timed out') ||
    trimmed.toLowerCase().includes('etimedout')
  ) {
    return 'Model verification timed out';
  }

  const detailMatch = /"detail":"((?:\\"|[^"])*)"/i.exec(trimmed);
  if (detailMatch?.[1]) {
    return normalizeModelReason(detailMatch[1].replace(/\\"/g, '"').trim());
  }

  const messageMatch = /"message":"((?:\\"|[^"])*)"/i.exec(trimmed);
  if (messageMatch?.[1]) {
    const decodedMessage = messageMatch[1].replace(/\\"/g, '"');
    const nestedDetailMatch = /"detail":"([^"]+)"/i.exec(decodedMessage);
    if (nestedDetailMatch?.[1]) {
      return normalizeModelReason(nestedDetailMatch[1].trim());
    }
    return normalizeModelReason(decodeQuotedJsonString(decodedMessage).trim());
  }

  return trimmed;
}

function getResultReason(modelId: string, result: TeamProvisioningPrepareResult): string | null {
  const candidates = [...(result.details ?? []), ...(result.warnings ?? []), result.message]
    .map((entry) => entry?.trim() ?? '')
    .filter(Boolean);

  for (const candidate of candidates) {
    const stripped = stripSelectedModelPrefix(modelId, candidate);
    if (stripped) {
      return normalizeModelReason(stripped);
    }
  }

  return null;
}

function getModelScopedEntries(modelId: string, result: TeamProvisioningPrepareResult): string[] {
  const escapedModelId = escapeRegExp(modelId);
  const scopedPattern = new RegExp(`^Selected model ${escapedModelId}\\b`, 'i');
  return [...(result.details ?? []), ...(result.warnings ?? []), result.message]
    .map((entry) => entry?.trim() ?? '')
    .filter(Boolean)
    .filter((entry) => scopedPattern.test(entry));
}

function getScopedModelReason(modelId: string, entries: string[]): string | null {
  for (const entry of entries) {
    const stripped = stripSelectedModelPrefix(modelId, entry);
    if (!stripped) {
      continue;
    }
    const normalized = normalizeModelReason(stripped);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function buildModelFailureLine(
  providerId: TeamProviderId,
  modelId: string,
  kind: 'unavailable' | 'check failed',
  reason: string | null
): string {
  const label = getModelLabel(providerId, modelId);
  return reason ? `${label} - ${kind} - ${reason}` : `${label} - ${kind}`;
}

function createRuntimeDetailLines(result: TeamProvisioningPrepareResult): string[] {
  return [...(result.details ?? []), ...(result.warnings ?? [])];
}

function extractTimedOutPreflightProbeModelId(detail: string): string | null {
  const trimmed = detail.trim();
  if (!trimmed) {
    return null;
  }
  if (
    !trimmed.toLowerCase().includes('preflight check for `') ||
    !trimmed.toLowerCase().includes('-p` did not complete')
  ) {
    return null;
  }
  const match = /--model\s+([^\s]+)/i.exec(trimmed);
  return match?.[1]?.trim() || null;
}

function isSuppressibleGenericPreflightWarning(detail: string): boolean {
  const lower = detail.trim().toLowerCase();
  if (!lower) {
    return false;
  }

  return (
    lower.includes('preflight check failed') ||
    (lower.includes('preflight check for `') && lower.includes('-p` did not complete')) ||
    lower.includes('preflight ping completed but did not return the expected pong')
  );
}

function suppressSupersededRuntimeWarnings(params: {
  runtimeDetailLines: string[];
  runtimeWarnings: string[];
  modelResultsById: Map<string, ProviderPrepareDiagnosticsModelResult>;
}): {
  runtimeDetailLines: string[];
  runtimeWarnings: string[];
} {
  const suppressedEntries = new Set<string>();
  const allSelectedModelsReady =
    params.modelResultsById.size > 0 &&
    Array.from(params.modelResultsById.values()).every((result) => result.status === 'ready');

  for (const warning of params.runtimeWarnings) {
    const probedModelId = extractTimedOutPreflightProbeModelId(warning);
    if (probedModelId) {
      if (params.modelResultsById.get(probedModelId)?.status !== 'ready') {
        continue;
      }
      suppressedEntries.add(warning);
      continue;
    }

    if (allSelectedModelsReady && isSuppressibleGenericPreflightWarning(warning)) {
      suppressedEntries.add(warning);
    }
  }

  return {
    runtimeDetailLines: params.runtimeDetailLines.filter(
      (detail) => !suppressedEntries.has(detail)
    ),
    runtimeWarnings: params.runtimeWarnings.filter((warning) => !suppressedEntries.has(warning)),
  };
}

function resolveModelResultFromBatch(
  providerId: TeamProviderId,
  modelId: string,
  result: TeamProvisioningPrepareResult,
  isOnlyModel: boolean
): ProviderPrepareDiagnosticsModelResult {
  const modelScopedEntries = getModelScopedEntries(modelId, result);
  const hasModelScopedEntries = modelScopedEntries.length > 0;
  const scopedReason = getScopedModelReason(modelId, modelScopedEntries);
  const fallbackBatchReason = isOnlyModel
    ? (getResultReason(modelId, result) ?? normalizeModelReason(result.message))
    : null;

  const hasVerifiedLine = modelScopedEntries.some((entry) =>
    /selected model .* verified for launch\./i.test(entry)
  );
  if (hasVerifiedLine) {
    return {
      status: 'ready',
      line: buildModelSuccessLine(providerId, modelId),
      warningLine: null,
    };
  }

  const hasUnavailableLine = modelScopedEntries.some((entry) =>
    /selected model .* is unavailable\./i.test(entry)
  );
  if (hasUnavailableLine || (!result.ready && isOnlyModel)) {
    return {
      status: 'failed',
      line: buildModelFailureLine(
        providerId,
        modelId,
        'unavailable',
        scopedReason ?? fallbackBatchReason
      ),
      warningLine: null,
    };
  }

  const hasVerificationWarningLine = modelScopedEntries.some((entry) =>
    /selected model .* could not be verified\./i.test(entry)
  );
  if (
    hasVerificationWarningLine ||
    ((result.warnings?.length ?? 0) > 0 && isOnlyModel && hasModelScopedEntries)
  ) {
    const line = buildModelFailureLine(providerId, modelId, 'check failed', scopedReason);
    return {
      status: 'notes',
      line,
      warningLine: line,
    };
  }

  if (result.ready) {
    return {
      status: 'ready',
      line: buildModelSuccessLine(providerId, modelId),
      warningLine: null,
    };
  }

  const line = buildModelFailureLine(
    providerId,
    modelId,
    'check failed',
    scopedReason ?? 'Model verification failed'
  );
  return {
    status: 'notes',
    line,
    warningLine: line,
  };
}

export async function runProviderPrepareDiagnostics({
  cwd,
  providerId,
  selectedModelIds,
  prepareProvisioning,
  limitContext,
  onModelProgress,
  cachedModelResultsById,
}: {
  cwd: string;
  providerId: TeamProviderId;
  selectedModelIds: string[];
  prepareProvisioning: PrepareProvisioningFn;
  limitContext?: boolean;
  onModelProgress?: (progress: ProviderPrepareDiagnosticsProgress) => void;
  cachedModelResultsById?: Record<string, ProviderPrepareDiagnosticsModelResult>;
}): Promise<ProviderPrepareDiagnosticsResult> {
  const runtimeResult = await prepareProvisioning(
    cwd,
    providerId,
    [providerId],
    undefined,
    limitContext
  );
  const runtimeDetailLines = createRuntimeDetailLines(runtimeResult);
  const runtimeWarnings = [...(runtimeResult.warnings ?? [])];

  if (!runtimeResult.ready) {
    return {
      status: 'failed',
      details: [...runtimeDetailLines, ...(runtimeResult.message ? [runtimeResult.message] : [])],
      warnings: runtimeWarnings,
      modelResultsById: {},
    };
  }

  if (selectedModelIds.length === 0) {
    return {
      status: runtimeWarnings.length > 0 ? 'notes' : 'ready',
      details: runtimeDetailLines,
      warnings: runtimeWarnings,
      modelResultsById: {},
    };
  }

  const orderedModelIds = Array.from(
    new Set(selectedModelIds.map((modelId) => modelId.trim()).filter(Boolean))
  );
  const reusableModelResultsById = cachedModelResultsById ?? {};
  const modelResultsById = new Map<string, ProviderPrepareDiagnosticsModelResult>();
  const modelLines = new Map<string, string>();
  let completedCount = 0;
  let hasFailure = false;
  let hasNotes = false;
  const modelWarnings: string[] = [];

  for (const modelId of orderedModelIds) {
    const cachedResult = reusableModelResultsById[modelId];
    if (cachedResult) {
      modelResultsById.set(modelId, cachedResult);
      modelLines.set(modelId, cachedResult.line);
      completedCount += 1;
      if (cachedResult.status === 'failed') {
        hasFailure = true;
      } else if (cachedResult.status === 'notes') {
        hasNotes = true;
      }
      if (cachedResult.warningLine) {
        modelWarnings.push(cachedResult.warningLine);
      }
      continue;
    }
    modelLines.set(modelId, buildProviderPrepareModelCheckingLine(providerId, modelId));
  }

  const emitProgress = (): void => {
    onModelProgress?.({
      details: [
        ...runtimeDetailLines,
        ...orderedModelIds.map((modelId) => modelLines.get(modelId) ?? ''),
      ],
      completedCount,
      totalCount: orderedModelIds.length,
    });
  };

  emitProgress();

  const uncachedModelIds = orderedModelIds.filter((modelId) => !modelResultsById.has(modelId));
  if (uncachedModelIds.length > 0) {
    try {
      const batchedModelResult = await prepareProvisioning(
        cwd,
        providerId,
        [providerId],
        uncachedModelIds,
        limitContext
      );

      for (const modelId of uncachedModelIds) {
        const resolvedResult = resolveModelResultFromBatch(
          providerId,
          modelId,
          batchedModelResult,
          uncachedModelIds.length === 1
        );
        modelLines.set(modelId, resolvedResult.line);
        modelResultsById.set(modelId, resolvedResult);
        if (resolvedResult.status === 'failed') {
          hasFailure = true;
        } else if (resolvedResult.status === 'notes') {
          hasNotes = true;
        }
        if (resolvedResult.warningLine) {
          modelWarnings.push(resolvedResult.warningLine);
        }
      }
    } catch (error) {
      hasNotes = true;
      const reason = normalizeModelReason(
        error instanceof Error ? error.message.trim() : String(error).trim()
      );
      for (const modelId of uncachedModelIds) {
        const line = buildModelFailureLine(providerId, modelId, 'check failed', reason || null);
        modelLines.set(modelId, line);
        modelWarnings.push(line);
        modelResultsById.set(modelId, {
          status: 'notes',
          line,
          warningLine: line,
        });
      }
    } finally {
      completedCount += uncachedModelIds.length;
      emitProgress();
    }
  }

  const filteredRuntime = suppressSupersededRuntimeWarnings({
    runtimeDetailLines,
    runtimeWarnings,
    modelResultsById,
  });
  const dedupedWarnings = Array.from(
    new Set([...filteredRuntime.runtimeWarnings, ...modelWarnings])
  );
  const selectedModelResultsById = Object.fromEntries(
    orderedModelIds
      .map((modelId) => [modelId, modelResultsById.get(modelId)] as const)
      .filter((entry): entry is [string, ProviderPrepareDiagnosticsModelResult] =>
        Boolean(entry[1])
      )
  );

  return {
    status: hasFailure ? 'failed' : hasNotes || dedupedWarnings.length > 0 ? 'notes' : 'ready',
    details: [
      ...filteredRuntime.runtimeDetailLines,
      ...orderedModelIds.map((modelId) => modelLines.get(modelId) ?? ''),
    ],
    warnings: dedupedWarnings,
    modelResultsById: selectedModelResultsById,
  };
}
