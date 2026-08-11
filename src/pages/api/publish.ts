// src/pages/api/publish.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { sitesConfig, getActiveSite } from '../../config/sitesConfig';
import { getAuthorProfile } from '../../config/authors';
import { getSeoClient } from '../../lib/seo';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json();
    const { title, slug, content, usedImages, sha, originalPath } = body;

    const token = env.GITHUB_PAT || import.meta.env.GITHUB_PAT;
    if (!token) return new Response(JSON.stringify({ error: "GitHub PAT token missing" }), { status: 500 });
    if (!title || !slug || !content) return new Response(JSON.stringify({ error: "Required fields missing!" }), { status: 400 });

    const authorProfile = getAuthorProfile(locals.user?.email);

    const safeAuthorForYaml = authorProfile.name.replace(/"/g, '\\"');
    let enforcedContent = content.replace(
      /^author:\s*"(?:[^"\\]|\\.)*"\s*$/m,
      `author: "${safeAuthorForYaml}"`
    );

    if (/^authorSlug:\s*".*"\s*$/m.test(enforcedContent)) {
      enforcedContent = enforcedContent.replace(
        /^authorSlug:\s*"(?:[^"\\]|\\.)*"\s*$/m,
        `authorSlug: "${authorProfile.slug}"`
      );
    } else {
      enforcedContent = enforcedContent.replace(
        /^author:\s*"(?:[^"\\]|\\.)*"\s*$/m,
        (match: string) => `${match}\nauthorSlug: "${authorProfile.slug}"`
      );
    }

    const activeSite = getActiveSite();
    const owner = activeSite.githubOwner; 
    const repo = activeSite.githubRepo;
    const contentPath = `${activeSite.contentPath}/${slug}.md`;

    // 1. Publish to GitHub
    const base64Content = btoa(unescape(encodeURIComponent(enforcedContent)));
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${contentPath}`;

    // Edit-mode detection & Idempotent SHA Auto-Resolution on retry:
    let fileSha = sha;
    let autoResolved = false;
    if (!fileSha) {
      // Check if file already exists on GitHub to retrieve its SHA (handles retries after server crashes)
      try {
        const getRes = await fetch(`${url}?t=${Date.now()}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Astro-Dashboard-App'
          },
          cache: 'no-store'
        });
        if (getRes.ok) {
          const getData = await getRes.json();
          fileSha = getData.sha;
          autoResolved = true;
          console.log(`Auto-resolved existing file SHA for ${contentPath}: ${fileSha}`);
        }
      } catch (getErr) {
        console.error("Failed to check existing file on GitHub:", getErr);
      }
    }

    //  - sha present + originalPath === contentPath  -> updating the SAME file (PUT with sha)
    //  - sha present + originalPath !== contentPath  -> slug was renamed (create new, delete old)
    //  - no sha                                       -> brand new article (plain create)
    const isUpdatingSamePath = !!fileSha && (originalPath === contentPath || autoResolved);
    const isSlugRenamed = !!sha && !!originalPath && originalPath !== contentPath;

    const githubPutBody: Record<string, any> = {
      message: isUpdatingSamePath
        ? `Feat(Blog): Updated via AI Publisher - ${title}`
        : `Feat(Blog): Published via AI Publisher - ${title}`,
      content: base64Content,
      branch: activeSite.branch
    };
    if (fileSha) {
      githubPutBody.sha = fileSha; // required by GitHub Contents API to update an existing file
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Astro-Dashboard-App',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(githubPutBody)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'GitHub Upload Failed');

    // Smart incremental cache update (avoids full catalog rebuild on next load)
    if (env.CACHE_KV) {
      try {
        const catalogKey = `posts-catalog:${owner}/${repo}`;
        const metadataCacheKey = `metadata:${owner}/${repo}:${activeSite.contentPath}`;

        // 1. Update catalog cache incrementally
        const existingCatalog = await env.CACHE_KV.get(catalogKey, 'json') as any[] | null;
        if (existingCatalog && Array.isArray(existingCatalog)) {
          const newPost = {
            name: `${slug}.md`,
            path: contentPath,
            sha: data.content?.sha || '',
            slug,
            title,
            publishedAt: new Date().toISOString(),
          };
          // Remove old entry if exists, add new one
          const updated = existingCatalog.filter((p: any) => p.path !== contentPath);
          // Also remove old path entry if slug was renamed
          const filtered = isSlugRenamed && originalPath
            ? updated.filter((p: any) => p.path !== originalPath)
            : updated;
          filtered.unshift(newPost);
          await env.CACHE_KV.put(catalogKey, JSON.stringify(filtered), { expirationTtl: 86400 });
        } else {
          // No catalog cache — just delete so it rebuilds on next load
          await env.CACHE_KV.delete(catalogKey);
        }

        // 2. Update metadata cache incrementally
        const existingMeta = await env.CACHE_KV.get(metadataCacheKey, 'json') as Record<string, any> | null;
        if (existingMeta) {
          existingMeta[contentPath] = { publishedAt: new Date().toISOString(), title };
          if (isSlugRenamed && originalPath && existingMeta[originalPath]) {
            delete existingMeta[originalPath];
          }
          await env.CACHE_KV.put(metadataCacheKey, JSON.stringify(existingMeta), { expirationTtl: 86400 });
        }

        // 3. Clear post-views combined cache so it picks up new data
        await env.CACHE_KV.delete('post-views-combined:qd');
      } catch (cacheErr) {
        console.error("Failed to perform cache operations on publish:", cacheErr);
      }
    }

    // 1b. If the slug changed while editing, the new file now exists above —
    // clean up the old file at its original path so we don't leave a stale duplicate.
    if (isSlugRenamed) {
      try {
        const deleteUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${originalPath}`;
        await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Astro-Dashboard-App',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `Chore(Blog): Removed old path after slug rename - ${title}`,
            sha: sha,
            branch: activeSite.branch
          })
        });
      } catch (cleanupErr) {
        console.error('Old path cleanup after slug rename failed:', cleanupErr);
      }
    }

    // 2. UNUSED IMAGE CLEANUP LOGIC (R2)
    if (usedImages && Array.isArray(usedImages)) {
      const userEmail = locals.user?.email || 'anonymous';
      const trackerPath = originalPath || '';
      const kvTrackerKey = trackerPath
        ? `tracker_images:cms:${userEmail}:${trackerPath}`
        : `tracker_images:cms:${userEmail}:new`;
      
      let trackedImages = await env.CACHE_KV.get(kvTrackerKey, "json") || [];
      
      for (const img of trackedImages as {fileName: string}[]) {
        const isUsed = usedImages.some(u => u.includes(img.fileName));
        
        if (!isUsed && env.IMG_BUCKET) {
           await env.IMG_BUCKET.delete(img.fileName).catch(() => {});
           console.log("Cleaned up unused image from R2:", img.fileName);
        }
      }
      
      await env.CACHE_KV.delete(kvTrackerKey);
    }

    // 3. Asynchronous SEO Tasks (Non-blocking sitemap submission and cache pre-warming)
    const runSeoTasks = async () => {
      try {
        const seoClient = getSeoClient('google');
        const sitemapUrl = `${getActiveSite().url}/sitemap-index.xml`;
        // Submit Sitemap
        await seoClient.submitSitemap(sitemapUrl, env);
      } catch (seoErr) {
        console.error('Background SEO tasks failed:', seoErr);
      }
    };

    const runtimeCtx = (locals as any).cfContext || (locals as any).runtime?.ctx;
    if (runtimeCtx && typeof runtimeCtx.waitUntil === 'function') {
      runtimeCtx.waitUntil(runSeoTasks());
    } else {
      // Fallback for development/local execution
      runSeoTasks().catch((err) => console.error('Local background SEO task failed:', err));
    }


    return new Response(JSON.stringify({
      success: true,
      message: isUpdatingSamePath ? "Updated!" : "Published!",
      path: contentPath,
      author: authorProfile.name
    }), { status: 200 });

  } catch (error: any) {
    console.error("Publish API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}