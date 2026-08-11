// src/pages/api/manage-media.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getPublishedPosts, getFileContent } from '../../lib/github';
import { sitesConfig, getActiveSite } from '../../config/sitesConfig';

// Helper for JSON error responses
function jsonErr(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

// Extract all referenced image/video/file keys or basenames from the content.
// Handles all URL formats including Cloudflare transform URLs, relative URLs, 
// and files without extensions by extracting path components and URLs.
function getUsedKeysFromContent(content: string, imageDomain: string, vidDomain: string): Set<string> {
  const set = new Set<string>();
  if (!content) return set;

  // Match URLs (starting with http/https) and any path/filename-like patterns.
  // This extracts both URLs containing the domain and raw path components.
  const regex = /(https?:\/\/[^\s"'><()]+|[\w\-\.\/]+\.[a-zA-Z0-9]+|[\w\-]{8,}-\w+)/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const str = match[1];
    if (str.startsWith('http://') || str.startsWith('https://')) {
      try {
        const urlObj = new URL(str);
        const host = urlObj.hostname.toLowerCase();
        if (host === imageDomain.toLowerCase() || host === vidDomain.toLowerCase()) {
          const pathname = urlObj.pathname;
          const lastPart = pathname.split('/').pop();
          if (lastPart) {
            const decoded = decodeURIComponent(lastPart).toLowerCase();
            set.add(decoded);
            set.add(decoded.trim());
          }
        }
      } catch (e) {
        const lastPart = str.split('/').pop();
        if (lastPart) {
          const decoded = decodeURIComponent(lastPart).toLowerCase();
          set.add(decoded);
          set.add(decoded.trim());
        }
      }
    } else {
      const lastPart = str.split('/').pop();
      if (lastPart) {
        const decoded = decodeURIComponent(lastPart).toLowerCase();
        set.add(decoded);
        set.add(decoded.trim());
      }
    }
  }
  return set;
}

// Extract post title from markdown content
function extractTitle(content: string, fallback: string): string {
  const match = content.match(/^title:\s*"((?:[^"\\]|\\.)*)"/m) || 
                content.match(/^title:\s*'((?:[^'\\]|\\.)*)'/m) ||
                content.match(/^title:\s*(.+)$/m);
  if (match) {
    let t = match[1].trim();
    if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1);
    if (t.startsWith("'") && t.endsWith("'")) t = t.slice(1, -1);
    return t.replace(/\\"/g, '"').trim();
  }
  return fallback;
}

// Extract title from HTML content (for Web Stories)
function extractHtmlTitle(content: string, fallback: string): string {
  if (!content) return fallback;
  const match = content.match(/<title>([\s\S]*?)<\/title>/i) || 
                content.match(/title="([\s\S]*?)"/i);
  if (match) {
    return match[1].trim();
  }
  return fallback;
}

