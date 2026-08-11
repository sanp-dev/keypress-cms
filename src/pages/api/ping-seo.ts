// src/pages/api/ping-seo.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { sitesConfig, getActiveSite } from '../../config/sitesConfig';
import { getSeoClient } from '../../lib/seo';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json().catch(() => ({}))) as { url?: string };
    const activeSite = getActiveSite();

    const sitemapUrl = body.url || `${activeSite.url}/sitemap-index.xml`;

    const results: Array<{ engine: string; status: string; message: string }> = [];

    // ─── 1. Google Search Console API (Authenticated) ────────────────────────
    try {
      const googleClient = getSeoClient('google');
      const googleRes = await googleClient.submitSitemap(sitemapUrl, env);

      results.push({
        engine: 'Google (Search Console API)',
        status: googleRes.success ? 'success' : 'error',
        message: googleRes.success ? 'Sitemap submitted successfully' : googleRes.message,
      });
    } catch (e: any) {
      results.push({
        engine: 'Google (Search Console API)',
        status: 'error',
        message: e.message || 'Authentication or API error',
      });
    }

    // ─── 2. Bing Webmaster API – Sitemap Submit ──────────────────────────────
    try {
      const bingApiKey = (env as any).BING_WEBMASTER_API_KEY || '';
      if (!bingApiKey) {
        results.push({
          engine: 'Bing (Webmaster API)',
          status: 'skipped',
          message: 'BING_WEBMASTER_API_KEY env var not set',
        });
      } else {
        const bingRes = await fetch(
          `https://ssl.bing.com/webmaster/api.svc/json/SubmitFeed?apikey=${encodeURIComponent(bingApiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
              siteUrl: activeSite.url,
              feedUrl: sitemapUrl,
            }),
          },
        );

        if (bingRes.ok) {
          results.push({
            engine: 'Bing (Webmaster API)',
            status: 'success',
            message: 'Sitemap submitted successfully',
          });
        } else {
          const errorText = await bingRes.text().catch(() => '');
          let errorMessage = `HTTP ${bingRes.status}`;
          try {
            const parsed = JSON.parse(errorText);
            if (parsed.ErrorCode || parsed.Message) {
              errorMessage = parsed.Message || `Error code: ${parsed.ErrorCode}`;
            }
          } catch {
            if (errorText) errorMessage += `: ${errorText.slice(0, 200)}`;
          }
          results.push({
            engine: 'Bing (Webmaster API)',
            status: 'error',
            message: errorMessage,
          });
        }
      }
    } catch (e: any) {
      results.push({
        engine: 'Bing (Webmaster API)',
        status: 'error',
        message: e.message || 'Failed to submit sitemap to Bing',
      });
    }

    const successCount = results.filter((r) => r.status === 'success').length;

    return new Response(
      JSON.stringify({
        success: successCount > 0,
        successCount,
        totalCount: results.length,
        results,
        timestamp: new Date().toISOString(),
        sitemapUrl,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Ping SEO Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};