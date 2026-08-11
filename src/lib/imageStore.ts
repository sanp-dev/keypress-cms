// src/lib/imageStore.ts

export function makeSlug(text: string | undefined | null, fallback = 'image'): string {
  if (!text) return fallback;
  const clean = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  const words = clean.split('-').filter(Boolean).slice(0, 6);
  return words.length > 0 ? words.join('-') : fallback;
}

/**
 * Creates an SEO-friendly slug from the original file name (without extension).
 * Falls back to altText slug, then to the provided fallback string.
 */
export function makeFileSlug(originalFileName: string | undefined | null, altText: string | undefined | null, fallback = 'image'): string {
  // Try original filename first (strip extension)
  if (originalFileName) {
    const nameWithoutExt = originalFileName.replace(/\.[^.]+$/, '');
    const slug = makeSlug(nameWithoutExt, '');
    if (slug) return slug;
  }
  // Fallback to alt text
  return makeSlug(altText, fallback);
}

/**
 * Generates a 5-character alphanumeric random suffix (a-z, 0-9).
 */
export function randomSuffix(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function safeExtensionFor(contentType: string | null): string | null {
  if (!contentType) return null;
  return ALLOWED_TYPES[contentType.toLowerCase()] || null;
}

export function buildPublicUrl(baseUrl: string, fileName: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${fileName}`;
}