import * as path from 'path';

import { VersionedJsonStore } from '../store/VersionedJsonStore';

import {
  isOpenCodeProductionE2EEvidenceCollection,
  OPENCODE_PRODUCTION_E2E_EVIDENCE_SCHEMA_VERSION,
  type OpenCodeProductionE2EEvidence,
  type OpenCodeProductionE2EEvidenceCollection,
  type OpenCodeProductionE2EEvidenceStoreData,
  validateOpenCodeProductionE2EEvidence,
  validateOpenCodeProductionE2EEvidenceStoreData,
} from './OpenCodeProductionE2EEvidence';

export interface OpenCodeProductionE2EEvidenceStoreReadResult {
  ok: boolean;
  evidence: OpenCodeProductionE2EEvidence | null;
  artifactPath: string;
  diagnostics: string[];
}

export interface OpenCodeProductionE2EEvidenceStoreOptions {
  filePath: string;
  clock?: () => Date;
}

export interface OpenCodeProductionE2EEvidenceStoreReadOptions {
  selectedModel?: string | null;
  projectPathFingerprint?: string | null;
}

export class OpenCodeProductionE2EEvidenceStore {
  private readonly filePath: string;
  private readonly store: VersionedJsonStore<OpenCodeProductionE2EEvidenceStoreData>;

  constructor(options: OpenCodeProductionE2EEvidenceStoreOptions) {
    this.filePath = options.filePath;
    this.store = new VersionedJsonStore<OpenCodeProductionE2EEvidenceStoreData>({
      filePath: options.filePath,
      schemaVersion: OPENCODE_PRODUCTION_E2E_EVIDENCE_SCHEMA_VERSION,
      defaultData: () => null,
      validate: validateOpenCodeProductionE2EEvidenceStoreData,
      clock: options.clock,
      quarantineDir: path.dirname(options.filePath),
    });
  }

  async read(
    options: OpenCodeProductionE2EEvidenceStoreReadOptions = {}
  ): Promise<OpenCodeProductionE2EEvidenceStoreReadResult> {
    const result = await this.store.read();
    if (!result.ok) {
      return {
        ok: false,
        evidence: null,
        artifactPath: this.filePath,
        diagnostics: [
          `OpenCode production E2E evidence store is unreadable: ${result.message}`,
          ...(result.quarantinePath
            ? [`Quarantined corrupt evidence at ${result.quarantinePath}`]
            : []),
        ],
      };
    }

    const selection = selectEvidence(result.data, options);
    return {
      ok: true,
      evidence: selection.evidence,
      artifactPath: this.filePath,
      diagnostics: [
        ...selection.diagnostics,
        ...(result.status === 'missing'
          ? ['OpenCode production E2E evidence artifact has not been written yet']
          : []),
      ],
    };
  }

  async write(evidence: OpenCodeProductionE2EEvidence): Promise<void> {
    const validated = validateOpenCodeProductionE2EEvidence(evidence);
    await this.store.updateLocked((current) => {
      const nextEvidence = {
        ...validated,
        artifactPath: validated.artifactPath ?? this.filePath,
      };
      return upsertEvidence(current, nextEvidence);
    });
  }
}

function selectEvidence(
  data: OpenCodeProductionE2EEvidenceStoreData,
  options: OpenCodeProductionE2EEvidenceStoreReadOptions
): {
  evidence: OpenCodeProductionE2EEvidence | null;
  diagnostics: string[];
} {
  if (!data) {
    return { evidence: null, diagnostics: [] };
  }

  if (!isOpenCodeProductionE2EEvidenceCollection(data)) {
    return { evidence: data, diagnostics: [] };
  }

  const modelId = options.selectedModel?.trim() ?? '';
  const projectPathFingerprint = options.projectPathFingerprint?.trim() ?? '';
  if (modelId) {
    const entries = Object.values(data.entriesByModel).filter(
      (entry) => entry.selectedModel === modelId
    );
    if (entries.length === 0) {
      return {
        evidence: null,
        diagnostics: [
          `OpenCode production E2E evidence artifact has no entry for selected model ${modelId}`,
        ],
      };
    }

    if (projectPathFingerprint) {
      const exactMatch = pickNewestEvidence(
        entries.filter((entry) => entry.projectPathFingerprint === projectPathFingerprint)
      );
      if (exactMatch) {
        return {
          evidence: exactMatch,
          diagnostics: [],
        };
      }

      return {
        evidence: null,
        diagnostics: [
          `OpenCode production E2E evidence artifact has no entry for selected model ${modelId} and the current working directory`,
        ],
      };
    }

    return {
      evidence: pickNewestEvidence(entries),
      diagnostics: [],
    };
  }

  const entries = Object.values(data.entriesByModel);
  if (entries.length === 1) {
    return { evidence: entries[0] ?? null, diagnostics: [] };
  }

  return {
    evidence: null,
    diagnostics:
      entries.length === 0
        ? ['OpenCode production E2E evidence artifact has no model entries']
        : [
            `OpenCode production E2E evidence artifact contains ${entries.length} model entries; selected model is required`,
          ],
  };
}

function upsertEvidence(
  current: OpenCodeProductionE2EEvidenceStoreData,
  evidence: OpenCodeProductionE2EEvidence
): OpenCodeProductionE2EEvidenceCollection {
  const entriesByModel: Record<string, OpenCodeProductionE2EEvidence> = {};
  if (isOpenCodeProductionE2EEvidenceCollection(current)) {
    Object.assign(entriesByModel, current.entriesByModel);
  } else if (current) {
    entriesByModel[current.selectedModel] = current;
  }

  entriesByModel[buildEvidenceKey(evidence)] = evidence;
  return {
    collectionSchemaVersion: 1,
    entriesByModel,
  };
}

function buildEvidenceKey(evidence: OpenCodeProductionE2EEvidence): string {
  return [evidence.selectedModel, evidence.projectPathFingerprint ?? 'global'].join('::');
}

function pickNewestEvidence(
  entries: OpenCodeProductionE2EEvidence[]
): OpenCodeProductionE2EEvidence | null {
  if (entries.length === 0) {
    return null;
  }

  return entries.slice(1).reduce<OpenCodeProductionE2EEvidence>((latest, entry) => {
    const latestAt = Date.parse(latest.createdAt);
    const entryAt = Date.parse(entry.createdAt);
    if (!Number.isFinite(entryAt)) {
      return latest;
    }
    if (!Number.isFinite(latestAt) || entryAt >= latestAt) {
      return entry;
    }
    return latest;
  }, entries[0]!);
}
