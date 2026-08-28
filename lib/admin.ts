import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';
import { pool } from '@/lib/db';

export const ADMIN_COOKIE_NAME = 'ce_admin_session';
export const ADMIN_SESSION_SECONDS = 60 * 60 * 4;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MINUTES = 15;
const LOCK_MINUTES = 30;

function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || '';
}

function hmac(value: string) {
  const secret = sessionSecret();
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function safeEqual(aValue: string, bValue: string) {
  const a = Buffer.from(String(aValue || ''));
  const b = Buffer.from(String(bValue || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requestIp(req: NextRequest) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  return forwarded.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

function requestAgent(req: NextRequest) {
  return req.headers.get('user-agent') || 'unknown';
}

export function adminConfigured() {
  const password = process.env.ADMIN_PASSWORD || '';
  const secret = sessionSecret();
  return password.length >= 8 && secret.length >= 32;
}

export function adminConfigurationError() {
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 8) {
    return 'ADMIN_PASSWORD não configurada ou muito curta no servidor.';
  }
  if (!sessionSecret() || sessionSecret().length < 32) {
    return 'ADMIN_SESSION_SECRET não configurada. Gere uma chave aleatória com pelo menos 32 caracteres.';
  }
  return '';
}

export function validAdminPassword(input: string) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected || expected.length < 8) return false;
  return safeEqual(String(input || ''), expected);
}

export function createAdminCookieToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function adminCookieTokenHash(token: string) {
  return hmac(`session:${token}`);
}

export function isSameOriginAdminRequest(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    return originUrl.host === req.nextUrl.host;
  } catch {
    return false;
  }
}

export function requestSecurityFingerprint(req: NextRequest) {
  return {
    ipHash: hmac(`ip:${requestIp(req)}`),
    userAgentHash: hmac(`ua:${requestAgent(req)}`)
  };
}

export async function createAdminSession(req: NextRequest) {
  const token = createAdminCookieToken();
  const tokenHash = adminCookieTokenHash(token);
  const { ipHash, userAgentHash } = requestSecurityFingerprint(req);
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_SECONDS * 1000);

  const result = await pool.query(`
    INSERT INTO public.admin_sessions
      (token_hash, expires_at, ip_hash, user_agent_hash)
    VALUES ($1,$2,$3,$4)
    RETURNING id
  `, [tokenHash, expiresAt, ipHash || null, userAgentHash || null]);

  return { token, expiresAt, sessionId: Number(result.rows[0].id) };
}

export async function getValidAdminSession(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value || '';
  if (!token || !adminConfigured()) return null;

  const tokenHash = adminCookieTokenHash(token);
  const result = await pool.query(`
    UPDATE public.admin_sessions
    SET last_seen_at = NOW()
    WHERE token_hash = $1
      AND revoked_at IS NULL
      AND expires_at > NOW()
    RETURNING id, created_at, expires_at, last_seen_at
  `, [tokenHash]);

  return result.rows[0] || null;
}

export async function hasValidAdminSession(req: NextRequest) {
  return Boolean(await getValidAdminSession(req));
}

export async function revokeAdminSession(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value || '';
  if (!token || !adminConfigured()) return;
  await pool.query(`
    UPDATE public.admin_sessions
    SET revoked_at = COALESCE(revoked_at, NOW())
    WHERE token_hash = $1
  `, [adminCookieTokenHash(token)]);
}

export async function revokeAllAdminSessions() {
  await pool.query(`
    UPDATE public.admin_sessions
    SET revoked_at = COALESCE(revoked_at, NOW())
    WHERE revoked_at IS NULL
  `);
}

function loginIdentifier(req: NextRequest) {
  const { ipHash } = requestSecurityFingerprint(req);
  return ipHash || hmac('ip:unknown');
}

export async function getLoginSecurityState(req: NextRequest) {
  const identifier = loginIdentifier(req);
  const result = await pool.query(`
    SELECT failed_count, window_started_at, blocked_until
    FROM public.admin_login_attempts
    WHERE identifier_hash = $1
  `, [identifier]);

  if (!result.rowCount) {
    return { blocked: false, remainingAttempts: MAX_LOGIN_ATTEMPTS, blockedUntil: null as Date | null };
  }

  const row = result.rows[0];
  const blockedUntil = row.blocked_until ? new Date(row.blocked_until) : null;
  if (blockedUntil && blockedUntil.getTime() > Date.now()) {
    return { blocked: true, remainingAttempts: 0, blockedUntil };
  }

  const windowStarted = row.window_started_at ? new Date(row.window_started_at) : null;
  const windowExpired = !windowStarted || Date.now() - windowStarted.getTime() > LOGIN_WINDOW_MINUTES * 60_000;
  const failedCount = windowExpired ? 0 : Number(row.failed_count || 0);

  return {
    blocked: false,
    remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - failedCount),
    blockedUntil: null as Date | null
  };
}

export async function registerFailedLogin(req: NextRequest) {
  const identifier = loginIdentifier(req);
  const result = await pool.query(`
    INSERT INTO public.admin_login_attempts
      (identifier_hash, failed_count, window_started_at, blocked_until, updated_at)
    VALUES ($1, 1, NOW(), NULL, NOW())
    ON CONFLICT (identifier_hash) DO UPDATE SET
      failed_count = CASE
        WHEN public.admin_login_attempts.window_started_at < NOW() - ($2::int * INTERVAL '1 minute')
          THEN 1
        ELSE public.admin_login_attempts.failed_count + 1
      END,
      window_started_at = CASE
        WHEN public.admin_login_attempts.window_started_at < NOW() - ($2::int * INTERVAL '1 minute')
          THEN NOW()
        ELSE public.admin_login_attempts.window_started_at
      END,
      blocked_until = CASE
        WHEN (
          CASE
            WHEN public.admin_login_attempts.window_started_at < NOW() - ($2::int * INTERVAL '1 minute')
              THEN 1
            ELSE public.admin_login_attempts.failed_count + 1
          END
        ) >= $3::int
          THEN NOW() + ($4::int * INTERVAL '1 minute')
        ELSE NULL
      END,
      updated_at = NOW()
    RETURNING failed_count, blocked_until
  `, [identifier, LOGIN_WINDOW_MINUTES, MAX_LOGIN_ATTEMPTS, LOCK_MINUTES]);

  const row = result.rows[0];
  const blockedUntil = row.blocked_until ? new Date(row.blocked_until) : null;
  const failedCount = Number(row.failed_count || 0);
  return {
    blocked: Boolean(blockedUntil && blockedUntil.getTime() > Date.now()),
    remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - failedCount),
    blockedUntil
  };
}

export async function clearFailedLogins(req: NextRequest) {
  await pool.query(`DELETE FROM public.admin_login_attempts WHERE identifier_hash=$1`, [loginIdentifier(req)]);
}

export async function cleanupAdminSecurityData() {
  await pool.query(`DELETE FROM public.admin_login_attempts WHERE updated_at < NOW() - INTERVAL '7 days'`);
  await pool.query(`DELETE FROM public.admin_sessions WHERE expires_at < NOW() - INTERVAL '7 days' OR revoked_at < NOW() - INTERVAL '7 days'`);
}
