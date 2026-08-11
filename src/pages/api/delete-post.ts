// src/pages/api/delete-post.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { sitesConfig, getActiveSite } from '../../config/sitesConfig';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { path, sha } = body;

    if (!path || !sha) {
      return new Response(JSON.stringify({ error: 'Path and SHA are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const activeSite = getActiveSite();
    const token = env.GITHUB_PAT || import.meta.env.GITHUB_PAT;

    if (!token) {
      return new Response(JSON.stringify({ error: 'GitHub PAT is missing' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // GitHub API Delete Endpoint
    const url = `https://api.github.com/repos/${activeSite.githubOwner}/${activeSite.githubRepo}/contents/${path}`;

    const githubResponse = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Astro-Dashboard-App',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Delete article: ${path} via Dashboard`,
        sha: sha,
        branch: activeSite.branch
      })
    });

    if (!githubResponse.ok) {
      const errData = await githubResponse.text();
      console.error("GitHub API Delete Error:", errData);
      return new Response(JSON.stringify({ error: 'Failed to delete file from GitHub', details: errData }), {
        status: githubResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (env.CACHE_KV) {
      try {
        const owner = activeSite.githubOwner;
        const repo = activeSite.githubRepo;
        const catalogKey = `posts-catalog:${owner}/${repo}`;
        const metadataCacheKey = `metadata:${owner}/${repo}:${activeSite.contentPath}`;

        // 1. Update catalog cache incrementally
        const existingCatalog = await env.CACHE_KV.get(catalogKey, 'json') as any[] | null;
        if (existingCatalog && Array.isArray(existingCatalog)) {
          const filtered = existingCatalog.filter((p: any) => p.path !== path);
          await env.CACHE_KV.put(catalogKey, JSON.stringify(filtered), { expirationTtl: 86400 });
        } else {
          await env.CACHE_KV.delete(catalogKey);
        }

        // 2. Update metadata cache incrementally
        const existingMeta = await env.CACHE_KV.get(metadataCacheKey, 'json') as Record<string, any> | null;
        if (existingMeta) {
          if (existingMeta[path]) {
            delete existingMeta[path];
          }
          await env.CACHE_KV.put(metadataCacheKey, JSON.stringify(existingMeta), { expirationTtl: 86400 });
        }

        const listCacheKey = 'post-views-combined:qd';
        await env.CACHE_KV.delete(listCacheKey);
      } catch (cacheErr) {
        console.error("Failed to perform cache operations on delete:", cacheErr);
      }
    }

    return new Response(JSON.stringify({ success: true, message: 'Article deleted successfully' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("Delete API Error:", error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};