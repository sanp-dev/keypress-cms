// src/pages/api/logout.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  getSessionToken,
  deleteSession,
  clearSessionCookie,
} from '../../lib/auth';

export const POST: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  const token  = getSessionToken(cookie);

  if (token) {
    await deleteSession(env.SESSION, token);
  }

  return new Response(null, {
    status:  302,
    headers: {
      'Location':   '/login',
      'Set-Cookie': clearSessionCookie(),
    },
  });
};