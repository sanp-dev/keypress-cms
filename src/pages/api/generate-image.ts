// src/pages/api/generate-image.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { makeSlug, randomSuffix, buildPublicUrl } from '../../lib/imageStore';

export const POST: APIRoute = async (context) => {
  try {
    const { prompt } = await context.request.json();
    if (!prompt || !prompt.trim()) {
      return new Response(JSON.stringify({ error: 'Empty Prompt!' }), { status: 400 });
    }

    const form = new FormData();
    form.append('prompt', prompt);
    form.append('width', '1280');
    form.append('height', '720');
    const formResponse = new Response(form);

    const aiResponse: any = await env.AI.run('@cf/black-forest-labs/flux-2-klein-4b', {
      multipart: { body: formResponse.body, contentType: formResponse.headers.get('content-type') },
    });

    const imgBuffer = Uint8Array.from(atob(aiResponse.image), (c) => c.codePointAt(0)!);
    const fileName = `${makeSlug(prompt, 'flux')}-${randomSuffix()}.png`;

    await env.IMG_BUCKET.put(fileName, imgBuffer, {
      httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' },
    });

    // --- KV TRACKER LOGIC ---
    const userEmail = context.locals.user?.email || 'anonymous';
    const url = new URL(context.request.url);
    const filePath = url.searchParams.get('file') || '';
    const kvTrackerKey = filePath 
      ? `tracker_images:cms:${userEmail}:${filePath}`
      : `tracker_images:cms:${userEmail}:new`;

    let trackedImages: any = await env.CACHE_KV.get(kvTrackerKey, "json") || [];
    trackedImages.push({ fileName: fileName });
    await env.CACHE_KV.put(kvTrackerKey, JSON.stringify(trackedImages));
    // -----------------------------

    const publicUrl = buildPublicUrl(
      env.IMAGE_PUBLIC_BASE_URL || import.meta.env.IMAGE_PUBLIC_BASE_URL || 'https://images.YOUR-DOMAIN.com', 
      fileName
    );

    return new Response(JSON.stringify({ url: publicUrl, width: 1280, height: 720 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};