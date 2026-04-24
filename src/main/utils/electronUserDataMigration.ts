import * as fs from 'fs';
import * as path from 'path';

const LEGACY_USER_DATA_DIR_NAMES = [
  'Claude Agent Teams UI',
  'claude-agent-teams-ui',
  'claude-devtools',
  'claude-code-context',
] as const;

export interface ElectronUserDataMigrationApp {
  getPath(name: string): string;
  setPath?(name: string, value: string): void;
}

export interface ElectronUserDataMigrationResult {
  currentPath: string | null;
  legacyPath: string | null;
  migrated: boolean;
  fallbackToLegacy: boolean;
  reason:
    | 'migrated'
    | 'current-populated'
    | 'current-path-exists'
    | 'legacy-missing'
    | 'legacy-fallback'
    | 'error';
}

interface LoggerLike {
  info(message: string): void;
  warn(message: string): void;
}

interface ElectronUserDataMigrationOptions {
  logger?: LoggerLike;
  copyDirectory?: (sourcePath: string, targetPath: string) => void;
}

export function getLegacyElectronUserDataCandidates(currentPath: string): string[] {
  const parent = path.dirname(currentPath);
  const normalizedCurrent = path.resolve(currentPath);

  return LEGACY_USER_DATA_DIR_NAMES.map((dirName) => path.join(parent, dirName)).filter(
    (legacyPath) => path.resolve(legacyPath) !== normalizedCurrent
  );
}

export function migrateElectronUserDataDirectory(
  app: ElectronUserDataMigrationApp,
  options: ElectronUserDataMigrationOptions = {}
): ElectronUserDataMigrationResult {
  const logger = options.logger;
  let currentPath: string;

  try {
    currentPath = app.getPath('userData');
  } catch (error) {
    logger?.warn(`Electron userData migration skipped: ${stringifyError(error)}`);
    return {
      currentPath: null,
      legacyPath: null,
      migrated: false,
      fallbackToLegacy: false,
      reason: 'error',
    };
  }

  if (directoryExists(currentPath) && directoryHasEntries(currentPath)) {
    return {
      currentPath,
      legacyPath: null,
      migrated: false,
      fallbackToLegacy: false,
      reason: 'current-populated',
    };
  }

  if (pathExists(currentPath) && !directoryExists(currentPath)) {
    logger?.warn(`Electron userData migration skipped: current path is not a directory`);
    return {
      currentPath,
      legacyPath: null,
      migrated: false,
      fallbackToLegacy: false,
      reason: 'current-path-exists',
    };
  }

  const legacyPath = selectLegacyElectronUserDataPath(currentPath);
  if (!legacyPath) {
    return {
      currentPath,
      legacyPath: null,
      migrated: false,
      fallbackToLegacy: false,
      reason: 'legacy-missing',
    };
  }

  const migrated = copyLegacyUserDataDirectory(
    legacyPath,
    currentPath,
    logger,
    options.copyDirectory
  );
  if (migrated) {
    logger?.info(`Migrated Electron userData from ${legacyPath} to ${currentPath}`);
    return {
      currentPath,
      legacyPath,
      migrated: true,
      fallbackToLegacy: false,
      reason: 'migrated',
    };
  }

  if (directoryExists(currentPath) && directoryHasEntries(currentPath)) {
    return {
      currentPath,
      legacyPath: null,
      migrated: false,
      fallbackToLegacy: false,
      reason: 'current-populated',
    };
  }

  try {
    setLegacyElectronPaths(app, legacyPath, logger);
    logger?.warn(`Electron userData migration failed, using legacy path for this run`);
    return {
      currentPath,
      legacyPath,
      migrated: false,
      fallbackToLegacy: true,
      reason: 'legacy-fallback',
    };
  } catch (error) {
    logger?.warn(`Electron userData legacy fallback failed: ${stringifyError(error)}`);
    return {
      currentPath,
      legacyPath,
      migrated: false,
      fallbackToLegacy: false,
      reason: 'error',
    };
  }
}

function selectLegacyElectronUserDataPath(currentPath: string): string | null {
  const candidates = getLegacyElectronUserDataCandidates(currentPath).filter(directoryExists);
  return (
    candidates.find((candidatePath) => directoryHasEntries(candidatePath)) ?? candidates[0] ?? null
  );
}

function setLegacyElectronPaths(
  app: ElectronUserDataMigrationApp,
  legacyPath: string,
  logger?: LoggerLike
): void {
  app.setPath?.('userData', legacyPath);
  try {
    app.setPath?.('sessionData', legacyPath);
  } catch (error) {
    logger?.warn(`Electron sessionData legacy fallback failed: ${stringifyError(error)}`);
  }
}

function copyLegacyUserDataDirectory(
  legacyPath: string,
  currentPath: string,
  logger?: LoggerLike,
  copyDirectory: (sourcePath: string, targetPath: string) => void = copyDirectorySync
): boolean {
  const parent = path.dirname(currentPath);
  const tempPath = path.join(
    parent,
    `${path.basename(currentPath)}.migrating-${process.pid}-${Date.now()}`
  );

  try {
    fs.mkdirSync(parent, { recursive: true });

    if (pathExists(tempPath)) {
      fs.rmSync(tempPath, { recursive: true, force: true });
    }

    copyDirectory(legacyPath, tempPath);

    if (directoryExists(currentPath) && !directoryHasEntries(currentPath)) {
      fs.rmdirSync(currentPath);
    }

    fs.renameSync(tempPath, currentPath);
    return true;
  } catch (error) {
    logger?.warn(`Electron userData migration copy failed: ${stringifyError(error)}`);
    try {
      if (pathExists(tempPath)) {
        fs.rmSync(tempPath, { recursive: true, force: true });
      }
    } catch {
      // Best effort cleanup only.
    }
    return false;
  }
}

function copyDirectorySync(sourcePath: string, targetPath: string): void {
  fs.cpSync(sourcePath, targetPath, {
    recursive: true,
    errorOnExist: false,
    force: false,
  });
}

function pathExists(targetPath: string): boolean {
  try {
    fs.accessSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

function directoryExists(targetPath: string): boolean {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function directoryHasEntries(targetPath: string): boolean {
  try {
    return fs.readdirSync(targetPath).length > 0;
  } catch {
    return false;
  }
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
