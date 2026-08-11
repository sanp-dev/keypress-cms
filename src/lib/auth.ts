// src/lib/auth.ts

export type UserRole = 'admin' | 'assistant';

export interface SessionData {
  email:     string;
  role:      UserRole;
  createdAt: number;
}

export interface UserConfig {
  email: string;
  hash:  string;
  role:  UserRole;
}

// ─── Constants ─────────────────────────────────────────────────────────────
const COOKIE_NAME  = 'qd_session';
const SESSION_TTL  = 60 * 60 * 12;   // 12 hours (seconds)
const MAX_ATTEMPTS = 5;
const LOCKOUT_TTL  = 60 * 15;        // 15 minutes (seconds)

// ─── Password Verify (Web Crypto — Cloudflare Workers native) ──────────────
export async function verifyPassword(
  password:   string,
  storedHash: string
): Promise<boolean> {
  try {
    const [saltHex, hashHex] = storedHash.split(':');
    if (!saltHex || !hashHex) return false;

    const salt      = hexToUint8(saltHex);
    const encoder   = new TextEncoder();

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
      keyMaterial,
      256
    );

    const computed = uint8ToHex(new Uint8Array(bits));
    return timingSafeEqual(computed, hashHex);
  } catch {
    return false;
  }
}

// ─── User Verify ───────────────────────────────────────────────────────────
export async function verifyUser(
  usersJson: string,
  email:     string,
  password:  string
): Promise<{ email: string; role: UserRole } | null> {
  let users: UserConfig[];
  try {
    const parsed = JSON.parse(usersJson);
    if (!Array.isArray(parsed)) {
      console.error('[verifyUser] USERS_JSON parsed but is not an array:', typeof parsed);
      return null;
    }
    users = parsed;
  } catch (err) {
    console.error('[verifyUser] USERS_JSON failed to parse:', err);
    return null;
  }

  const user = users.find(
    (u) => u && typeof u.email === 'string' &&
           u.email.toLowerCase() === email.trim().toLowerCase()
  );
  if (!user) return null;

  const valid = await verifyPassword(password, user.hash);
  if (!valid) return null;

  return { email: user.email, role: user.role };
}

// ─── Session — Create ──────────────────────────────────────────────────────
export async function createSession(
  kv:    KVNamespace,
  email: string,
  role:  UserRole
): Promise<string> {
  const rawBytes = new Uint8Array(32);
  crypto.getRandomValues(rawBytes);
  const token = uint8ToHex(rawBytes); // 64-char hex

  const sessionData: SessionData = {
    email,
    role,
    createdAt: Date.now(),
  };

  const ttl = email.toLowerCase() === 'admin@example.com' ? 60 * 10 : SESSION_TTL;
  await kv.put(
    `session:${email}:${token}`,
    JSON.stringify(sessionData),
    { expirationTtl: ttl }
  );

  return token;
}

// ─── Session — Get ─────────────────────────────────────────────────────────
export async function getSession(
  kv:    KVNamespace,
  token: string
): Promise<SessionData | null> {
  if (!token || token.length !== 64 || !/^[0-9a-f]+$/.test(token)) {
    return null;
  }

  const list = await kv.list({ prefix: 'session:' });
  const key  = list.keys.find((k) => k.name.endsWith(`:${token}`));
  if (!key) return null;

  const data = await kv.get(key.name);
  if (!data) return null;

  try {
    return JSON.parse(data) as SessionData;
  } catch {
    return null;
  }
}

// ─── Session — Delete ──────────────────────────────────────────────────────
export async function deleteSession(
  kv:    KVNamespace,
  token: string
): Promise<void> {
  if (!token) return;
  const list = await kv.list({ prefix: 'session:' });
  const key  = list.keys.find((k) => k.name.endsWith(`:${token}`));
  if (key) await kv.delete(key.name);
}

// ─── Rate Limiting ─────────────────────────────────────────────────────────
export async function checkRateLimit(
  kv: KVNamespace,
  ip: string
): Promise<boolean> {
  const data = await kv.get(`ratelimit:${ip}`);
  if (!data) return true;
  return parseInt(data, 10) < MAX_ATTEMPTS;
}

export async function incrementRateLimit(
  kv: KVNamespace,
  ip: string
): Promise<void> {
  const data  = await kv.get(`ratelimit:${ip}`);
  const count = data ? parseInt(data, 10) + 1 : 1;
  await kv.put(`ratelimit:${ip}`, count.toString(), {
    expirationTtl: LOCKOUT_TTL,
  });
}

export async function clearRateLimit(
  kv: KVNamespace,
  ip: string
): Promise<void> {
  await kv.delete(`ratelimit:${ip}`);
}

// ─── Cookie Helpers ────────────────────────────────────────────────────────
export function createSessionCookie(token: string, isDemo: boolean = false): string {
  const age = isDemo ? 60 * 10 : SESSION_TTL;
  return `${COOKIE_NAME}=${token}; Max-Age=${age}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function getSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([0-9a-f]{64})`)
  );
  return match ? match[1] : null;
}

// ─── Internal Helpers ──────────────────────────────────────────────────────
function hexToUint8(hex: string): Uint8Array {
  const bytes = hex.match(/.{2}/g) ?? [];
  return new Uint8Array(bytes.map((b) => parseInt(b, 16)));
}

function uint8ToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}