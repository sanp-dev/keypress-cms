// src/pages/api/draft.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

function jsonErr(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const url = new URL(request.url);
    const userEmail = locals.user?.email || 'anonymous';
    const filePath = url.searchParams.get('file') || '';
    
    // Construct user-separated and file-specific KV key
    const key = filePath 
      ? `draft:cms:write-article:${userEmail}:${filePath}`
      : `draft:cms:write-article:${userEmail}:new`;
    
    const draft = await env.CACHE_KV.get(key, 'json');
    if (!draft) {
      return new Response(JSON.stringify({ draft: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ draft }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return jsonErr(e.message, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json();
    const { draft } = body;

    if (!draft) {
      return jsonErr('Draft data missing', 400);
    }

    const userEmail = locals.user?.email || 'anonymous';
    const filePath = draft._editOriginalPath || '';
    
    // Construct user-separated and file-specific KV key
    const key = filePath 
      ? `draft:cms:write-article:${userEmail}:${filePath}`
      : `draft:cms:write-article:${userEmail}:new`;

    // Store in KV with 30-day TTL (auto-cleanup)
    await env.CACHE_KV.put(key, JSON.stringify(draft), {
      expirationTtl: 2592000, // 30 days in seconds
    });

    return new Response(JSON.stringify({ success: true, message: 'Draft saved to KV securely' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return jsonErr(e.message, 500);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const url = new URL(request.url);
    let filePath = url.searchParams.get('file') || '';

    // Fallback: check if it's sent in JSON body
    if (!filePath && request.headers.get('Content-Type')?.includes('application/json')) {
      const body = await request.json().catch(() => ({}));
      if (body.file) {
        filePath = body.file;
      } else if (body.draft?._editOriginalPath) {
        filePath = body.draft._editOriginalPath;
      }
    }

    const userEmail = locals.user?.email || 'anonymous';
    const key = filePath 
      ? `draft:cms:write-article:${userEmail}:${filePath}`
      : `draft:cms:write-article:${userEmail}:new`;

    await env.CACHE_KV.delete(key);
    return new Response(JSON.stringify({ success: true, message: 'Draft cleared from KV' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return jsonErr(e.message, 500);
  }
};