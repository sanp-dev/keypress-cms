// src/pages/api/stats.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { sitesConfig, getActiveSite } from '../../config/sitesConfig';
import { getPublishedPosts } from '../../lib/github';

export const GET: APIRoute = async () => {
  try {
    const activeSite = getActiveSite();
    const token = env.GITHUB_PAT;
    const DRAFT_KEY = 'draft:cms:write-article';

    // 1. Posts Count
    let totalPosts = 0;
    try {
      const posts = await getPublishedPosts(
        activeSite.githubOwner,
        activeSite.githubRepo,
        activeSite.contentPath,
        token
      );
      totalPosts = posts.length;
    } catch {}

    // 2. R2 Bucket Stats
    let totalImages = 0;
    let totalStorageBytes = 0;
    try {
      if (env.IMG_BUCKET) {
        const listed = await env.IMG_BUCKET.list({ limit: 1000 });
        totalImages = listed.objects.length;
        totalStorageBytes = listed.objects.reduce(
          (sum: number, obj: any) => sum + (obj.size || 0),
          0
        );
      }
    } catch {}

    // 3. KV Draft Status
    let hasDraft = false;
    let draftTitle: string | null = null;
    let draftUpdatedAt: string | null = null;
    try {
      const draft = (await env.CACHE_KV.get(DRAFT_KEY, 'json')) as any;
      if (draft) {
        hasDraft = true;
        draftTitle = draft.title || null;
        draftUpdatedAt = draft.updatedAt || null;
      }
    } catch {}

    // 4. Latest GitHub Commit
    let lastCommitDate: string | null = null;
    let lastCommitMsg: string | null = null;
    try {
      const commitUrl = `https://api.github.com/repos/${activeSite.githubOwner}/${activeSite.githubRepo}/commits?sha=${activeSite.branch}&per_page=1`;
      const commitRes = await fetch(commitUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Astro-Dashboard-App',
        },
      });
      if (commitRes.ok) {
        const commits = await commitRes.json();
        if (Array.isArray(commits) && commits.length > 0) {
          lastCommitDate = commits[0].commit?.author?.date || null;
          lastCommitMsg =
            (commits[0].commit?.message || '').split('\n')[0].slice(0, 60) || null;
        }
      }
    } catch {}

    return new Response(
      JSON.stringify({
        totalPosts,
        totalImages,
        totalStorageBytes,
        hasDraft,
        draftTitle,
        draftUpdatedAt,
        lastCommitDate,
        lastCommitMsg,
        generatedAt: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};