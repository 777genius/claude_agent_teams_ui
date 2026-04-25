import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { Checkbox } from '@renderer/components/ui/checkbox';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import {
  compareOpenCodeTeamModelRecommendations,
  getOpenCodeTeamModelRecommendation,
  isOpenCodeTeamModelRecommended,
} from '@renderer/utils/openCodeModelRecommendations';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  RefreshCcw,
  Search,
  Star,
  Trash2,
} from 'lucide-react';

import {
  formatProviderState,
  formatRuntimeState,
  getProviderAction,
  getProviderModelsLabel,
} from '../../core/domain';

import { ProviderBrandIcon } from './providerBrandIcons';

import type {
  RuntimeProviderManagementActions,
  RuntimeProviderManagementState,
} from '../hooks/useRuntimeProviderManagement';
import type {
  RuntimeProviderConnectionDto,
  RuntimeProviderModelDto,
  RuntimeProviderModelTestResultDto,
} from '@features/runtime-provider-management/contracts';
import type { CSSProperties, JSX, KeyboardEvent } from 'react';

interface RuntimeProviderManagementPanelViewProps {
  readonly state: RuntimeProviderManagementState;
  readonly actions: RuntimeProviderManagementActions;
  readonly disabled: boolean;
  readonly projectPath?: string | null;
}

interface ProviderActionsProps {
  readonly provider: RuntimeProviderConnectionDto;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onStartConnect: () => void;
  readonly onForget: () => void;
}

interface ProviderRowProps {
  readonly provider: RuntimeProviderConnectionDto;
  readonly state: RuntimeProviderManagementState;
  readonly active: boolean;
  readonly formOpen: boolean;
  readonly apiKeyValue: string;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly actions: RuntimeProviderManagementActions;
}

function stateClassName(provider: RuntimeProviderConnectionDto): string {
  switch (provider.state) {
    case 'connected':
      return 'border-emerald-400/35 bg-emerald-400/10';
    case 'available':
      return 'border-sky-400/25 bg-sky-400/10 text-sky-200';
    case 'error':
      return 'border-red-400/25 bg-red-400/10 text-red-200';
    case 'ignored':
      return 'border-zinc-400/25 bg-zinc-400/10 text-zinc-300';
    case 'not-connected':
      return 'border-white/10 bg-white/[0.04] text-[var(--color-text-muted)]';
  }
}

function stateStyle(provider: RuntimeProviderConnectionDto): CSSProperties | undefined {
  if (provider.state !== 'connected') {
    return undefined;
  }

  return {
    color: '#86efac',
    borderColor: 'rgba(74, 222, 128, 0.38)',
    backgroundColor: 'rgba(74, 222, 128, 0.11)',
  };
}

function RuntimeSummary({
  state,
  onRefresh,
  disabled,
  projectPath,
}: Pick<RuntimeProviderManagementPanelViewProps, 'state' | 'disabled' | 'projectPath'> & {
  onRefresh: () => void;
}): JSX.Element {
  const runtime = state.view?.runtime;
  const loadingWithoutRuntime = state.loading && !runtime;
  return (
    <div
      className="rounded-lg border p-3"
      aria-busy={state.loading}
      style={{
        borderColor: 'var(--color-border-subtle)',
        backgroundColor: 'rgba(255, 255, 255, 0.025)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            OpenCode runtime
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <Badge
              variant="outline"
              className={`border-white/10 ${loadingWithoutRuntime ? 'bg-white/[0.04]' : ''}`}
            >
              {runtime
                ? formatRuntimeState(runtime)
                : state.loading
                  ? 'Checking runtime'
                  : 'Unavailable'}
            </Badge>
            {runtime?.version ? (
              <span style={{ color: 'var(--color-text-secondary)' }}>v{runtime.version}</span>
            ) : null}
            {state.view?.defaultModel ? (
              <span className="break-all" style={{ color: 'var(--color-text-secondary)' }}>
                OpenCode default: {state.view.defaultModel}
              </span>
            ) : null}
          </div>
          <div
            className="mt-1 truncate text-[11px]"
            style={{ color: 'var(--color-text-muted)' }}
            title={projectPath ?? undefined}
          >
            {projectPath
              ? `Managing selected project profile: ${projectPath}`
              : 'Managing fallback OpenCode profile. Select a project to manage launch credentials for that project.'}
          </div>
          {state.loading ? (
            <div
              className="mt-2 flex items-center gap-2 text-xs"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <Loader2 className="size-3.5 animate-spin" />
              <span>
                Loading managed OpenCode runtime, connected providers, and model defaults...
              </span>
            </div>
          ) : null}
          {state.view?.diagnostics.length ? (
            <div
              className="mt-2 space-y-1 text-[11px]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {state.view.diagnostics.slice(0, 3).map((diagnostic) => (
                <div key={diagnostic}>{diagnostic}</div>
              ))}
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || state.loading}
          onClick={onRefresh}
        >
          {state.loading ? (
            <Loader2 className="mr-1 size-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="mr-1 size-3.5" />
          )}
          {state.loading ? 'Checking...' : 'Refresh'}
        </Button>
      </div>
    </div>
  );
}

