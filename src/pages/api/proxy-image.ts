// src/pages/api/proxy-image.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { makeSlug, randomSuffix, safeExtensionFor, buildPublicUrl } from '../../lib/imageStore';
import { getImageDimensions } from '../../lib/imageDimensions';

function jsonErr(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { 'Content-Type': 'application/json' } });
}

const ALLOWED_HOSTS = ['images.pexels.com', 'pixabay.com', 'cdn.pixabay.com', 'images.unsplash.com'];

export const POST: APIRoute = async (context) => {
  try {
    const { mediaUrl, altText } = await context.request.json();
    if (!mediaUrl) return jsonErr('mediaUrl missing', 400);

    const parsed = new URL(mediaUrl);
    const ok = ALLOWED_HOSTS.some((h) => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
    if (!ok) return jsonErr('Disallowed image host', 403);

    const res = await fetch(mediaUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return jsonErr(`Source fetch failed: ${res.status}`, 502);

    const contentType = res.headers.get('content-type');
    const ext = safeExtensionFor(contentType) || 'jpg';
    
    // Read as ArrayBuffer for dimension detection and R2 upload
    const arrayBuffer = await res.arrayBuffer();

    const fileName = `${makeSlug(altText, 'image')}-${randomSuffix()}.${ext}`;
    await env.IMG_BUCKET.put(fileName, arrayBuffer, {
      httpMetadata: { contentType: contentType || 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' },
    });

    // Extract image dimensions
    const dims = getImageDimensions(arrayBuffer);
    const width = dims?.width || 0;
    const height = dims?.height || 0;

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

    const imageBaseUrl = (env as any)?.IMAGE_PUBLIC_BASE_URL || (import.meta as any).env?.IMAGE_PUBLIC_BASE_URL || 'https://images.YOUR-DOMAIN.com';
    const publicUrl = buildPublicUrl(imageBaseUrl, fileName);
    return new Response(JSON.stringify({ url: publicUrl, width, height }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return jsonErr(e.message, 500);
  }
};