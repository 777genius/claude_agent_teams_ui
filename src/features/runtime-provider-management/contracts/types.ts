export type RuntimeProviderManagementRuntimeId = 'opencode';

export type RuntimeProviderStateDto = 'ready' | 'needs-auth' | 'needs-setup' | 'degraded';

export type RuntimeProviderManagedProfileStateDto = 'active' | 'missing' | 'stale';

export type RuntimeProviderLocalAuthStateDto = 'synced' | 'missing' | 'stale' | 'disabled';

export type RuntimeProviderConnectionStateDto =
  | 'connected'
  | 'available'
  | 'not-connected'
  | 'ignored'
  | 'error';

export type RuntimeProviderOwnershipDto = 'managed' | 'local' | 'env' | 'project';

export type RuntimeProviderAuthMethodDto = 'api' | 'oauth' | 'wellknown';

export type RuntimeProviderActionIdDto =
  | 'connect'
  | 'use'
  | 'test'
  | 'set-default'
  | 'forget'
  | 'configure'
  | 'unignore';

export type RuntimeProviderActionOwnershipScopeDto = RuntimeProviderOwnershipDto | 'runtime';

export interface RuntimeProviderActionDescriptorDto {
  id: RuntimeProviderActionIdDto;
  label: string;
  enabled: boolean;
  disabledReason: string | null;
  requiresSecret: boolean;
  ownershipScope: RuntimeProviderActionOwnershipScopeDto;
}

export interface RuntimeProviderManagementRuntimeDto {
  state: RuntimeProviderStateDto;
  cliPath: string | null;
  version: string | null;
  managedProfile: RuntimeProviderManagedProfileStateDto;
  localAuth: RuntimeProviderLocalAuthStateDto;
}

export interface RuntimeProviderConnectionDto {
  providerId: string;
  displayName: string;
  state: RuntimeProviderConnectionStateDto;
  ownership: readonly RuntimeProviderOwnershipDto[];
  recommended: boolean;
  modelCount: number;
  defaultModelId: string | null;
  authMethods: readonly RuntimeProviderAuthMethodDto[];
  actions: readonly RuntimeProviderActionDescriptorDto[];
  detail: string | null;
}

export interface RuntimeProviderManagementViewDto {
  runtimeId: RuntimeProviderManagementRuntimeId;
  title: string;
  runtime: RuntimeProviderManagementRuntimeDto;
  providers: readonly RuntimeProviderConnectionDto[];
  defaultModel: string | null;
  fallbackModel: string | null;
  diagnostics: readonly string[];
}

export type RuntimeProviderManagementErrorCodeDto =
  | 'unsupported-runtime'
  | 'unsupported-action'
  | 'runtime-missing'
  | 'runtime-unhealthy'
  | 'provider-missing'
  | 'auth-required'
  | 'auth-failed'
  | 'model-missing'
  | 'model-test-failed'
  | 'unsupported-auth-method';

export interface RuntimeProviderManagementErrorDto {
  code: RuntimeProviderManagementErrorCodeDto;
  message: string;
  recoverable: boolean;
}

export interface RuntimeProviderManagementViewResponse {
  schemaVersion: 1;
  runtimeId: RuntimeProviderManagementRuntimeId;
  view?: RuntimeProviderManagementViewDto;
  error?: RuntimeProviderManagementErrorDto;
}

export interface RuntimeProviderManagementProviderResponse {
  schemaVersion: 1;
  runtimeId: RuntimeProviderManagementRuntimeId;
  provider?: RuntimeProviderConnectionDto;
  error?: RuntimeProviderManagementErrorDto;
}

export type RuntimeProviderModelAvailabilityDto =
  | 'available'
  | 'unavailable'
  | 'not-authenticated'
  | 'unknown'
  | 'untested';

export interface RuntimeProviderModelDto {
  modelId: string;
  providerId: string;
  displayName: string;
  sourceLabel: string;
  free: boolean;
  default: boolean;
  availability: RuntimeProviderModelAvailabilityDto;
}

export interface RuntimeProviderManagementModelsDto {
  runtimeId: RuntimeProviderManagementRuntimeId;
  providerId: string;
  models: readonly RuntimeProviderModelDto[];
  defaultModelId: string | null;
  diagnostics: readonly string[];
}

export interface RuntimeProviderManagementModelsResponse {
  schemaVersion: 1;
  runtimeId: RuntimeProviderManagementRuntimeId;
  models?: RuntimeProviderManagementModelsDto;
  error?: RuntimeProviderManagementErrorDto;
}

export interface RuntimeProviderModelTestResultDto {
  providerId: string;
  modelId: string;
  ok: boolean;
  availability: RuntimeProviderModelAvailabilityDto;
  message: string;
  diagnostics: readonly string[];
}

export interface RuntimeProviderManagementModelTestResponse {
  schemaVersion: 1;
  runtimeId: RuntimeProviderManagementRuntimeId;
  result?: RuntimeProviderModelTestResultDto;
  error?: RuntimeProviderManagementErrorDto;
}

export interface RuntimeProviderManagementLoadViewInput {
  runtimeId: RuntimeProviderManagementRuntimeId;
  projectPath?: string | null;
}

export interface RuntimeProviderManagementConnectApiKeyInput {
  runtimeId: RuntimeProviderManagementRuntimeId;
  providerId: string;
  apiKey: string;
  projectPath?: string | null;
}

export interface RuntimeProviderManagementForgetInput {
  runtimeId: RuntimeProviderManagementRuntimeId;
  providerId: string;
  projectPath?: string | null;
}

export interface RuntimeProviderManagementLoadModelsInput {
  runtimeId: RuntimeProviderManagementRuntimeId;
  providerId: string;
  projectPath?: string | null;
  query?: string | null;
  limit?: number | null;
}

export interface RuntimeProviderManagementTestModelInput {
  runtimeId: RuntimeProviderManagementRuntimeId;
  providerId: string;
  modelId: string;
  projectPath?: string | null;
}

export interface RuntimeProviderManagementSetDefaultModelInput {
  runtimeId: RuntimeProviderManagementRuntimeId;
  providerId: string;
  modelId: string;
  probe?: boolean;
  projectPath?: string | null;
}
