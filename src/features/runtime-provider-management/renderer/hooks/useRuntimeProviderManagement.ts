import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '@renderer/api';

import { selectInitialProviderId } from '../../core/domain';
import {
  getOpenCodeModelForNewTeams,
  saveOpenCodeModelForNewTeams,
} from '../adapters/createTeamDefaultModelWriter';

import type {
  RuntimeProviderConnectionDto,
  RuntimeProviderManagementRuntimeId,
  RuntimeProviderManagementViewDto,
  RuntimeProviderModelDto,
  RuntimeProviderModelTestResultDto,
} from '@features/runtime-provider-management/contracts';

interface UseRuntimeProviderManagementOptions {
  runtimeId: RuntimeProviderManagementRuntimeId;
  enabled: boolean;
  onProviderChanged?: () => Promise<void> | void;
}

export type RuntimeProviderModelPickerMode = 'use' | 'runtime-default';

export interface RuntimeProviderManagementState {
  view: RuntimeProviderManagementViewDto | null;
  providers: readonly RuntimeProviderConnectionDto[];
  selectedProviderId: string | null;
  providerQuery: string;
  activeFormProviderId: string | null;
  apiKeyValue: string;
  modelPickerProviderId: string | null;
  modelPickerMode: RuntimeProviderModelPickerMode | null;
  modelQuery: string;
  models: readonly RuntimeProviderModelDto[];
  modelsLoading: boolean;
  modelsError: string | null;
  selectedModelId: string | null;
  testingModelId: string | null;
  savingDefaultModelId: string | null;
  modelResults: Readonly<Record<string, RuntimeProviderModelTestResultDto>>;
  loading: boolean;
  savingProviderId: string | null;
  error: string | null;
  successMessage: string | null;
}

export interface RuntimeProviderManagementActions {
  refresh: () => Promise<void>;
  selectProvider: (providerId: string) => void;
  setProviderQuery: (value: string) => void;
  startConnect: (providerId: string) => void;
  cancelConnect: () => void;
  setApiKeyValue: (value: string) => void;
  submitConnect: (providerId: string) => Promise<void>;
  forgetProvider: (providerId: string) => Promise<void>;
  openModelPicker: (providerId: string, mode: RuntimeProviderModelPickerMode) => void;
  closeModelPicker: () => void;
  setModelQuery: (value: string) => void;
  selectModel: (modelId: string) => void;
  useModelForNewTeams: (modelId: string) => void;
  testModel: (providerId: string, modelId: string) => Promise<void>;
  setDefaultModel: (providerId: string, modelId: string) => Promise<void>;
}

function replaceProvider(
  view: RuntimeProviderManagementViewDto | null,
  provider: RuntimeProviderConnectionDto
): RuntimeProviderManagementViewDto | null {
  if (!view) {
    return view;
  }
  return {
    ...view,
    providers: view.providers.map((entry) =>
      entry.providerId === provider.providerId ? provider : entry
    ),
  };
}

function resetModelState(): {
  modelPickerProviderId: null;
  modelPickerMode: null;
  models: readonly RuntimeProviderModelDto[];
  modelsError: null;
  selectedModelId: null;
  modelResults: Record<string, RuntimeProviderModelTestResultDto>;
} {
  return {
    modelPickerProviderId: null,
    modelPickerMode: null,
    models: [],
    modelsError: null,
    selectedModelId: null,
    modelResults: {},
  };
}

