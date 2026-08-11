// src/pages/api/login.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  verifyUser,
  createSession,
  createSessionCookie,
  checkRateLimit,
  incrementRateLimit,
  clearRateLimit,
} from '../../lib/auth';

export const POST: APIRoute = async ({ request }) => {
  try {
    const ip  = request.headers.get('CF-Connecting-IP') ?? 'unknown';

    // ── Binding sanity checks ─────────────────────────────────────────────────
    if (!env.SESSION) {
      console.error('[login] SESSION KV binding missing on this Worker.');
      return json({ error: 'Server config error: SESSION binding missing.' }, 500);
    }
    if (!env.USERS_JSON) {
      console.error('[login] USERS_JSON secret missing on this Worker.');
      return json({ error: 'Server config error: USERS_JSON secret missing.' }, 500);
    }

    // ── Rate limit check ───────────────────────────────────────────────────────
    const allowed = await checkRateLimit(env.SESSION, ip);
    if (!allowed) {
      return json(
        { error: 'Too many failed attempts. Please try again after 15 minutes.' },
        429
      );
    }

    // ── Body parse ─────────────────────────────────────────────────────────────
    let email: string, password: string;
    try {
      const body = await request.json() as { email?: string; password?: string };
      email    = (body.email    ?? '').trim();
      password = (body.password ?? '').trim();
    } catch {
      return json({ error: 'Invalid request.' }, 400);
    }

    if (!email || !password) {
      return json({ error: 'Email and password are required.' }, 400);
    }

    // ── Credential verify ──────────────────────────────────────────────────────
    const user = await verifyUser(env.USERS_JSON, email, password);

    if (!user) {
      await incrementRateLimit(env.SESSION, ip);
      return json({ error: 'Invalid email or password.' }, 401);
    }

    // ── Session create ─────────────────────────────────────────────────────────
    await clearRateLimit(env.SESSION, ip);
    const token  = await createSession(env.SESSION, user.email, user.role);
    const cookie = createSessionCookie(token);

    return json({ success: true, role: user.role }, 200, {
      'Set-Cookie': cookie,
    });
  } catch (err) {
    console.error('[login] Unhandled error:', err);
    return json({ error: 'Internal server error. Please try again.' }, 500);
  }
};

function json(
  body:         Record<string, unknown>,
  status:       number,
  extraHeaders: Record<string, string> = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}