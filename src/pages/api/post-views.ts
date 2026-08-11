// src/pages/api/post-views.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { sitesConfig, getActiveSite } from '../../config/sitesConfig';
import { getPostsCatalog } from '../../lib/github';
import { getPageViewsByPath, viewsForSlug } from '../../lib/cloudflare-analytics';

// Cache the whole combined response in KV for 15 minutes so that loading the
// dashboard repeatedly does not re-hit GitHub + Cloudflare GraphQL every time.
const VIEWS_CACHE_KEY = 'post-views-combined:qd';
const VIEWS_CACHE_TTL = 900; // 15 minutes in seconds

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('refresh') === '1';
    const debug = url.searchParams.get('debug') === '1';

    const activeSite = getActiveSite();
    const githubToken = env?.GITHUB_PAT || (import.meta as any).env?.GITHUB_PAT;
    const cfAccountId = env?.CF_ACCOUNT_ID;
    const cfApiToken = env?.CF_ANALYTICS_API_TOKEN;

    // The host Cloudflare's RUM data is recorded under — derived from your
    // existing BLOG_BASE_URL var so you don't need a separate site ID.
    const blogBaseUrl = env?.BLOG_BASE_URL || activeSite.url;
    const requestHost = new URL(blogBaseUrl).host; // e.g. "www.yourdomain.com"

    // 1. Try cache first (unless explicitly bypassed)
    if (!forceRefresh && !debug && env?.CACHE_KV) {
      try {
        const cached = await env.CACHE_KV.get(VIEWS_CACHE_KEY, 'json');
        if (cached) {
          return new Response(JSON.stringify({ ...cached, fromCache: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      } catch {
        // ignore cache read errors, fall through to live fetch
      }
    }

    if (!githubToken) {
      return new Response(JSON.stringify({ error: 'GitHub PAT is missing' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch posts from catalog (KV-first — 0 API calls on cache hit)
    const { posts } = await getPostsCatalog(
      activeSite.githubOwner,
      activeSite.githubRepo,
      activeSite.contentPath,
      githubToken,
      activeSite.branch,
      env?.CACHE_KV
    );

    // 3. Fetch real traffic from Cloudflare Web Analytics, if configured.
    //    If the CF secrets are not set yet, we simply skip views (date-only
    //    mode) instead of failing the whole endpoint.
    let viewsMap = new Map<string, number>();
    let analyticsEnabled = false;

    if (cfAccountId && cfApiToken) {
      analyticsEnabled = true;
      viewsMap = await getPageViewsByPath(cfAccountId, cfApiToken, requestHost, 30);
    }

    const result = posts.map((post: any) => ({
      path: post.path,
      slug: post.slug,
      title: post.title || post.slug,
      publishedAt: post.publishedAt || null,
      views: analyticsEnabled ? viewsForSlug(viewsMap, post.slug) : null,
    }));

    const responseBody: Record<string, any> = {
      success: true,
      analyticsEnabled,
      generatedAt: new Date().toISOString(),
      posts: result,
    };

    // Debug mode: append raw diagnostic info (no caching when debugging)
    if (debug) {
      responseBody.debug = {
        requestHost,
        rawPathsFound: Array.from(viewsMap.entries()).map(([path, views]) => ({ path, views })),
        totalDistinctPaths: viewsMap.size,
      };
      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Cache the combined result
    if (env?.CACHE_KV) {
      try {
        await env.CACHE_KV.put(VIEWS_CACHE_KEY, JSON.stringify(responseBody), {
          expirationTtl: VIEWS_CACHE_TTL,
        });
      } catch {
        // ignore cache write errors
      }
    }

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('post-views API Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};