function withUiTimeout<T>(promise: Promise<T>, message: string, timeoutMs = 70_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function buildFailedModelTestResult(
  providerId: string,
  modelId: string,
  message: string
): RuntimeProviderModelTestResultDto {
  return {
    providerId,
    modelId,
    ok: false,
    availability: 'unknown',
    message,
    diagnostics: [],
  };
}

function resolveSavedModelForNewTeams(models: readonly RuntimeProviderModelDto[]): string | null {
  const savedModelId = getOpenCodeModelForNewTeams();
  if (!savedModelId) {
    return null;
  }
  return models.some((model) => model.modelId === savedModelId) ? savedModelId : null;
}

export function useRuntimeProviderManagement(
  options: UseRuntimeProviderManagementOptions
): [RuntimeProviderManagementState, RuntimeProviderManagementActions] {
  const [view, setView] = useState<RuntimeProviderManagementViewDto | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [providerQuery, setProviderQuery] = useState('');
  const [activeFormProviderId, setActiveFormProviderId] = useState<string | null>(null);
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [modelPickerProviderId, setModelPickerProviderId] = useState<string | null>(null);
  const [modelPickerMode, setModelPickerMode] = useState<RuntimeProviderModelPickerMode | null>(
    null
  );
  const [modelQuery, setModelQuery] = useState('');
  const [models, setModels] = useState<readonly RuntimeProviderModelDto[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [savingDefaultModelId, setSavingDefaultModelId] = useState<string | null>(null);
  const [modelResults, setModelResults] = useState<
    Record<string, RuntimeProviderModelTestResultDto>
  >({});
  const [loading, setLoading] = useState(false);
  const [savingProviderId, setSavingProviderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!options.enabled) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.runtimeProviderManagement.loadView({
        runtimeId: options.runtimeId,
      });
      if (response.error) {
        setView(null);
        setError(response.error.message);
        return;
      }
      const nextView = response.view ?? null;
      setView(nextView);
      setSelectedProviderId((current) => {
        if (current && nextView?.providers.some((provider) => provider.providerId === current)) {
          return current;
        }
        return selectInitialProviderId(nextView);
      });
    } catch (loadError) {
      setView(null);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }, [options.enabled, options.runtimeId]);

  useEffect(() => {
    if (!options.enabled) {
      setProviderQuery('');
      setApiKeyValue('');
      setActiveFormProviderId(null);
      const reset = resetModelState();
      setModelPickerProviderId(reset.modelPickerProviderId);
      setModelPickerMode(reset.modelPickerMode);
      setModels(reset.models);
      setModelsError(reset.modelsError);
      setSelectedModelId(reset.selectedModelId);
      setModelResults(reset.modelResults);
      return;
    }
    void refresh();
  }, [options.enabled, refresh]);

  useEffect(() => {
    if (!options.enabled || !modelPickerProviderId) {
      return;
    }

    let cancelled = false;
    setModelsLoading(true);
    setModelsError(null);
    void withUiTimeout(
      api.runtimeProviderManagement.loadModels({
        runtimeId: options.runtimeId,
        providerId: modelPickerProviderId,
        query: modelQuery.trim() || null,
        limit: 250,
      }),
      'Provider models load timed out'
    )
      .then((response) => {
        if (cancelled) {
          return;
        }
        if (response.error) {
          setModels([]);
          setModelsError(response.error.message);
          return;
        }
        const nextModels = response.models?.models ?? [];
        setModels(nextModels);
        setSelectedModelId((current) => {
          if (current && nextModels.some((model) => model.modelId === current)) {
            return current;
          }
          return resolveSavedModelForNewTeams(nextModels);
        });
      })
      .catch((modelsLoadError) => {
        if (!cancelled) {
          setModels([]);
          setModelsError(
            modelsLoadError instanceof Error
              ? modelsLoadError.message
              : 'Failed to load provider models'
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setModelsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [modelPickerProviderId, modelQuery, options.enabled, options.runtimeId]);

  useEffect(() => {
    if (!options.enabled || activeFormProviderId) {
      return;
    }

    const selectedProvider = view?.providers.find(
      (provider) => provider.providerId === selectedProviderId
    );
    if (
      selectedProvider &&
      selectedProvider.state === 'connected' &&
      selectedProvider.modelCount > 0
    ) {
      if (modelPickerProviderId !== selectedProvider.providerId) {
        setModelPickerProviderId(selectedProvider.providerId);
        setModelPickerMode('use');
        setModelQuery('');
        setModels([]);
        setModelsError(null);
        setSelectedModelId(null);
        setModelResults({});
      }
      return;
    }

    if (modelPickerProviderId) {
      setModelPickerProviderId(null);
      setModelPickerMode(null);
      setModels([]);
      setModelsError(null);
      setSelectedModelId(null);
      setModelResults({});
    }
  }, [activeFormProviderId, modelPickerProviderId, options.enabled, selectedProviderId, view]);

  const startConnect = useCallback((providerId: string): void => {
    setSelectedProviderId(providerId);
    setActiveFormProviderId(providerId);
    setModelPickerProviderId(null);
    setModelPickerMode(null);
    setApiKeyValue('');
    setError(null);
    setSuccessMessage(null);
  }, []);

  const cancelConnect = useCallback((): void => {
    setActiveFormProviderId(null);
    setApiKeyValue('');
    setError(null);
  }, []);

  const submitConnect = useCallback(
    async (providerId: string): Promise<void> => {
      const apiKey = apiKeyValue.trim();
      if (!apiKey) {
        setError('API key is required');
        return;
      }

      setSavingProviderId(providerId);
      setError(null);
      setSuccessMessage(null);
      try {
        const response = await withUiTimeout(
          api.runtimeProviderManagement.connectWithApiKey({
            runtimeId: options.runtimeId,
            providerId,
            apiKey,
          }),
          'Provider connect timed out'
        );
        if (response.error) {
          setError(response.error.message);
          return;
        }
        if (response.provider) {
          setView((current) => replaceProvider(current, response.provider!));
        }
        setActiveFormProviderId(null);
        setSuccessMessage('Provider connected');
        setSavingProviderId(null);
        setApiKeyValue('');
        void Promise.resolve(options.onProviderChanged?.())
          .then(() => refresh())
          .catch((refreshError) => {
            setError(
              refreshError instanceof Error ? refreshError.message : 'Failed to refresh providers'
            );
          });
      } catch (connectError) {
        setError(
          connectError instanceof Error ? connectError.message : 'Failed to connect provider'
        );
      } finally {
        setApiKeyValue('');
        setSavingProviderId(null);
      }
    },
    [apiKeyValue, options, refresh]
  );

  const forgetProvider = useCallback(
    async (providerId: string): Promise<void> => {
      setSavingProviderId(providerId);
      setError(null);
      setSuccessMessage(null);
      try {
        const response = await withUiTimeout(
          api.runtimeProviderManagement.forgetCredential({
            runtimeId: options.runtimeId,
            providerId,
          }),
          'Provider forget timed out'
        );
        if (response.error) {
          setError(response.error.message);
          return;
        }
        if (response.provider) {
          setView((current) => replaceProvider(current, response.provider!));
        }
        setSuccessMessage('Credential removed');
        setSavingProviderId(null);
        void Promise.resolve(options.onProviderChanged?.())
          .then(() => refresh())
          .catch((refreshError) => {
            setError(
              refreshError instanceof Error ? refreshError.message : 'Failed to refresh providers'
            );
          });
      } catch (forgetError) {
        setError(
          forgetError instanceof Error ? forgetError.message : 'Failed to forget credential'
        );
      } finally {
        setSavingProviderId(null);
      }
    },
    [options, refresh]
  );

  const openModelPicker = useCallback(
    (providerId: string, mode: RuntimeProviderModelPickerMode): void => {
      setSelectedProviderId(providerId);
      setActiveFormProviderId(null);
      setModelPickerProviderId(providerId);
      setModelPickerMode(mode);
      setModelQuery('');
      setModels([]);
      setModelsError(null);
      setSelectedModelId(null);
      setModelResults({});
      setError(null);
      setSuccessMessage(null);
    },
    []
  );

  const closeModelPicker = useCallback((): void => {
    setModelPickerProviderId(null);
    setModelPickerMode(null);
    setModelQuery('');
    setModels([]);
    setModelsError(null);
    setSelectedModelId(null);
    setModelResults({});
  }, []);

  const useModelForNewTeams = useCallback((modelId: string): void => {
    saveOpenCodeModelForNewTeams(modelId);
    setSelectedModelId(modelId);
    setSuccessMessage(null);
    setError(null);
  }, []);

  const testModel = useCallback(
    async (providerId: string, modelId: string): Promise<void> => {
      setTestingModelId(modelId);
      setError(null);
      setSuccessMessage(null);
      try {
        const response = await withUiTimeout(
          api.runtimeProviderManagement.testModel({
            runtimeId: options.runtimeId,
            providerId,
            modelId,
          }),
          'Model test timed out',
          100_000
        );
        if (response.error) {
          setModelResults((current) => ({
            ...current,
            [modelId]: buildFailedModelTestResult(providerId, modelId, response.error!.message),
          }));
          return;
        }
        if (response.result) {
          setModelResults((current) => ({
            ...current,
            [modelId]: response.result!,
          }));
        }
      } catch (testError) {
        setModelResults((current) => ({
          ...current,
          [modelId]: buildFailedModelTestResult(
            providerId,
            modelId,
            testError instanceof Error ? testError.message : 'Failed to test model'
          ),
        }));
      } finally {
        setTestingModelId(null);
      }
    },
    [options.runtimeId]
  );

  const setDefaultModel = useCallback(
    async (providerId: string, modelId: string): Promise<void> => {
      setSavingDefaultModelId(modelId);
      setError(null);
      setSuccessMessage(null);
      try {
        const response = await withUiTimeout(
          api.runtimeProviderManagement.setDefaultModel({
            runtimeId: options.runtimeId,
            providerId,
            modelId,
            probe: true,
          }),
          'Set default model timed out',
          100_000
        );
        if (response.error) {
          setError(response.error.message);
          return;
        }
        if (response.view) {
          setView(response.view);
        }
        setSelectedModelId(modelId);
        setModels((current) =>
          current.map((model) => ({
            ...model,
            default: model.modelId === modelId,
          }))
        );
        setSuccessMessage(`OpenCode default set to ${modelId}`);
        await options.onProviderChanged?.();
      } catch (defaultError) {
        setError(
          defaultError instanceof Error ? defaultError.message : 'Failed to set OpenCode default'
        );
      } finally {
        setSavingDefaultModelId(null);
      }
    },
    [options]
  );

  const selectProvider = useCallback((providerId: string): void => {
    setSelectedProviderId(providerId);
  }, []);

  const state = useMemo<RuntimeProviderManagementState>(
    () => ({
      view,
      providers: view?.providers ?? [],
      selectedProviderId,
      providerQuery,
      activeFormProviderId,
      apiKeyValue,
      modelPickerProviderId,
      modelPickerMode,
      modelQuery,
      models,
      modelsLoading,
      modelsError,
      selectedModelId,
      testingModelId,
      savingDefaultModelId,
      modelResults,
      loading,
      savingProviderId,
      error,
      successMessage,
    }),
    [
      activeFormProviderId,
      apiKeyValue,
      error,
      loading,
      modelPickerMode,
      modelPickerProviderId,
      modelQuery,
      modelResults,
      models,
      modelsError,
      modelsLoading,
      providerQuery,
      savingDefaultModelId,
      savingProviderId,
      selectedModelId,
      selectedProviderId,
      successMessage,
      testingModelId,
      view,
    ]
  );

  const actions = useMemo<RuntimeProviderManagementActions>(
    () => ({
      refresh,
      selectProvider,
      setProviderQuery,
      startConnect,
      cancelConnect,
      setApiKeyValue,
      submitConnect,
      forgetProvider,
      openModelPicker,
      closeModelPicker,
      setModelQuery,
      selectModel: setSelectedModelId,
      useModelForNewTeams,
      testModel,
      setDefaultModel,
    }),
    [
      cancelConnect,
      closeModelPicker,
      forgetProvider,
      openModelPicker,
      refresh,
      selectProvider,
      setDefaultModel,
      startConnect,
      submitConnect,
      testModel,
      useModelForNewTeams,
    ]
  );

  return [state, actions];
}
