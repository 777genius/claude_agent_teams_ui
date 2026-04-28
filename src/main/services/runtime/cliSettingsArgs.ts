type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonSettingsObject(raw: string): JsonObject | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isJsonObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function deepMergeJsonObjects(target: JsonObject, source: JsonObject): JsonObject {
  const merged: JsonObject = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const current = merged[key];
    if (isJsonObject(current) && isJsonObject(value)) {
      merged[key] = deepMergeJsonObjects(current, value);
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

/**
 * Native multimodel launches may receive app settings and provider settings as
 * separate --settings JSON values. Some runtimes read only the first one, so
 * collapse parseable JSON settings into one object before spawn.
 */
export function mergeJsonSettingsArgs(args: string[]): string[] {
  let mergedSettings: JsonObject | null = null;
  let firstSettingsIndex: number | null = null;
  const output: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--settings') {
      const value = args[i + 1];
      if (typeof value === 'string') {
        const parsed = parseJsonSettingsObject(value);
        if (parsed) {
          if (firstSettingsIndex === null) {
            firstSettingsIndex = output.length;
          }
          mergedSettings = deepMergeJsonObjects(mergedSettings ?? {}, parsed);
          i += 2;
          continue;
        }
      }
      output.push(arg);
      i += 1;
      continue;
    }

    const settingsPrefix = '--settings=';
    if (arg.startsWith(settingsPrefix)) {
      const parsed = parseJsonSettingsObject(arg.slice(settingsPrefix.length));
      if (parsed) {
        if (firstSettingsIndex === null) {
          firstSettingsIndex = output.length;
        }
        mergedSettings = deepMergeJsonObjects(mergedSettings ?? {}, parsed);
        i += 1;
        continue;
      }
    }

    output.push(arg);
    i += 1;
  }

  if (firstSettingsIndex !== null && mergedSettings) {
    output.splice(firstSettingsIndex, 0, '--settings', JSON.stringify(mergedSettings));
  }

  return output;
}
