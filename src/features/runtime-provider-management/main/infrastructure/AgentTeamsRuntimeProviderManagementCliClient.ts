import { buildProviderAwareCliEnv } from '@main/services/runtime/providerAwareCliEnv';
import { ClaudeBinaryResolver } from '@main/services/team/ClaudeBinaryResolver';
import { execCli, killProcessTree, spawnCli } from '@main/utils/childProcess';
import { resolveInteractiveShellEnv } from '@main/utils/shellEnv';

import type {
  RuntimeProviderManagementApi,
  RuntimeProviderManagementConnectApiKeyInput,
  RuntimeProviderManagementErrorDto,
  RuntimeProviderManagementForgetInput,
  RuntimeProviderManagementLoadModelsInput,
  RuntimeProviderManagementLoadViewInput,
  RuntimeProviderManagementModelsResponse,
  RuntimeProviderManagementModelTestResponse,
  RuntimeProviderManagementProviderResponse,
  RuntimeProviderManagementRuntimeId,
  RuntimeProviderManagementSetDefaultModelInput,
  RuntimeProviderManagementTestModelInput,
  RuntimeProviderManagementViewResponse,
} from '@features/runtime-provider-management/contracts';
import type { ChildProcessWithoutNullStreams } from 'child_process';

const COMMAND_TIMEOUT_MS = 45_000;
const PROBE_COMMAND_TIMEOUT_MS = 90_000;
const COMMAND_ERROR_DETAIL_LIMIT = 1_600;

type RuntimeProviderManagementErrorResponse =
  | RuntimeProviderManagementViewResponse
  | RuntimeProviderManagementProviderResponse
  | RuntimeProviderManagementModelsResponse
  | RuntimeProviderManagementModelTestResponse;

function errorResponse<T extends RuntimeProviderManagementErrorResponse>(
  runtimeId: RuntimeProviderManagementRuntimeId,
  message: string,
  code: RuntimeProviderManagementErrorDto['code'] = 'runtime-unhealthy'
): T {
  return {
    schemaVersion: 1,
    runtimeId,
    error: {
      code,
      message,
      recoverable: true,
    },
  } as T;
}

function extractJsonObject<T>(raw: string): T {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('CLI did not return a JSON object');
  }
  return JSON.parse(raw.slice(start, end + 1)) as T;
}

function tryExtractJsonObject<T>(raw: string | null): T | null {
  if (!raw) {
    return null;
  }
  try {
    return extractJsonObject<T>(raw);
  } catch {
    return null;
  }
}

function readErrorTextProperty(error: unknown, propertyName: 'stderr' | 'stdout'): string | null {
  if (!error || typeof error !== 'object' || !(propertyName in error)) {
    return null;
  }
  const value = (error as Record<string, unknown>)[propertyName];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function extractJsonObjectFromError<T>(error: unknown): T | null {
  return (
    tryExtractJsonObject<T>(readErrorTextProperty(error, 'stdout')) ??
    tryExtractJsonObject<T>(readErrorTextProperty(error, 'stderr'))
  );
}

function truncateCommandErrorDetail(message: string): string {
  if (message.length <= COMMAND_ERROR_DETAIL_LIMIT) {
    return message;
  }
  return `${message.slice(0, COMMAND_ERROR_DETAIL_LIMIT).trimEnd()}...`;
}

function normalizeCommandFailure(error: unknown): string {
  const stderr = readErrorTextProperty(error, 'stderr');
  if (stderr) {
    return truncateCommandErrorDetail(stderr);
  }
  const stdout = readErrorTextProperty(error, 'stdout');
  if (stdout) {
    return truncateCommandErrorDetail(stdout);
  }
  if (error instanceof Error && error.message.trim()) {
    return truncateCommandErrorDetail(error.message);
  }
  return 'Runtime provider management command failed';
}

async function resolveCliEnv(): Promise<{
  binaryPath: string | null;
  env: NodeJS.ProcessEnv;
}> {
  const shellEnv = await resolveInteractiveShellEnv();
  const binaryPath = await ClaudeBinaryResolver.resolve();
  if (!binaryPath) {
    return {
      binaryPath: null,
      env: {
        ...process.env,
        ...shellEnv,
      },
    };
  }

  const providerAware = await buildProviderAwareCliEnv({
    binaryPath,
    providerId: 'opencode',
    shellEnv,
    connectionMode: 'augment',
  });
  return {
    binaryPath,
    env: providerAware.env,
  };
}

function collectSpawnOutput(
  child: ChildProcessWithoutNullStreams,
  stdinValue: string
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      killProcessTree(child, 'SIGKILL');
      reject(new Error('Runtime provider management command timed out'));
    }, COMMAND_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        code,
      });
    });

    child.stdin.write(stdinValue);
    child.stdin.end();
  });
}

