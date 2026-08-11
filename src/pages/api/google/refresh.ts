// src/pages/api/google/refresh.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getSeoClient } from '../../../lib/seo';

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

    const client = getSeoClient('google');
    // Force refresh triggers Google API call and saves it to cache
    const result = await client.inspectUrl(url, true, env);

    return new Response(JSON.stringify({ success: true, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Refresh API Route Error:', error);
    // Never expose raw Google or credential errors directly to the user
    return new Response(JSON.stringify({ error: 'Failed to refresh SEO data. Please check your credentials.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
