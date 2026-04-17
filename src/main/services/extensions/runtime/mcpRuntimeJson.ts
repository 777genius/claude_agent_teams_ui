import { isInstalledMcpScope } from '@shared/utils/mcpScopes';

import type { InstalledMcpEntry } from '@shared/types/extensions';

interface McpListJsonServer {
  name?: string;
  scope?: string;
  transport?: string;
}

interface McpListJsonPayload {
  servers?: McpListJsonServer[];
}

function extractJsonObject<T>(raw: string): T {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    }
    throw new Error('No JSON object found in CLI output');
  }
}

export function parseInstalledMcpJsonOutput(output: string): InstalledMcpEntry[] {
  const parsed = extractJsonObject<McpListJsonPayload>(output);

  return (parsed.servers ?? []).flatMap<InstalledMcpEntry>((entry) => {
    if (typeof entry.name !== 'string' || !isInstalledMcpScope(entry.scope)) {
      return [];
    }

    return [
      {
        name: entry.name,
        scope: entry.scope,
        transport: typeof entry.transport === 'string' ? entry.transport : undefined,
      },
    ];
  });
}
