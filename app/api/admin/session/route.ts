import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_SECONDS,
  adminConfigured,
  adminConfigurationError,
  cleanupAdminSecurityData,
  clearFailedLogins,
  createAdminSession,
  getLoginSecurityState,
  getValidAdminSession,
  isSameOriginAdminRequest,
  registerFailedLogin,
  revokeAdminSession,
  revokeAllAdminSessions,
  validAdminPassword
} from '@/lib/admin';
import { writeAdminAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
    priority: 'high' as const
  };
}

function retryAfterSeconds(date: Date | null) {
  if (!date) return 0;
  return Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000));
}

export async function GET(req: NextRequest) {
  const configured = adminConfigured();
  if (!configured) {
    return NextResponse.json({
      configured: false,
      authenticated: false,
      configurationError: adminConfigurationError()
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const session = await getValidAdminSession(req);
  return NextResponse.json({
    configured: true,
    authenticated: Boolean(session),
    expiresAt: session?.expires_at || null
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  if (!isSameOriginAdminRequest(req)) {
    return NextResponse.json({ error: 'Origem da solicitação administrativa não autorizada.' }, { status: 403 });
  }

  if (!adminConfigured()) {
    return NextResponse.json({ error: adminConfigurationError() }, { status: 503 });
  }

  const state = await getLoginSecurityState(req);
  if (state.blocked) {
    const seconds = retryAfterSeconds(state.blockedUntil);
    await writeAdminAudit({
      action: 'admin.login.failed',
      summary: 'Tentativa de login durante bloqueio temporário.',
      details: { blocked: true, retryAfterSeconds: seconds }
    });
    return NextResponse.json({
      error: 'Muitas tentativas incorretas. O acesso administrativo foi temporariamente bloqueado.',
      blockedUntil: state.blockedUntil?.toISOString() || null,
      retryAfterSeconds: seconds
    }, { status: 429, headers: { 'Retry-After': String(seconds) } });
  }

  const body = await req.json().catch(() => ({}));
  if (!validAdminPassword(String(body.password || ''))) {
    const failure = await registerFailedLogin(req);
    await writeAdminAudit({
      action: 'admin.login.failed',
      summary: failure.blocked ? 'Tentativa de login inválida; limite atingido.' : 'Tentativa de login administrativa inválida.',
      details: { blocked: failure.blocked, remainingAttempts: failure.remainingAttempts }
    });
    if (failure.blocked) {
      const seconds = retryAfterSeconds(failure.blockedUntil);
      return NextResponse.json({
        error: 'Senha inválida. O limite de tentativas foi atingido e o acesso foi bloqueado temporariamente.',
        blockedUntil: failure.blockedUntil?.toISOString() || null,
        retryAfterSeconds: seconds,
        remainingAttempts: 0
      }, { status: 429, headers: { 'Retry-After': String(seconds) } });
    }

    return NextResponse.json({
      error: 'Senha administrativa inválida.',
      remainingAttempts: failure.remainingAttempts
    }, { status: 401 });
  }

  await clearFailedLogins(req);
  await cleanupAdminSecurityData().catch(() => {});
  const session = await createAdminSession(req);
  await writeAdminAudit({
    sessionId: session.sessionId,
    action: 'admin.login.success',
    entityType: 'admin_session',
    entityId: session.sessionId,
    summary: 'Login administrativo realizado com sucesso.',
    details: { expiresAt: session.expiresAt.toISOString() }
  });

  const response = NextResponse.json({
    ok: true,
    authenticated: true,
    expiresAt: session.expiresAt.toISOString()
  });
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set(ADMIN_COOKIE_NAME, session.token, cookieOptions(ADMIN_SESSION_SECONDS));
  return response;
}

export async function DELETE(req: NextRequest) {
  if (!isSameOriginAdminRequest(req)) {
    return NextResponse.json({ error: 'Origem da solicitação administrativa não autorizada.' }, { status: 403 });
  }

  const all = req.nextUrl.searchParams.get('all') === '1';
  const currentSession = await getValidAdminSession(req);

  if (all) {
    if (!currentSession) {
      return NextResponse.json({ error: 'Sessão administrativa inválida ou expirada.' }, { status: 401 });
    }
    await writeAdminAudit({
      sessionId: Number(currentSession.id),
      action: 'admin.logout_all',
      entityType: 'admin_session',
      entityId: Number(currentSession.id),
      summary: 'Todas as sessões administrativas ativas foram encerradas.'
    });
    await revokeAllAdminSessions();
  } else {
    if (currentSession) {
      await writeAdminAudit({
        sessionId: Number(currentSession.id),
        action: 'admin.logout',
        entityType: 'admin_session',
        entityId: Number(currentSession.id),
        summary: 'Sessão administrativa encerrada.'
      });
    }
    await revokeAdminSession(req);
  }

  const response = NextResponse.json({ ok: true, authenticated: false, allRevoked: all });
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set(ADMIN_COOKIE_NAME, '', cookieOptions(0));
  return response;
}