export class AgentTeamsRuntimeProviderManagementCliClient implements RuntimeProviderManagementApi {
  async loadView(
    input: RuntimeProviderManagementLoadViewInput
  ): Promise<RuntimeProviderManagementViewResponse> {
    const { binaryPath, env } = await resolveCliEnv();
    if (!binaryPath) {
      return errorResponse<RuntimeProviderManagementViewResponse>(
        input.runtimeId,
        'Multimodel runtime binary was not found.',
        'runtime-missing'
      );
    }

    try {
      const { stdout } = await execCli(
        binaryPath,
        ['runtime', 'providers', 'view', '--runtime', input.runtimeId, '--json', '--compact'],
        { env, timeout: COMMAND_TIMEOUT_MS }
      );
      return extractJsonObject<RuntimeProviderManagementViewResponse>(stdout);
    } catch (error) {
      const response = extractJsonObjectFromError<RuntimeProviderManagementViewResponse>(error);
      if (response) {
        return response;
      }
      return errorResponse<RuntimeProviderManagementViewResponse>(
        input.runtimeId,
        normalizeCommandFailure(error)
      );
    }
  }

  async connectWithApiKey(
    input: RuntimeProviderManagementConnectApiKeyInput
  ): Promise<RuntimeProviderManagementProviderResponse> {
    const { binaryPath, env } = await resolveCliEnv();
    if (!binaryPath) {
      return errorResponse<RuntimeProviderManagementProviderResponse>(
        input.runtimeId,
        'Multimodel runtime binary was not found.',
        'runtime-missing'
      );
    }

    try {
      const child = spawnCli(
        binaryPath,
        [
          'runtime',
          'providers',
          'connect-api-key',
          '--runtime',
          input.runtimeId,
          '--provider',
          input.providerId,
          '--stdin-key',
          '--json',
        ],
        {
          env,
          stdio: 'pipe',
        }
      ) as ChildProcessWithoutNullStreams;
      const result = await collectSpawnOutput(child, input.apiKey);
      if (result.code === 0) {
        return extractJsonObject<RuntimeProviderManagementProviderResponse>(result.stdout);
      }

      try {
        return extractJsonObject<RuntimeProviderManagementProviderResponse>(result.stdout);
      } catch {
        return errorResponse<RuntimeProviderManagementProviderResponse>(
          input.runtimeId,
          `Runtime provider connect command failed with exit code ${String(result.code ?? 'unknown')}.`
        );
      }
    } catch (error) {
      const response = extractJsonObjectFromError<RuntimeProviderManagementProviderResponse>(error);
      if (response) {
        return response;
      }
      return errorResponse<RuntimeProviderManagementProviderResponse>(
        input.runtimeId,
        normalizeCommandFailure(error)
      );
    }
  }

  async forgetCredential(
    input: RuntimeProviderManagementForgetInput
  ): Promise<RuntimeProviderManagementProviderResponse> {
    const { binaryPath, env } = await resolveCliEnv();
    if (!binaryPath) {
      return errorResponse<RuntimeProviderManagementProviderResponse>(
        input.runtimeId,
        'Multimodel runtime binary was not found.',
        'runtime-missing'
      );
    }

    try {
      const { stdout } = await execCli(
        binaryPath,
        [
          'runtime',
          'providers',
          'forget',
          '--runtime',
          input.runtimeId,
          '--provider',
          input.providerId,
          '--json',
        ],
        { env, timeout: COMMAND_TIMEOUT_MS }
      );
      return extractJsonObject<RuntimeProviderManagementProviderResponse>(stdout);
    } catch (error) {
      return errorResponse<RuntimeProviderManagementProviderResponse>(
        input.runtimeId,
        normalizeCommandFailure(error)
      );
    }
  }

