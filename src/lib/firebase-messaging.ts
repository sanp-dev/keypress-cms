// src/lib/firebase-messaging.ts
// Firebase Cloud Messaging v1 API integration — zero npm dependencies
// Uses Web Crypto API for JWT signing (Cloudflare Workers compatible)

export interface NotificationPayload {
  title: string;
  body: string;
  image?: string;
  icon?: string;
  click_action: string;
}

export interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'cleanup';
  message: string;
}

export interface SendResult {
  totalTokens: number;
  sent: number;
  failed: number;
  cleaned: number;
  logs: LogEntry[];
}

interface ServiceAccount {
  project_id: string;
  private_key: string;
  client_email: string;
}

// ─── Base64URL helpers ─────────────────────────────────────────────────────────
function base64UrlEncode(input: string | ArrayBuffer): string {
  let base64: string;
  if (typeof input === 'string') {
    // Convert string to base64 (ASCII-safe)
    base64 = btoa(input);
  } else {
    const bytes = new Uint8Array(input);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    base64 = btoa(binary);
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─── PEM → CryptoKey (Web Crypto API) ──────────────────────────────────────────
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContent = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const binaryString = atob(pemContent);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

// ─── Generate OAuth2 Access Token from Service Account ─────────────────────────
async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa: ServiceAccount = JSON.parse(serviceAccountJson);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${base64UrlEncode(signature)}`;

  // Exchange JWT for Google OAuth2 access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`OAuth2 token exchange failed (${tokenRes.status}): ${errText}`);
  }

  const tokenData: any = await tokenRes.json();
  return tokenData.access_token;
}

// ─── Send push notification to all active subscribers ──────────────────────────
export async function sendPushToAll(
  db: D1Database,
  serviceAccountJson: string,
  payload: NotificationPayload
): Promise<SendResult> {
  const logs: LogEntry[] = [];
  const log = (type: LogEntry['type'], message: string) => {
    logs.push({ timestamp: new Date().toISOString(), type, message });
  };

  // 1. Generate Firebase access token
  log('info', 'Generating Firebase OAuth2 access token...');
  let accessToken: string;
  try {
    accessToken = await getAccessToken(serviceAccountJson);
    log('success', 'Access token generated successfully');
  } catch (err: any) {
    log('error', `Access token generation failed: ${err.message}`);
    return { totalTokens: 0, sent: 0, failed: 0, cleaned: 0, logs };
  }

  // 2. Fetch all tokens from D1
  log('info', 'Fetching subscriber tokens from D1 database...');
  let tokens: string[] = [];
  try {
    const result = await db.prepare('SELECT token FROM push_subscribers').all();
    tokens = (result.results || []).map((row: any) => row.token).filter(Boolean);
    log('success', `Found ${tokens.length} subscriber(s) in database`);
  } catch (err: any) {
    log('error', `D1 query failed: ${err.message}`);
    return { totalTokens: 0, sent: 0, failed: 0, cleaned: 0, logs };
  }

  if (tokens.length === 0) {
    log('info', 'No subscribers found — nothing to send');
    return { totalTokens: 0, sent: 0, failed: 0, cleaned: 0, logs };
  }

  // 3. Parse project ID from service account
  const sa: ServiceAccount = JSON.parse(serviceAccountJson);
  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  // 4. Send notifications in batches (concurrency-limited)
  const BATCH_SIZE = 100; // Concurrent requests per batch — safe for Workers subrequest limits
  const totalBatches = Math.ceil(tokens.length / BATCH_SIZE);
  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];

  log('info', `Starting send: ${tokens.length} tokens in ${totalBatches} batch(es)...`);

  for (let i = 0; i < totalBatches; i++) {
    const batch = tokens.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    log('info', `Sending batch ${i + 1}/${totalBatches} (${batch.length} tokens)...`);

    const results = await Promise.allSettled(
      batch.map((token) =>
        fetch(fcmUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              data: {
                title: payload.title || '',
                body: payload.body || '',
                image: payload.image || '',
                icon: payload.icon || '/icon.png',
                click_action: payload.click_action || '',
                actions: JSON.stringify([
                  { action: 'read_post', title: 'READ POST' },
                  { action: 'home', title: 'HOME' }
                ]),
              },
            },
          }),
        }).then(async (res) => {
          if (res.ok) return { success: true as const, token };
          const error: any = await res.json().catch(() => ({}));
          const errorCode =
            error?.error?.details?.[0]?.errorCode ||
            error?.error?.status ||
            'UNKNOWN';
          return { success: false as const, token, errorCode };
        })
      )
    );

    let batchSent = 0;
    let batchFailed = 0;
    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          sent++;
          batchSent++;
        } else {
          failed++;
          batchFailed++;
          const code = (result.value as any).errorCode;
          if (
            code === 'UNREGISTERED' ||
            code === 'NOT_FOUND' ||
            code === 'INVALID_ARGUMENT'
          ) {
            invalidTokens.push((result.value as any).token);
          }
        }
      } else {
        failed++;
        batchFailed++;
      }
    }

    log(
      'success',
      `Batch ${i + 1}/${totalBatches} done — ${batchSent} sent, ${batchFailed} failed`
    );
  }

  // 5. Cleanup invalid/expired tokens from D1
  let cleaned = 0;
  if (invalidTokens.length > 0) {
    log('cleanup', `Found ${invalidTokens.length} invalid/expired token(s) — cleaning up...`);
    try {
      // D1 supports max ~100 bind params per query, chunk the deletes
      const CHUNK_SIZE = 50;
      for (let i = 0; i < invalidTokens.length; i += CHUNK_SIZE) {
        const chunk = invalidTokens.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '?').join(',');
        await db
          .prepare(`DELETE FROM push_subscribers WHERE token IN (${placeholders})`)
          .bind(...chunk)
          .run();
        cleaned += chunk.length;
      }
      log('cleanup', `Removed ${cleaned} invalid token(s) from database`);
    } catch (err: any) {
      log('error', `Token cleanup failed: ${err.message}`);
    }
  }

  log(
    'success',
    `✨ Complete! Sent: ${sent} | Failed: ${failed} | Cleaned: ${cleaned} | Total: ${tokens.length}`
  );

  return { totalTokens: tokens.length, sent, failed, cleaned, logs };
}
