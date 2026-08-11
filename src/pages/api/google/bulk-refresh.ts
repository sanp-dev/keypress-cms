// src/pages/api/google/bulk-refresh.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getSeoClient } from '../../../lib/seo';
import { getPublishedPosts } from '../../../lib/github';
import { sitesConfig, getActiveSite } from '../../../config/sitesConfig';

export const POST: APIRoute = async ({ request }) => {
  try {
    const activeSite = getActiveSite();
    const body = await request.json().catch(() => ({}));
    
    let urls: string[] = [];
    
    if (body.urls && Array.isArray(body.urls)) {
      urls = body.urls;
    } else if (body.slugs && Array.isArray(body.slugs)) {
      urls = body.slugs.map((slug: string) => `${activeSite.url}/post/${slug.trim().toLowerCase()}/`);
    } else {
      // Fallback: fetch all posts from GitHub
      const token = env?.GITHUB_PAT || import.meta.env.GITHUB_PAT;
      if (!token) {
        return new Response(JSON.stringify({ error: 'GitHub PAT token is missing' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const posts = await getPublishedPosts(
        activeSite.githubOwner,
        activeSite.githubRepo,
        activeSite.contentPath,
        token
      );
      
      if (posts && posts.length > 0) {
        urls = posts.map((post) => `${activeSite.url}/post/${post.slug}/`);
      }
    }

    // Ensure all URLs end with a trailing slash (canonical format) and deduplicate
    urls = Array.from(new Set(urls.map((u) => (u.trim().endsWith('/') ? u.trim() : `${u.trim()}/`))));

    if (urls.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No URLs found to refresh', count: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const client = getSeoClient('google');
    
    // Concurrently fetch inspection status for the selected batch of URLs
    const results = await Promise.all(
      urls.map(async (url) => {
        return client.inspectUrl(url, true, env);
      })
    );

    // Count results
    const counts = {
      indexed: 0,
      pending: 0,
      crawled: 0,
      error: 0,
      unknown: 0,
    };

    for (const r of results) {
      counts[r.status] = (counts[r.status] || 0) + 1;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully refreshed SEO status for ${results.length} URLs.`,
        count: results.length,
        counts,
        results,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Bulk Refresh API Route Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error during bulk SEO status refresh' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
