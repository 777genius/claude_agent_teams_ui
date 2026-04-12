export type TmuxPlatform = 'darwin' | 'linux' | 'win32' | 'unknown';

export interface TmuxStatus {
  available: boolean;
  version: string | null;
  binaryPath: string | null;
  platform: TmuxPlatform;
  nativeSupported: boolean;
  checkedAt: string;
  error: string | null;
}

export interface TmuxAPI {
  getStatus: () => Promise<TmuxStatus>;
}
