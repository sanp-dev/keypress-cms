// src/lib/seo/google/auth.ts

const ACCESS_TOKEN_KV_KEY = 'seo:google:access_token';

/**
 * Gets a valid Google access token.
 * It first checks for a cached token in Cloudflare KV (CACHE_KV).
 * If not found or expired, it requests a new access token using the refresh token
 * and caches it.
 */
export async function getGoogleAccessToken(env: any): Promise<string> {
  const clientId = env?.GOOGLE_CLIENT_ID || import.meta.env.GOOGLE_CLIENT_ID;
  const clientSecret = env?.GOOGLE_CLIENT_SECRET || import.meta.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = env?.GOOGLE_REFRESH_TOKEN || import.meta.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google OAuth credentials missing in environment variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)');
  }

  // 1. Check cache in KV
  if (env?.CACHE_KV) {
    try {
      const cachedToken = await env.CACHE_KV.get(ACCESS_TOKEN_KV_KEY);
      if (cachedToken) {
        return cachedToken;
      }
    } catch (err) {
      console.error('Error fetching access token from KV cache:', err);
    }
  }

  // 2. Request new access token from Google
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to refresh Google OAuth token: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    const accessToken = data.access_token;
    
    // Google tokens usually expire in 3600 seconds. Cache for slightly less (e.g. 3500 seconds)
    const cacheTtlSeconds = Math.max(60, (data.expires_in || 3600) - 100);

    // 3. Cache token in KV
    if (env?.CACHE_KV && accessToken) {
      try {
        await env.CACHE_KV.put(ACCESS_TOKEN_KV_KEY, accessToken, {
          expirationTtl: cacheTtlSeconds,
        });
      } catch (err) {
        console.error('Error saving access token to KV cache:', err);
      }
    }

    return accessToken;
  } catch (error: any) {
    console.error('Google OAuth refresh error:', error);
    throw new Error(`Google OAuth error: ${error.message}`);
  }
}
