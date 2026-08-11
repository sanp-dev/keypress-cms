// src/pages/api/google/indexnow.ts
// Uses Bing Webmaster SubmitUrlbatch API (authenticated) for submitting single URLs.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { sitesConfig, getActiveSite } from '../../../config/sitesConfig';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({})) as { url?: string };
    if (!body.url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const activeSite = getActiveSite();
    const bingApiKey = (env as any).BING_WEBMASTER_API_KEY || '';

    if (!bingApiKey) {
      return new Response(JSON.stringify({ error: 'BING_WEBMASTER_API_KEY is not configured in environment.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Submit URL directly via Bing Webmaster SubmitUrlbatch (authenticated)
    const bingRes = await fetch(
      `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch?apikey=${encodeURIComponent(bingApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          siteUrl: activeSite.url,
          urlList: [body.url],
        }),
      },
    );

    if (bingRes.ok) {
      return new Response(JSON.stringify({ success: true, message: 'URL submitted to Bing successfully!' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Parse error details from Bing API
    const errorText = await bingRes.text().catch(() => '');
    let errorMessage = `Bing Webmaster API returned HTTP ${bingRes.status}`;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.Message) errorMessage = parsed.Message;
      else if (parsed.ErrorCode) errorMessage = `Error code: ${parsed.ErrorCode}`;
    } catch {
      if (errorText) errorMessage += `: ${errorText.slice(0, 200)}`;
    }

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: bingRes.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('URL Submit API Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};