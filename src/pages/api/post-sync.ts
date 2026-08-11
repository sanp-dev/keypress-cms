// src/pages/api/git-sync.ts
// Manual Git Sync API — clears ONLY the posts-catalog KV key so dashboard
// re-fetches the file list from GitHub, while keeping the metadata cache intact.
//
// Strategy (safe for 500+ posts):
//   ✅ Delete catalogKey  → forces fresh file list from GitHub (1 API call)
//   ✅ Keep metadataKey   → existing posts' dates/titles stay cached (0 extra API calls)
//   ✅ Only NEW .md files → need fresh commit-date + title fetch (batched, 5 at a time)
//
// If we deleted metadataKey too, ALL posts would be "uncached" → hundreds of
// GitHub API calls → Cloudflare Worker timeout. This is the safe approach.

import type { APIContext } from "astro";
import { getActiveSite } from "../../config/sitesConfig";
import { env } from "cloudflare:workers";
import { getPostsCatalog } from "../../lib/github";

export const prerender = false;

export async function POST({ request }: APIContext) {
  try {
    const activeSite = getActiveSite();
    const token = env?.GITHUB_PAT || import.meta.env.GITHUB_PAT;
    const kv = env?.CACHE_KV;
    const owner = activeSite.githubOwner;
    const repo = activeSite.githubRepo;
    const contentPath = activeSite.contentPath;
    const branch = activeSite.branch;

    // ── 1. Delete ONLY the catalog key (file-list cache), keep metadata ─────
    //
    //    catalogKey  = full post list (file names, slugs, sha) — SAFE TO CLEAR
    //    metadataKey = per-post dates + titles (expensive to rebuild) — KEEP IT
    //
    //    getPostsCatalog() will:
    //      • Fetch fresh file list from GitHub (1 API call)
    //      • Load metadataKey → existing posts are still "cached" (0 API calls)
    //      • Only NEW files (not in metadataKey) need fresh date + title fetch
    const catalogKey = `posts-catalog:${owner}/${repo}`;

    if (kv) {
      try {
        if (typeof kv.delete === "function") {
          await kv.delete(catalogKey);
        } else {
          // Fallback: expire immediately so it's treated as a cache miss
          await kv.put(catalogKey, JSON.stringify([]), { expirationTtl: 1 });
        }
      } catch (e) {
        console.error("[GitSync] KV delete error:", e);
      }
    }

    // ── 2. Re-build catalog — only new posts need fresh GitHub API calls ─────
    // First snapshot the old catalog count (before we cleared it) to detect new posts.
    // Since we already deleted catalogKey, we can't read it — but getPostsCatalog
    // will rebuild and return the current total. We pass previousCount via a quick
    // pre-check using the metadata key length as an approximation.
    let previousCount = 0;
    if (kv) {
      try {
        // metadataKey has one entry per known post — use it to estimate old count
        const meta = await kv.get(`metadata:${owner}/${repo}:${contentPath}`, "json") as Record<string, any> | null;
        if (meta) previousCount = Object.keys(meta).length;
      } catch { /* ignore */ }
    }

    const { posts, totalCount } = await getPostsCatalog(
      owner,
      repo,
      contentPath,
      token,
      branch,
      kv,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        synced: totalCount,
        previousCount,
        posts: posts.map((p) => ({
          name: p.name,
          slug: p.slug,
          title: p.title,
          publishedAt: p.publishedAt,
        })),
        message: `✅ Git Sync complete — ${totalCount} posts hydrated from GitHub.`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    console.error("[GitSync] Error:", err);
    return new Response(
      JSON.stringify({
        ok: false,
        message: `❌ Sync failed: ${err?.message || "Unknown error"}`,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