// ─── Phase 1: List R2 objects + post/story metadata (NO content fetching) ───
async function handleInit(context: any) {
  if (!env.IMG_BUCKET) {
    return jsonErr('R2 Bucket binding IMG_BUCKET is missing in environment', 500);
  }

  // 1. Fetch all image objects from R2
  let allObjects: any[] = [];
  let truncated = true;
  let cursor: string | undefined = undefined;
  while (truncated) {
    const listResult: any = await env.IMG_BUCKET.list({ limit: 1000, cursor });
    if (listResult && listResult.objects) {
      allObjects = allObjects.concat(listResult.objects.map((obj: any) => ({ ...obj, type: 'image' })));
    }
    truncated = listResult?.truncated || false;
    cursor = listResult?.cursor;
  }

  // 1.2 Fetch all video objects from R2
  let allVideos: any[] = [];
  if (env.VID_BUCKET) {
    let vidTruncated = true;
    let vidCursor: string | undefined = undefined;
    while (vidTruncated) {
      const listResult: any = await env.VID_BUCKET.list({ limit: 1000, cursor: vidCursor });
      if (listResult && listResult.objects) {
        allVideos = allVideos.concat(listResult.objects.map((obj: any) => ({ ...obj, type: 'video' })));
      }
      vidTruncated = listResult?.truncated || false;
      vidCursor = listResult?.cursor;
    }
  }

  const combinedObjects = [...allObjects, ...allVideos];

  // Filter out system/optimized assets, specific static files, and keys without extensions
  const filteredObjects = combinedObjects.filter((obj) => {
    const key = obj.key.toLowerCase();

    // 1. Exclude specific system/static files
    if (
      key === 'robots.txt' ||
      key === 'favicon.ico' ||
      key === 'logo.webp' ||
      key === 'logo.png'
    ) {
      return false;
    }

    // 2. Exclude Astro build assets (starts with or contains _astro)
    if (key.startsWith('_astro/') || key.includes('/_astro/')) return false;

    // 3. Exclude image transformations / resizing paths
    if (
      key.startsWith('transform/') || 
      key.includes('/transform/') || 
      key.startsWith('cdn-cgi/') || 
      key.includes('/cdn-cgi/') ||
      key.startsWith('_image') ||
      key.includes('/_image')
    ) {
      return false;
    }

    // 4. We do NOT exclude objects without file extensions anymore,
    // so they are listed and can be deleted if unused.

    return true;
  });

  // 2. Fetch post list from GitHub (metadata only, no content)
  const activeSite = getActiveSite();
  const token = env.GITHUB_PAT || import.meta.env.GITHUB_PAT;
  if (!token) {
    return jsonErr('GitHub PAT is missing', 500);
  }
  const posts = await getPublishedPosts(
    activeSite.githubOwner,
    activeSite.githubRepo,
    activeSite.contentPath,
    token
  );

  // 2.2 Count story objects
  let storyCount = 0;
  if (env.STORY_BUCKET) {
    let storyTruncated = true;
    let storyCursor: string | undefined = undefined;
    while (storyTruncated) {
      const listResult: any = await env.STORY_BUCKET.list({ limit: 1000, cursor: storyCursor });
      if (listResult && listResult.objects) {
        storyCount += listResult.objects.length;
      }
      storyTruncated = listResult?.truncated || false;
      storyCursor = listResult?.cursor;
    }
  }

  const imageBaseUrl = env.IMAGE_PUBLIC_BASE_URL || import.meta.env.IMAGE_PUBLIC_BASE_URL || 'https://images.YOUR-DOMAIN.com';
  const vidBaseUrl = env.VID_PUBLIC_BASE_URL || 'https://cdn.YOUR-DOMAIN.com';

  // Build minimal R2 object list for the frontend
  const r2Items = filteredObjects.map((obj) => {
    const isVideo = obj.type === 'video';
    const baseUrl = isVideo ? vidBaseUrl : imageBaseUrl;
    return {
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded,
      url: `${baseUrl.replace(/\/$/, '')}/${obj.key}`,
      type: obj.type,
    };
  });

  // Sort by uploaded date (newest first)
  r2Items.sort((a, b) => new Date(b.uploaded).getTime() - new Date(a.uploaded).getTime());

  const SCAN_BATCH_SIZE = 15;
  const totalPostPages = Math.ceil(posts.length / SCAN_BATCH_SIZE);
  const totalStoryPages = Math.ceil(storyCount / SCAN_BATCH_SIZE);

  return new Response(
    JSON.stringify({
      success: true,
      phase: 'init',
      r2Items,
      totalPosts: posts.length,
      totalStories: storyCount,
      totalPostPages,
      totalStoryPages,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

// ─── Phase 2: Scan a batch of posts and return used R2 keys ───
async function handleScanPosts(context: any, page: number, r2Keys: string[]) {
  const SCAN_BATCH_SIZE = 15;
  const activeSite = getActiveSite();
  const token = env.GITHUB_PAT || import.meta.env.GITHUB_PAT;
  if (!token) {
    return jsonErr('GitHub PAT is missing', 500);
  }

  const posts = await getPublishedPosts(
    activeSite.githubOwner,
    activeSite.githubRepo,
    activeSite.contentPath,
    token
  );

  const start = page * SCAN_BATCH_SIZE;
  const batch = posts.slice(start, start + SCAN_BATCH_SIZE);

  if (batch.length === 0) {
    return new Response(
      JSON.stringify({ success: true, phase: 'scanPosts', page, usedKeys: [], postDetails: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Fetch post contents (with SHA-based KV caching)
  const usedKeysSet = new Set<string>();
  const postDetails: Array<{ key: string; slug: string; title: string; path: string }> = [];

  const batchResults = await Promise.all(
    batch.map(async (post) => {
      const cacheKey = `mediascan:${post.sha}`;
      let content = '';

      // Try KV cache first
      if (env.CACHE_KV) {
        try {
          content = await env.CACHE_KV.get(cacheKey, 'text') || '';
        } catch (err) {}
      }

      // Cache miss → fetch from GitHub
      if (!content) {
        try {
          const fileData = await getFileContent(
            activeSite.githubOwner,
            activeSite.githubRepo,
            post.path,
            token
          );
          if (fileData) {
            content = fileData.content;
            if (env.CACHE_KV && content) {
              try {
                await env.CACHE_KV.put(cacheKey, content, { expirationTtl: 30 * 24 * 3600 });
              } catch (e) {}
            }
          }
        } catch (err) {
          console.error(`GitHub fetch error for path ${post.path}:`, err);
        }
      }

      return { post, content };
    })
  );

  // Pre-build lookups for O(1) performance to prevent CPU limit timeouts
  const exactKeysSet = new Set<string>();
  const basenameToFullKeyMap = new Map<string, string>();
  const lowerToOriginalMap = new Map<string, string>();

  for (const key of r2Keys) {
    const lowerKey = key.toLowerCase();
    exactKeysSet.add(lowerKey);
    lowerToOriginalMap.set(lowerKey, key);
    
    const basename = key.split('/').pop();
    if (basename) {
      basenameToFullKeyMap.set(basename.toLowerCase(), key);
    }
  }

  const imageDomain = new URL(env.IMAGE_PUBLIC_BASE_URL || 'https://images.YOUR-DOMAIN.com').hostname;
  const vidDomain = new URL(env.VID_PUBLIC_BASE_URL || 'https://cdn.YOUR-DOMAIN.com').hostname;

  // Check R2 keys against fetched post contents using optimized extraction & O(1) lookups
  for (const { post, content } of batchResults) {
    if (!content) continue;

    const matchedStrings = getUsedKeysFromContent(content, imageDomain, vidDomain);
    if (matchedStrings.size === 0) continue;

    for (const cleanMatch of matchedStrings) {
      let matchedKey: string | undefined = undefined;

      if (exactKeysSet.has(cleanMatch)) {
        matchedKey = lowerToOriginalMap.get(cleanMatch);
      } else if (basenameToFullKeyMap.has(cleanMatch)) {
        matchedKey = basenameToFullKeyMap.get(cleanMatch);
      }

      if (matchedKey) {
        usedKeysSet.add(matchedKey);
        // Avoid duplicate postDetails entries
        const alreadyAdded = postDetails.some(d => d.key === matchedKey && d.slug === post.slug);
        if (!alreadyAdded) {
          postDetails.push({
            key: matchedKey,
            slug: post.slug,
            title: extractTitle(content, post.slug),
            path: post.path,
          });
        }
      }
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      phase: 'scanPosts',
      page,
      usedKeys: Array.from(usedKeysSet),
      postDetails,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

// ─── Phase 3: Scan a batch of Web Stories and return used R2 keys ───
async function handleScanStories(context: any, page: number, r2Keys: string[]) {
  const SCAN_BATCH_SIZE = 15;

  if (!env.STORY_BUCKET) {
    return new Response(
      JSON.stringify({ success: true, phase: 'scanStories', page, usedKeys: [], storyDetails: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // List all story objects
  let storyObjects: any[] = [];
  let storyTruncated = true;
  let storyCursor: string | undefined = undefined;
  while (storyTruncated) {
    const listResult: any = await env.STORY_BUCKET.list({ limit: 1000, cursor: storyCursor });
    if (listResult && listResult.objects) {
      storyObjects = storyObjects.concat(listResult.objects);
    }
    storyTruncated = listResult?.truncated || false;
    storyCursor = listResult?.cursor;
  }

  const start = page * SCAN_BATCH_SIZE;
  const batch = storyObjects.slice(start, start + SCAN_BATCH_SIZE);

  if (batch.length === 0) {
    return new Response(
      JSON.stringify({ success: true, phase: 'scanStories', page, usedKeys: [], storyDetails: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const blogBaseUrl = env.BLOG_BASE_URL || activeSite.url || 'https://YOUR-BLOG-DOMAIN.com';
  const usedKeysSet = new Set<string>();
  const storyDetails: Array<{ key: string; slug: string; title: string; path: string; url: string }> = [];

  // Fetch story contents with etag-based KV caching
  const batchResults = await Promise.all(
    batch.map(async (obj) => {
      const cacheKey = `storyscan:${obj.key}:${obj.etag}`;
      let content = '';

      if (env.CACHE_KV) {
        try {
          content = await env.CACHE_KV.get(cacheKey, 'text') || '';
        } catch (err) {}
      }

      if (!content) {
        try {
          const res = await env.STORY_BUCKET.get(obj.key);
          if (res) {
            content = await res.text();
            if (env.CACHE_KV && content) {
              try {
                await env.CACHE_KV.put(cacheKey, content, { expirationTtl: 7 * 24 * 3600 });
              } catch (e) {}
            }
          }
        } catch (err) {
          console.error(`R2 read error for story ${obj.key}:`, err);
        }
      }

      return { obj, content };
    })
  );

  // Pre-build lookups for O(1) performance to prevent CPU limit timeouts
  const exactKeysSet = new Set<string>();
  const basenameToFullKeyMap = new Map<string, string>();
  const lowerToOriginalMap = new Map<string, string>();

  for (const key of r2Keys) {
    const lowerKey = key.toLowerCase();
    exactKeysSet.add(lowerKey);
    lowerToOriginalMap.set(lowerKey, key);
    
    const basename = key.split('/').pop();
    if (basename) {
      basenameToFullKeyMap.set(basename.toLowerCase(), key);
    }
  }

  const imageDomain = new URL(env.IMAGE_PUBLIC_BASE_URL || 'https://images.YOUR-DOMAIN.com').hostname;
  const vidDomain = new URL(env.VID_PUBLIC_BASE_URL || 'https://cdn.YOUR-DOMAIN.com').hostname;

  // Check R2 keys against fetched story contents using optimized extraction & O(1) lookups
  for (const { obj, content } of batchResults) {
    if (!content) continue;

    const matchedStrings = getUsedKeysFromContent(content, imageDomain, vidDomain);
    if (matchedStrings.size === 0) continue;

    for (const cleanMatch of matchedStrings) {
      let matchedKey: string | undefined = undefined;

      if (exactKeysSet.has(cleanMatch)) {
        matchedKey = lowerToOriginalMap.get(cleanMatch);
      } else if (basenameToFullKeyMap.has(cleanMatch)) {
        matchedKey = basenameToFullKeyMap.get(cleanMatch);
      }

      if (matchedKey) {
        usedKeysSet.add(matchedKey);
        // Avoid duplicate storyDetails entries
        const storySlug = obj.key.replace(/\/index\.html$/, '').replace(/\.html$/, '');
        const alreadyAdded = storyDetails.some(d => d.key === matchedKey && d.slug === storySlug);
        if (!alreadyAdded) {
          const storyUrl = `${blogBaseUrl.replace(/\/$/, '')}/webstories/${storySlug}/`;
          storyDetails.push({
            key: matchedKey,
            slug: storySlug,
            title: `Story: ${extractHtmlTitle(content, obj.key)}`,
            path: obj.key,
            url: storyUrl,
          });
        }
      }
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      phase: 'scanStories',
      page,
      usedKeys: Array.from(usedKeysSet),
      storyDetails,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

// ─── Shared Router (handles both GET and POST) ───
async function handleRequest(context: any) {
  const user = context.locals.user;
  if (!user || user.role !== 'admin') {
    return jsonErr('Unauthorized: Admin access required', 403);
  }

  const url = new URL(context.request.url);
  const phase = url.searchParams.get('phase') || 'init';
  const page = parseInt(url.searchParams.get('page') || '0', 10);

  // For scan phases, parse r2keys from POST body
  let r2Keys: string[] = [];
  if ((phase === 'scanPosts' || phase === 'scanStories') && context.request.method === 'POST') {
    try {
      const body = await context.request.json();
      r2Keys = body.r2keys || [];
    } catch (e) {
      console.error('Failed to parse POST body for r2keys:', e);
    }
  }

  switch (phase) {
    case 'init':
      return await handleInit(context);
    case 'scanPosts':
      return await handleScanPosts(context, page, r2Keys);
    case 'scanStories':
      return await handleScanStories(context, page, r2Keys);
    default:
      return jsonErr(`Unknown phase: ${phase}`, 400);
  }
}

// GET: Phase init (listing R2 objects)
export const GET: APIRoute = async (context) => {
  try {
    return await handleRequest(context);
  } catch (error: any) {
    console.error('Manage Media GET error:', error);
    return jsonErr(error.message || 'Internal Server Error', 500);
  }
};

// POST: Phase scanPosts / scanStories (r2keys in body)
export const POST: APIRoute = async (context) => {
  try {
    return await handleRequest(context);
  } catch (error: any) {
    console.error('Manage Media POST error:', error);
    return jsonErr(error.message || 'Internal Server Error', 500);
  }
};

// DELETE: Deletes an unused image/video from R2 bucket
export const DELETE: APIRoute = async (context) => {
  try {
    const user = context.locals.user;
    if (!user || user.role !== 'admin') {
      return jsonErr('Unauthorized: Admin access required', 403);
    }

    const { key, type } = await context.request.json();
    if (!key) {
      return jsonErr('Key is required to delete R2 object', 400);
    }

    if (type === 'video') {
      if (!env.VID_BUCKET) {
        return jsonErr('VID_BUCKET is not configured', 500);
      }
      await env.VID_BUCKET.delete(key);
    } else {
      if (!env.IMG_BUCKET) {
        return jsonErr('IMG_BUCKET is not configured', 500);
      }
      await env.IMG_BUCKET.delete(key);
    }

    return new Response(
      JSON.stringify({ success: true, message: `Successfully deleted ${key}` }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Manage Media DELETE error:', error);
    return jsonErr(error.message || 'Internal Server Error', 500);
  }
};
