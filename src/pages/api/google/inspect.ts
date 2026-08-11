// src/pages/api/google/inspect.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getCachedInspectionResult } from '../../../lib/seo';

export const ALL: APIRoute = async ({ request }) => {
  try {
    let url = '';
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      url = body.url || '';
    } else {
      const searchParams = new URL(request.url).searchParams;
      url = searchParams.get('url') || '';
    }

    if (!url) {
      return new Response(JSON.stringify({ error: 'URL parameter is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cached = await getCachedInspectionResult(url, env);

    if (cached) {
      return new Response(JSON.stringify({ success: true, result: cached }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Return a default empty status rather than failing
    return new Response(
      JSON.stringify({
        success: true,
        result: {
          url,
          status: 'unknown',
          coverage: 'Not yet inspected (cache empty)',
          lastCrawl: null,
          googleCanonical: null,
          userCanonical: null,
          robots: 'Unknown',
          indexing: 'Unknown',
          pageFetchStatus: 'Unknown',
          richResults: [],
          mobile: null,
          referringUrls: [],
          updatedAt: new Date().toISOString(),
          verdict: 'NEUTRAL',
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Inspect API Route Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
