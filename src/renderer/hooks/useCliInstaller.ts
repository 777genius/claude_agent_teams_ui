/**
 * useCliInstaller — shared hook for CLI installer state.
 *
 * Centralizes all store selectors and computed state for CLI installation.
 * Used by both CliStatusBanner (Dashboard) and CliStatusSection (Settings).
 */

import { useStore } from '@renderer/store';
import { useShallow } from 'zustand/react/shallow';

import type { CliInstallationStatus, CliProviderId } from '@shared/types';

export function useCliInstaller(): {
  cliStatus: CliInstallationStatus | null;
  cliStatusLoading: boolean;
  cliProviderStatusLoading: Partial<Record<CliProviderId, boolean>>;
  cliStatusError: string | null;
  installerState:
    | 'idle'
    | 'checking'
    | 'downloading'
    | 'verifying'
    | 'installing'
    | 'completed'
    | 'error';
  downloadProgress: number;
  downloadTransferred: number;
  downloadTotal: number;
  installerError: string | null;
  installerDetail: string | null;
  installerRawChunks: string[];
  completedVersion: string | null;
  bootstrapCliStatus: (options?: { multimodelEnabled?: boolean }) => Promise<void>;
  fetchCliStatus: () => Promise<void>;
  fetchCliProviderStatus: (
    providerId: CliProviderId,
    options?: { silent?: boolean; epoch?: number; verifyModels?: boolean }
  ) => Promise<void>;
  invalidateCliStatus: () => Promise<void>;
  installCli: () => void;
  isBusy: boolean;
} {
  const {
    cliStatus,
    cliStatusLoading,
    cliProviderStatusLoading,
    cliStatusError,
    installerState,
    downloadProgress,
    downloadTransferred,
    downloadTotal,
    installerError,
    installerDetail,
    installerRawChunks,
    completedVersion,
    bootstrapCliStatus,
    fetchCliStatus,
    fetchCliProviderStatus,
    invalidateCliStatus,
    installCli,
  } = useStore(
    useShallow((s) => ({
      cliStatus: s.cliStatus,
      cliStatusLoading: s.cliStatusLoading,
      cliProviderStatusLoading: s.cliProviderStatusLoading,
      cliStatusError: s.cliStatusError,
      installerState: s.cliInstallerState,
      downloadProgress: s.cliDownloadProgress,
      downloadTransferred: s.cliDownloadTransferred,
      downloadTotal: s.cliDownloadTotal,
      installerError: s.cliInstallerError,
      installerDetail: s.cliInstallerDetail,
      installerRawChunks: s.cliInstallerRawChunks,
      completedVersion: s.cliCompletedVersion,
      bootstrapCliStatus: s.bootstrapCliStatus,
      fetchCliStatus: s.fetchCliStatus,
      fetchCliProviderStatus: s.fetchCliProviderStatus,
      invalidateCliStatus: s.invalidateCliStatus,
      installCli: s.installCli,
    }))
  );

  const isBusy =
    installerState !== 'idle' && installerState !== 'error' && installerState !== 'completed';

  return {
    cliStatus,
    cliStatusLoading,
    cliProviderStatusLoading,
    cliStatusError,
    installerState,
    downloadProgress,
    downloadTransferred,
    downloadTotal,
    installerError,
    installerDetail,
    installerRawChunks,
    completedVersion,
    bootstrapCliStatus,
    fetchCliStatus,
    fetchCliProviderStatus,
    invalidateCliStatus,
    installCli,
    isBusy,
  };
}
