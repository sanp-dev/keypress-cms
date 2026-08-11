// src/pages/api/upload-image.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { makeFileSlug, randomSuffix, safeExtensionFor, buildPublicUrl } from '../../lib/imageStore';
import { getImageDimensions } from '../../lib/imageDimensions';

const MAX_BYTES = 8 * 1024 * 1024; // 8MB

function jsonErr(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async (context) => {
  try {
    // Demo Mode bypass
    if (context.locals.user?.email?.toLowerCase() === 'admin@example.com') {
      const mockUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80';
      return new Response(JSON.stringify({ url: mockUrl, width: 1200, height: 800 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const form = await context.request.formData();
    const file = form.get('file');
    const altText = (form.get('altText') as string) || 'upload';

    if (!(file instanceof File)) return jsonErr('No file uploaded', 400);
    if (file.size > MAX_BYTES) return jsonErr('File larger than 8MB.', 413);

    const ext = safeExtensionFor(file.type);
    if (!ext) return jsonErr('Only jpg, png, webp, gif are allowed.', 415);

    // Use original filename for SEO-friendly R2 key
    const originalName = file.name || '';
    const fileName = `${makeFileSlug(originalName, altText, 'upload')}-${randomSuffix()}.${ext}`;

    // Read image buffer for dimension detection and R2 upload
    const arrayBuffer = await file.arrayBuffer();

    await env.IMG_BUCKET.put(fileName, arrayBuffer, {
      httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' },
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