// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { getSessionToken, getSession } from './lib/auth';

// Paths that bypass authentication checks
const PUBLIC_PATHS = new Set([
  '/login',
  '/api/login',
  '/api/logout',
  '/api/run-scheduled-notifications',
]);

// Apply security headers to every response
function applySecurityHeaders(res: Response): Response {
  res.headers.set(
    'X-Robots-Tag',
    'noindex, nofollow, noarchive, nosnippet, noimageindex'
  );
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'same-origin');
  res.headers.set(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()'
  );
  res.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  );
  return res;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Static assets — bypass auth checks
  if (
    pathname.startsWith('/_astro/') ||
    pathname.startsWith('/authors/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    /\.(css|js|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot)$/i.test(pathname)
  ) {
    return await next();
  }

  // Public paths
  if (PUBLIC_PATHS.has(pathname)) {
    // If already logged in, skip /login
    if (pathname === '/login') {
      const cookie = context.request.headers.get('cookie');
      const token  = getSessionToken(cookie);
      if (token) {
        const session = await getSession(env.SESSION, token);
        if (session) return context.redirect('/');
      }
    }
    const res = await next();
    return applySecurityHeaders(res);
  }

  // Protected paths — session check
  const cookie = context.request.headers.get('cookie');
  const token  = getSessionToken(cookie);

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return applySecurityHeaders(
        new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status:  401,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
    return context.redirect('/login');
  }

  const session = await getSession(env.SESSION, token);

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return applySecurityHeaders(
        new Response(JSON.stringify({ error: 'Session expired' }), {
          status:  401,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
    return context.redirect('/login');
  }

  // Valid session — store user data in locals
  context.locals.user = {
    email: session.email,
    role:  session.role,
  };

  const res = await next();
  return applySecurityHeaders(res);
});