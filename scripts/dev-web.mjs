#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const standalonePort = process.env.STANDALONE_PORT?.trim() || '3456';
const webPort = process.env.WEB_PORT?.trim() || '5174';
const corsOrigin =
  process.env.CORS_ORIGIN?.trim() ||
  `http://127.0.0.1:${webPort},http://localhost:${webPort}`;

const WINDOWS_SHELL_COMMANDS = new Set(['pnpm', 'npm', 'npx', 'yarn', 'yarnpkg', 'corepack']);

function shouldUseWindowsShell(cmd) {
  if (process.platform !== 'win32') {
    return false;
  }

  return WINDOWS_SHELL_COMMANDS.has(path.basename(cmd).toLowerCase());
}

function spawnProcess(cmd, args, env) {
  return spawn(cmd, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: shouldUseWindowsShell(cmd),
  });
}

const backend = spawnProcess('pnpm', ['exec', 'tsx', 'src/main/standalone.ts'], {
  HOST: process.env.HOST?.trim() || '127.0.0.1',
  PORT: standalonePort,
  CORS_ORIGIN: corsOrigin,
});

const frontend = spawnProcess(
  'pnpm',
  ['exec', 'vite', '--config', 'vite.web.config.ts', '--host', '127.0.0.1', '--port', webPort],
  {
    VITE_STANDALONE_PORT: standalonePort,
    VITE_WEB_PORT: webPort,
  }
);

let shuttingDown = false;

function terminateChildren(signal = 'SIGTERM') {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  backend.kill(signal);
  frontend.kill(signal);
}

backend.on('exit', (code, signal) => {
  terminateChildren(signal ?? undefined);
  process.exitCode = code ?? (signal ? 1 : 0);
});

frontend.on('exit', (code, signal) => {
  terminateChildren(signal ?? undefined);
  process.exitCode = code ?? (signal ? 1 : 0);
});

process.on('SIGINT', () => terminateChildren('SIGINT'));
process.on('SIGTERM', () => terminateChildren('SIGTERM'));

console.log(`Starting standalone backend on http://127.0.0.1:${standalonePort}`);
console.log(`Starting browser dev server on http://127.0.0.1:${webPort}`);
