const fs = require('fs');
const path = require('path');
const runtimeHelpers = require('./runtimeHelpers.js');

const DEFAULT_WAIT_TIMEOUT_MS = 10000;
const MIN_WAIT_TIMEOUT_MS = 1000;
const MAX_WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const TEAM_CONTROL_API_STATE_FILE = 'team-control-api.json';

function normalizeTimeoutMs(rawValue) {
  const numeric =
    typeof rawValue === 'number' && Number.isFinite(rawValue)
      ? Math.floor(rawValue)
      : DEFAULT_WAIT_TIMEOUT_MS;
  return Math.min(MAX_WAIT_TIMEOUT_MS, Math.max(MIN_WAIT_TIMEOUT_MS, numeric));
}

function readControlApiState(context) {
  const filePath = path.join(context.claudeDir, TEAM_CONTROL_API_STATE_FILE);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed?.baseUrl === 'string' && parsed.baseUrl.trim()
      ? parsed.baseUrl.trim()
      : '';
  } catch {
    return '';
  }
}

function resolveControlBaseUrls(context, flags = {}) {
  const explicit =
    (typeof flags.controlUrl === 'string' && flags.controlUrl.trim()) ||
    (typeof flags['control-url'] === 'string' && flags['control-url'].trim()) ||
    '';
  const stateFileUrl = readControlApiState(context);
  const envUrl =
    typeof process.env.CLAUDE_TEAM_CONTROL_URL === 'string'
      ? process.env.CLAUDE_TEAM_CONTROL_URL.trim()
      : '';
  const candidates = [...new Set([explicit, stateFileUrl, envUrl].filter(Boolean))];
  if (candidates.length === 0) {
    throw new Error(
      'Team control API is unavailable. Start the desktop app team runtime first so it can validate member work sync reports.'
    );
  }
  return candidates;
}

async function requestJson(baseUrl, pathname, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), normalizeTimeoutMs(options.timeoutMs));
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      method: options.method || 'GET',
      headers: {
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail =
        payload && typeof payload.error === 'string' && payload.error.trim()
          ? payload.error.trim()
          : `${response.status} ${response.statusText}`.trim();
      throw new Error(detail || 'Team control API request failed');
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function requestJsonWithFallback(baseUrls, pathname, options = {}) {
  let lastError = null;
  for (const baseUrl of baseUrls) {
    try {
      return await requestJson(baseUrl, pathname, options);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Team control API request failed');
}

function compactReportBody(context, memberName, flags = {}) {
  return {
    teamName: context.teamName,
    memberName,
    state: flags.state,
    agendaFingerprint: flags.agendaFingerprint || flags['agenda-fingerprint'],
    ...(Array.isArray(flags.taskIds) ? { taskIds: flags.taskIds } : {}),
    ...(Array.isArray(flags['task-ids']) ? { taskIds: flags['task-ids'] } : {}),
    ...(typeof flags.note === 'string' && flags.note.trim() ? { note: flags.note.trim() } : {}),
    ...(typeof flags.reportedAt === 'string' && flags.reportedAt.trim()
      ? { reportedAt: flags.reportedAt.trim() }
      : {}),
    ...(typeof flags.leaseTtlMs === 'number' ? { leaseTtlMs: flags.leaseTtlMs } : {}),
  };
}

async function memberWorkSyncStatus(context, flags = {}) {
  const memberName = runtimeHelpers.assertExplicitTeamMemberName(
    context.paths,
    flags.memberName || flags.member || flags.from,
    'member work sync status member'
  );
  const baseUrls = resolveControlBaseUrls(context, flags);
  return requestJsonWithFallback(
    baseUrls,
    `/api/teams/${encodeURIComponent(context.teamName)}/member-work-sync/${encodeURIComponent(
      memberName
    )}`,
    { timeoutMs: normalizeTimeoutMs(flags.waitTimeoutMs || flags['wait-timeout-ms']) }
  );
}

async function memberWorkSyncReport(context, flags = {}) {
  const memberName = runtimeHelpers.assertExplicitTeamMemberName(
    context.paths,
    flags.memberName || flags.member || flags.from,
    'member work sync report member'
  );
  const baseUrls = resolveControlBaseUrls(context, flags);
  return requestJsonWithFallback(
    baseUrls,
    `/api/teams/${encodeURIComponent(context.teamName)}/member-work-sync/report`,
    {
      method: 'POST',
      body: compactReportBody(context, memberName, flags),
      timeoutMs: normalizeTimeoutMs(flags.waitTimeoutMs || flags['wait-timeout-ms']),
    }
  );
}

module.exports = {
  memberWorkSyncStatus,
  memberWorkSyncReport,
};