function RuntimeProviderLoadingPlaceholder(): JSX.Element {
  return (
    <div
      data-testid="runtime-provider-loading-skeleton"
      className="rounded-lg border p-3"
      style={{
        borderColor: 'var(--color-border-subtle)',
        backgroundColor: 'rgba(255,255,255,0.02)',
      }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div
            className="skeleton-shimmer size-6 rounded-md border"
            style={{
              borderColor: 'var(--color-border-subtle)',
              backgroundColor: 'var(--skeleton-base)',
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              Loading OpenCode providers
            </div>
            <div
              className="skeleton-shimmer mt-1 h-3 w-72 max-w-full rounded-sm"
              style={{ backgroundColor: 'var(--skeleton-base-dim)' }}
            />
          </div>
        </div>
        <div className="mt-3 space-y-2" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="rounded-md border px-3 py-2.5"
              style={{
                borderColor: 'var(--color-border-subtle)',
                backgroundColor: 'rgba(255,255,255,0.018)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="skeleton-shimmer size-5 rounded-md border"
                      style={{
                        borderColor: 'var(--color-border-subtle)',
                        backgroundColor: 'var(--skeleton-base)',
                      }}
                    />
                    <div
                      className="skeleton-shimmer h-4 rounded-sm"
                      style={{
                        width: index === 0 ? 120 : index === 1 ? 92 : 150,
                        backgroundColor: 'var(--skeleton-base)',
                      }}
                    />
                    <div
                      className="skeleton-shimmer h-5 rounded-md border"
                      style={{
                        width: index === 1 ? 72 : 96,
                        borderColor: 'var(--color-border-subtle)',
                        backgroundColor: 'var(--skeleton-base-dim)',
                      }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <div
                      className="skeleton-shimmer h-3 rounded-sm"
                      style={{
                        width: index === 2 ? 64 : 82,
                        backgroundColor: 'var(--skeleton-base-dim)',
                      }}
                    />
                    <div
                      className="skeleton-shimmer h-3 rounded-sm"
                      style={{
                        width: index === 0 ? 178 : 132,
                        backgroundColor: 'var(--skeleton-base-dim)',
                      }}
                    />
                  </div>
                </div>
                <div
                  className="skeleton-shimmer h-8 w-20 shrink-0 rounded-md border"
                  style={{
                    borderColor: 'var(--color-border-subtle)',
                    backgroundColor: 'var(--skeleton-base-dim)',
                  }}
                />
              </div>
            </div>
          ))}
          <div
            className="skeleton-shimmer h-9 rounded-md border"
            style={{
              width: '74%',
              borderColor: 'var(--color-border-subtle)',
              backgroundColor: 'var(--skeleton-base-dim)',
            }}
          />
        </div>
      </div>
    </div>
  );
}

function RuntimeProviderModelLoadingSkeleton(): JSX.Element {
  return (
    <div className="space-y-2" data-testid="runtime-provider-model-loading-skeleton">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="rounded-md border px-3 py-2.5"
          style={{
            borderColor: 'var(--color-border-subtle)',
            backgroundColor: 'rgba(255,255,255,0.02)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div
                className="skeleton-shimmer h-4 rounded-sm"
                style={{
                  width: index === 0 ? '42%' : index === 1 ? '54%' : '36%',
                  backgroundColor: 'var(--skeleton-base)',
                }}
              />
              <div
                className="skeleton-shimmer mt-2 h-3 rounded-sm"
                style={{
                  width: index === 0 ? '64%' : index === 1 ? '46%' : '58%',
                  backgroundColor: 'var(--skeleton-base-dim)',
                }}
              />
            </div>
            <div
              className="skeleton-shimmer h-8 w-20 shrink-0 rounded-md border"
              style={{
                borderColor: 'var(--color-border-subtle)',
                backgroundColor: 'var(--skeleton-base-dim)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProviderActions({
  provider,
  busy,
  disabled,
  onStartConnect,
  onForget,
}: ProviderActionsProps): JSX.Element {
  const connect = getProviderAction(provider, 'connect');
  const forget = getProviderAction(provider, 'forget');
  const configure = getProviderAction(provider, 'configure');

  if (connect) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || busy || !connect.enabled}
        title={connect.disabledReason ?? undefined}
        onClick={onStartConnect}
      >
        {busy ? (
          <Loader2 className="mr-1 size-3.5 animate-spin" />
        ) : (
          <KeyRound className="mr-1 size-3.5" />
        )}
        {connect.label}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {forget ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || busy || !forget.enabled}
          title={forget.disabledReason ?? undefined}
          onClick={onForget}
        >
          {busy ? (
            <Loader2 className="mr-1 size-3.5 animate-spin" />
          ) : (
            <Trash2 className="mr-1 size-3.5" />
          )}
          {forget.label}
        </Button>
      ) : null}
      {configure ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled
          title={configure.disabledReason ?? undefined}
        >
          {configure.label}
        </Button>
      ) : null}
    </div>
  );
}

function ProviderRow({
  provider,
  state,
  active,
  formOpen,
  apiKeyValue,
  busy,
  disabled,
  actions,
}: ProviderRowProps): JSX.Element {
  return (
    <div
      data-testid={`runtime-provider-row-${provider.providerId}`}
      className={`cursor-pointer rounded-lg border p-3 transition-all hover:border-sky-300/60 hover:bg-sky-400/[0.08] hover:shadow-[0_0_0_1px_rgba(125,211,252,0.18)] ${
        active
          ? 'border-sky-300/70 bg-sky-400/[0.075] shadow-[0_0_0_1px_rgba(125,211,252,0.22)]'
          : 'border-[var(--color-border-subtle)] bg-white/[0.02]'
      }`}
      onClick={() => actions.selectProvider(provider.providerId)}
    >
      <div className="grid w-full grid-cols-[1fr_auto] items-start gap-3">
        <div className="min-w-0 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <ProviderBrandIcon provider={provider} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {provider.displayName}
            </span>
            {provider.recommended ? <Badge variant="secondary">Recommended</Badge> : null}
            <span
              className={`rounded-md border px-2 py-0.5 text-[11px] ${stateClassName(provider)}`}
              style={stateStyle(provider)}
            >
              {formatProviderState(provider)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {getProviderModelsLabel(provider)}
            </span>
            {provider.defaultModelId ? (
              <span className="break-all" style={{ color: 'var(--color-text-secondary)' }}>
                OpenCode default: {provider.defaultModelId}
              </span>
            ) : null}
            {provider.ownership.map((owner) => (
              <Badge
                key={owner}
                variant="outline"
                className="border-white/10 px-1.5 py-0 text-[10px]"
              >
                {owner}
              </Badge>
            ))}
          </div>
          {provider.detail ? (
            <div className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {provider.detail}
            </div>
          ) : null}
        </div>
        <div className="flex justify-end">
          <ProviderActions
            provider={provider}
            busy={busy}
            disabled={disabled}
            onStartConnect={() => actions.startConnect(provider.providerId)}
            onForget={() => void actions.forgetProvider(provider.providerId)}
          />
        </div>
      </div>

      {formOpen ? (
        <div
          className="mt-3 rounded-md border p-3"
          style={{ borderColor: 'var(--color-border-subtle)' }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`runtime-provider-key-${provider.providerId}`} className="text-xs">
              {provider.displayName} API key
            </Label>
            <Input
              id={`runtime-provider-key-${provider.providerId}`}
              type="password"
              value={apiKeyValue}
              disabled={disabled || busy}
              onChange={(event) => actions.setApiKeyValue(event.target.value)}
              placeholder="Paste API key"
              className="h-9 text-sm"
              autoFocus
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={actions.cancelConnect}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={disabled || busy || !apiKeyValue.trim()}
              onClick={() => void actions.submitConnect(provider.providerId)}
            >
              {busy ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
              Save key
            </Button>
          </div>
        </div>
      ) : null}

      {active && provider.state === 'connected' && provider.modelCount > 0 ? (
        <ProviderModelList
          state={state}
          actions={actions}
          provider={provider}
          disabled={disabled || busy}
        />
      ) : null}
    </div>
  );
}

function ModelBadges({
  model,
  usedForNewTeams,
}: {
  readonly model: RuntimeProviderModelDto;
  readonly usedForNewTeams: boolean;
}): JSX.Element | null {
  const modelRecommendation = getOpenCodeTeamModelRecommendation(model.modelId);

  if (!model.free && !model.default && !usedForNewTeams && !modelRecommendation) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {modelRecommendation ? (
        <Badge
          className={
            modelRecommendation.level === 'recommended'
              ? 'bg-amber-400/15 px-1.5 py-0 text-[10px] text-amber-200'
              : 'bg-red-400/15 px-1.5 py-0 text-[10px] text-red-200'
          }
          title={modelRecommendation.reason}
        >
          {modelRecommendation.level === 'recommended' ? (
            <Star className="mr-1 size-3 fill-current" />
          ) : (
            <AlertTriangle className="mr-1 size-3" />
          )}
          {modelRecommendation.label}
        </Badge>
      ) : null}
      {usedForNewTeams ? (
        <Badge className="bg-sky-400/15 px-1.5 py-0 text-[10px] text-sky-100">
          <Star className="mr-1 size-3" />
          Used for new teams
        </Badge>
      ) : null}
      {model.free ? (
        <Badge className="bg-emerald-400/15 px-1.5 py-0 text-[10px] text-emerald-200">free</Badge>
      ) : null}
      {model.default ? (
        <Badge className="bg-amber-400/15 px-1.5 py-0 text-[10px] text-amber-200">default</Badge>
      ) : null}
    </div>
  );
}

function ModelResult({
  result,
}: {
  readonly result: RuntimeProviderModelTestResultDto | undefined;
}): JSX.Element | null {
  if (!result) {
    return null;
  }
  return (
    <div
      className="mt-2 text-xs"
      style={{ color: result.ok ? '#86efac' : '#fecaca' }}
      data-testid={`runtime-provider-model-result-${result.modelId}`}
    >
      {result.message}
    </div>
  );
}

function ModelRow({
  provider,
  model,
  selected,
  disabled,
  testing,
  result,
  actions,
}: {
  readonly provider: RuntimeProviderConnectionDto;
  readonly model: RuntimeProviderModelDto;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly testing: boolean;
  readonly result: RuntimeProviderModelTestResultDto | undefined;
  readonly actions: RuntimeProviderManagementActions;
}): JSX.Element {
  const chooseModel = (): void => {
    if (!disabled) {
      actions.useModelForNewTeams(model.modelId);
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    chooseModel();
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={selected}
      data-testid={`runtime-provider-model-row-${model.modelId}`}
      className="cursor-pointer rounded-md border px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/45"
      onClick={chooseModel}
      onKeyDown={handleKeyDown}
      style={{
        borderColor: selected ? 'rgba(96, 165, 250, 0.45)' : 'var(--color-border-subtle)',
        backgroundColor: selected ? 'rgba(96, 165, 250, 0.06)' : 'rgba(255,255,255,0.02)',
      }}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="block w-full min-w-0 text-left">
          <div
            className="text-sm font-medium leading-5"
            style={{ color: 'var(--color-text)', overflowWrap: 'anywhere' }}
          >
            {model.displayName}
          </div>
          <div
            className="mt-1 text-[11px] leading-4"
            style={{ color: 'var(--color-text-muted)', overflowWrap: 'anywhere' }}
          >
            {model.modelId}
          </div>
          <ModelBadges model={model} usedForNewTeams={selected} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 min-w-20 justify-center"
            disabled={disabled || testing}
            onClick={(event) => {
              event.stopPropagation();
              void actions.testModel(provider.providerId, model.modelId);
            }}
          >
            {testing ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1 size-3.5" />
            )}
            Test
          </Button>
        </div>
      </div>
      <ModelResult result={result} />
    </div>
  );
}

function ProviderModelList({
  state,
  actions,
  provider,
  disabled,
}: {
  readonly state: RuntimeProviderManagementState;
  readonly actions: RuntimeProviderManagementActions;
  readonly provider: RuntimeProviderConnectionDto;
  readonly disabled: boolean;
}): JSX.Element {
  const pickerOpen = state.modelPickerProviderId === provider.providerId;
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const hasRecommendedModels = useMemo(
    () => state.models.some((model) => isOpenCodeTeamModelRecommended(model.modelId)),
    [state.models]
  );

  useEffect(() => {
    if (!hasRecommendedModels) {
      setRecommendedOnly(false);
    }
  }, [hasRecommendedModels]);

  const visibleModels = useMemo(
    () =>
      state.models
        .map((model, index) => ({ model, index }))
        .filter(({ model }) => !recommendedOnly || isOpenCodeTeamModelRecommended(model.modelId))
        .sort((left, right) => {
          const recommendationOrder = compareOpenCodeTeamModelRecommendations(
            left.model.modelId,
            right.model.modelId
          );
          return recommendationOrder || left.index - right.index;
        })
        .map(({ model }) => model),
    [recommendedOnly, state.models]
  );

  return (
    <div className="mt-4 space-y-3 border-t border-white/10 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <Input
            data-testid="runtime-provider-model-search"
            value={state.modelQuery}
            disabled={disabled || state.modelsLoading}
            onChange={(event) => actions.setModelQuery(event.target.value)}
            placeholder="Search models"
            className="h-10 pl-10 pr-3 text-sm leading-5"
            style={{ paddingLeft: 42 }}
          />
        </div>
        {hasRecommendedModels ? (
          <div className="flex h-10 items-center gap-2 rounded-md border border-white/10 px-3">
            <Checkbox
              id={`runtime-provider-${provider.providerId}-recommended-only`}
              checked={recommendedOnly}
              disabled={disabled || state.modelsLoading}
              onCheckedChange={(checked) => setRecommendedOnly(checked === true)}
              className="size-3.5"
            />
            <Label
              htmlFor={`runtime-provider-${provider.providerId}-recommended-only`}
              className="cursor-pointer text-xs font-normal text-[var(--color-text-secondary)]"
            >
              Recommended only
            </Label>
          </div>
        ) : null}
      </div>

      {state.modelsError ? (
        <div className="rounded-md border border-red-400/25 bg-red-400/10 px-3 py-2 text-xs text-red-200">
          {state.modelsError}
        </div>
      ) : null}

      <div
        data-testid="runtime-provider-model-list"
        className="space-y-2 overflow-y-auto pr-1"
        style={{ maxHeight: 300 }}
      >
        {!pickerOpen || state.modelsLoading ? <RuntimeProviderModelLoadingSkeleton /> : null}
        {pickerOpen && !state.modelsLoading && visibleModels.length === 0 && !state.modelsError ? (
          <div className="text-sm text-[var(--color-text-muted)]">
            {recommendedOnly ? 'No recommended models found.' : 'No models found.'}
          </div>
        ) : null}
        {pickerOpen
          ? visibleModels.map((model) => (
              <ModelRow
                key={model.modelId}
                provider={provider}
                model={model}
                selected={state.selectedModelId === model.modelId}
                disabled={disabled}
                testing={state.testingModelId === model.modelId}
                result={state.modelResults[model.modelId]}
                actions={actions}
              />
            ))
          : null}
      </div>
    </div>
  );
}

export function RuntimeProviderManagementPanelView({
  state,
  actions,
  disabled,
  projectPath = null,
}: RuntimeProviderManagementPanelViewProps): JSX.Element {
  const providerQuery = state.providerQuery.trim().toLowerCase();
  const filteredProviders = providerQuery
    ? state.providers.filter((provider) =>
        [
          provider.providerId,
          provider.displayName,
          provider.detail ?? '',
          provider.defaultModelId ?? '',
          getProviderModelsLabel(provider),
          formatProviderState(provider),
        ]
          .join(' ')
          .toLowerCase()
          .includes(providerQuery)
      )
    : state.providers;
  const selectedProviderId = filteredProviders.some(
    (provider) => provider.providerId === state.selectedProviderId
  )
    ? state.selectedProviderId
    : (filteredProviders[0]?.providerId ?? state.selectedProviderId ?? null);

  return (
    <div className="space-y-3">
      <RuntimeSummary
        state={state}
        disabled={disabled}
        projectPath={projectPath}
        onRefresh={() => void actions.refresh()}
      />

      {state.error ? (
        <div
          className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
          style={{
            borderColor: 'rgba(248, 113, 113, 0.25)',
            backgroundColor: 'rgba(248, 113, 113, 0.06)',
            color: '#fca5a5',
          }}
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}

      {state.successMessage ? (
        <div
          className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
          style={{
            borderColor: 'rgba(74, 222, 128, 0.25)',
            backgroundColor: 'rgba(74, 222, 128, 0.08)',
            color: '#86efac',
          }}
        >
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
          <span>{state.successMessage}</span>
        </div>
      ) : null}

      {state.providers.length > 0 ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <Input
            data-testid="runtime-provider-search"
            value={state.providerQuery}
            disabled={disabled || state.loading}
            onChange={(event) => actions.setProviderQuery(event.target.value)}
            placeholder="Search providers"
            className="h-9 pr-3 text-sm"
            style={{ paddingLeft: 40 }}
          />
        </div>
      ) : null}

      <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
        {state.loading && state.providers.length === 0 ? (
          <RuntimeProviderLoadingPlaceholder />
        ) : null}
        {filteredProviders.map((provider) => (
          <ProviderRow
            key={provider.providerId}
            provider={provider}
            state={state}
            active={provider.providerId === selectedProviderId}
            formOpen={state.activeFormProviderId === provider.providerId}
            apiKeyValue={state.apiKeyValue}
            busy={state.savingProviderId === provider.providerId}
            disabled={disabled || state.loading}
            actions={actions}
          />
        ))}
      </div>

      {!state.loading && state.providers.length > 0 && filteredProviders.length === 0 ? (
        <div
          className="rounded-lg border p-3 text-sm"
          style={{
            borderColor: 'var(--color-border-subtle)',
            color: 'var(--color-text-secondary)',
          }}
        >
          No providers match that search.
        </div>
      ) : null}

      {!state.loading && state.providers.length === 0 ? (
        <div
          className="rounded-lg border p-3 text-sm"
          style={{
            borderColor: 'var(--color-border-subtle)',
            color: 'var(--color-text-secondary)',
          }}
        >
          No OpenCode providers reported by the managed runtime.
        </div>
      ) : null}
    </div>
  );
}
