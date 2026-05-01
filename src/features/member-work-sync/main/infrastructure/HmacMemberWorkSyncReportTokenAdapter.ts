import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';

import { atomicWriteAsync } from '@main/utils/atomicWrite';

import type {
  MemberWorkSyncReportTokenCreateInput,
  MemberWorkSyncReportTokenPort,
  MemberWorkSyncReportTokenVerification,
  MemberWorkSyncReportTokenVerifyInput,
} from '../../core/application';
import type { MemberWorkSyncStorePaths } from './MemberWorkSyncStorePaths';

const TOKEN_PREFIX = 'wrs:v1';
const TOKEN_TTL_MS = 15 * 60 * 1000;

interface SecretFile {
  schemaVersion: 1;
  secret: string;
}

interface TokenPayload {
  version: 1;
  teamName: string;
  memberName: string;
  agendaFingerprint: string;
  expiresAt: string;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function isSecretFile(value: unknown): value is SecretFile {
  return (
    value != null &&
    typeof value === 'object' &&
    (value as SecretFile).schemaVersion === 1 &&
    typeof (value as SecretFile).secret === 'string' &&
    (value as SecretFile).secret.length >= 32
  );
}

function isTokenPayload(value: unknown): value is TokenPayload {
  return (
    value != null &&
    typeof value === 'object' &&
    (value as TokenPayload).version === 1 &&
    typeof (value as TokenPayload).teamName === 'string' &&
    typeof (value as TokenPayload).memberName === 'string' &&
    typeof (value as TokenPayload).agendaFingerprint === 'string' &&
    typeof (value as TokenPayload).expiresAt === 'string'
  );
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export class HmacMemberWorkSyncReportTokenAdapter implements MemberWorkSyncReportTokenPort {
  private readonly secretCache = new Map<string, Promise<string>>();

  constructor(private readonly paths: MemberWorkSyncStorePaths) {}

  async create(input: MemberWorkSyncReportTokenCreateInput): Promise<{
    token: string;
    expiresAt: string;
  }> {
    const expiresAt = new Date(Date.parse(input.issuedAt) + TOKEN_TTL_MS).toISOString();
    const payload: TokenPayload = {
      version: 1,
      teamName: input.teamName,
      memberName: input.memberName,
      agendaFingerprint: input.agendaFingerprint,
      expiresAt,
    };
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = await this.sign(input.teamName, encodedPayload);
    return {
      token: `${TOKEN_PREFIX}.${encodedPayload}.${signature}`,
      expiresAt,
    };
  }

  async verify(
    input: MemberWorkSyncReportTokenVerifyInput
  ): Promise<MemberWorkSyncReportTokenVerification> {
    if (!input.token) {
      return { ok: false, reason: 'missing' };
    }

    const [prefix, encodedPayload, signature, extra] = input.token.split('.');
    if (prefix !== TOKEN_PREFIX || !encodedPayload || !signature || extra) {
      return { ok: false, reason: 'invalid' };
    }

    const expectedSignature = await this.sign(input.teamName, encodedPayload);
    if (!safeEqual(signature, expectedSignature)) {
      return { ok: false, reason: 'invalid' };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(base64UrlDecode(encodedPayload));
    } catch {
      return { ok: false, reason: 'invalid' };
    }
    if (!isTokenPayload(payload)) {
      return { ok: false, reason: 'invalid' };
    }
    if (
      payload.teamName !== input.teamName ||
      payload.memberName !== input.memberName ||
      payload.agendaFingerprint !== input.agendaFingerprint
    ) {
      return { ok: false, reason: 'invalid' };
    }
    if (Date.parse(payload.expiresAt) <= Date.parse(input.nowIso)) {
      return { ok: false, reason: 'expired' };
    }

    return { ok: true };
  }

  private async sign(teamName: string, encodedPayload: string): Promise<string> {
    const secret = await this.getSecret(teamName);
    return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  }

  private async getSecret(teamName: string): Promise<string> {
    const existing = this.secretCache.get(teamName);
    if (existing) {
      return existing;
    }

    const next = this.loadOrCreateSecret(teamName);
    this.secretCache.set(teamName, next);
    return next;
  }

  private async loadOrCreateSecret(teamName: string): Promise<string> {
    try {
      const raw = await readFile(this.paths.getReportTokenSecretPath(teamName), 'utf8');
      const parsed = JSON.parse(raw);
      if (isSecretFile(parsed)) {
        return parsed.secret;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const secretFile: SecretFile = {
      schemaVersion: 1,
      secret: randomBytes(32).toString('base64url'),
    };
    await mkdir(this.paths.getTeamDir(teamName), { recursive: true });
    await atomicWriteAsync(
      this.paths.getReportTokenSecretPath(teamName),
      JSON.stringify(secretFile, null, 2)
    );
    return secretFile.secret;
  }
}