  async loadModels(
    input: RuntimeProviderManagementLoadModelsInput
  ): Promise<RuntimeProviderManagementModelsResponse> {
    const { binaryPath, env } = await resolveCliEnv();
    if (!binaryPath) {
      return errorResponse<RuntimeProviderManagementModelsResponse>(
        input.runtimeId,
        'Multimodel runtime binary was not found.',
        'runtime-missing'
      );
    }

    const args = [
      'runtime',
      'providers',
      'models',
      '--runtime',
      input.runtimeId,
      '--provider',
      input.providerId,
      '--json',
    ];
    if (input.query?.trim()) {
      args.push('--query', input.query.trim());
    }
    if (typeof input.limit === 'number' && Number.isFinite(input.limit) && input.limit > 0) {
      args.push('--limit', String(Math.floor(input.limit)));
    }

    try {
      const { stdout } = await execCli(binaryPath, args, {
        env,
        timeout: COMMAND_TIMEOUT_MS,
      });
      return extractJsonObject<RuntimeProviderManagementModelsResponse>(stdout);
    } catch (error) {
      const response = extractJsonObjectFromError<RuntimeProviderManagementModelsResponse>(error);
      if (response) {
        return response;
      }
      return errorResponse<RuntimeProviderManagementModelsResponse>(
        input.runtimeId,
        normalizeCommandFailure(error)
      );
    }
  }

  async testModel(
    input: RuntimeProviderManagementTestModelInput
  ): Promise<RuntimeProviderManagementModelTestResponse> {
    const { binaryPath, env } = await resolveCliEnv();
    if (!binaryPath) {
      return errorResponse<RuntimeProviderManagementModelTestResponse>(
        input.runtimeId,
        'Multimodel runtime binary was not found.',
        'runtime-missing'
      );
    }

    try {
      const { stdout } = await execCli(
        binaryPath,
        [
          'runtime',
          'providers',
          'test-model',
          '--runtime',
          input.runtimeId,
          '--provider',
          input.providerId,
          '--model',
          input.modelId,
          '--json',
        ],
        { env, timeout: PROBE_COMMAND_TIMEOUT_MS }
      );
      return extractJsonObject<RuntimeProviderManagementModelTestResponse>(stdout);
    } catch (error) {
      const response =
        extractJsonObjectFromError<RuntimeProviderManagementModelTestResponse>(error);
      if (response) {
        return response;
      }
      return errorResponse<RuntimeProviderManagementModelTestResponse>(
        input.runtimeId,
        normalizeCommandFailure(error),
        'model-test-failed'
      );
    }
  }

  async setDefaultModel(
    input: RuntimeProviderManagementSetDefaultModelInput
  ): Promise<RuntimeProviderManagementViewResponse> {
    const { binaryPath, env } = await resolveCliEnv();
    if (!binaryPath) {
      return errorResponse<RuntimeProviderManagementViewResponse>(
        input.runtimeId,
        'Multimodel runtime binary was not found.',
        'runtime-missing'
      );
    }

    try {
      const { stdout } = await execCli(
        binaryPath,
        [
          'runtime',
          'providers',
          'set-default',
          '--runtime',
          input.runtimeId,
          '--provider',
          input.providerId,
          '--model',
          input.modelId,
          '--probe',
          '--compact',
          '--json',
        ],
        { env, timeout: PROBE_COMMAND_TIMEOUT_MS }
      );
      return extractJsonObject<RuntimeProviderManagementViewResponse>(stdout);
    } catch (error) {
      const response = extractJsonObjectFromError<RuntimeProviderManagementViewResponse>(error);
      if (response) {
        return response;
      }
      return errorResponse<RuntimeProviderManagementViewResponse>(
        input.runtimeId,
        normalizeCommandFailure(error),
        'model-test-failed'
      );
    }
  }
}
