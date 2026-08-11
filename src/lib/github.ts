// src/lib/github.ts

const GITHUB_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github.v3+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Cache-Control': 'no-cache',
  'User-Agent': 'Astro-Dashboard-App',
});

// ─── Types ───────────────────────────────────────────────────────────────────
export interface PostMeta {
  name: string;
  path: string;
  sha: string;
  slug: string;
  title: string;
  publishedAt: string | null;
}

interface KVLike {
  get: (key: string, type?: any) => Promise<any>;
  put: (key: string, value: string, opts?: any) => Promise<void>;
  delete?: (key: string) => Promise<void>;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const CATALOG_CACHE_TTL = 86400; // 24 hours
const BATCH_CONCURRENCY = 5;    // Max parallel GitHub API calls at once

// ─── Get all published .md/.mdx files (lightweight — names only) ─────────────
export async function getPublishedPosts(
  owner: string,
  repo: string,
  contentPath: string,
  token: string
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${contentPath}?t=${Date.now()}`;

  try {
    const response = await fetch(url, { 
      headers: GITHUB_HEADERS(token),
      cache: 'no-store'
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`GitHub API Failed: ${response.status} - ${errText}`);
      throw new Error(`GitHub API Error: ${response.statusText}`);
    }

    const data = await response.json();

    if (Array.isArray(data)) {
      return data
        .filter((file) => file.name.endsWith('.md') || file.name.endsWith('.mdx'))
        .map((file) => ({
          name: file.name,
          path: file.path,
          sha: file.sha,
          download_url: file.download_url,
          slug: file.name.replace(/\.mdx?$/, ''),
        }));
    }
    return [];
  } catch (error) {
    console.error('getPublishedPosts Error:', error);
    return [];
  }
}

// ─── Title extraction from markdown frontmatter ──────────────────────────────
function extractTitleFromMarkdown(content: string): string {
  const match = content.match(/^title:\s*"((?:[^"\\]|\\.)*)"/m) || 
                content.match(/^title:\s*'((?:[^'\\]|\\.)*)'/m) ||
                content.match(/^title:\s*(.+)$/m);
  if (match) {
    let t = match[1].trim();
    if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1);
    if (t.startsWith("'") && t.endsWith("'")) t = t.slice(1, -1);
    return t.replace(/\\"/g, '"').trim();
  }
  return '';
}

// ─── Validate title is not corrupted (mojibake) ─────────────────────────────
function isCorruptedTitle(title: string): boolean {
  return title.includes('Ã¤') || title.includes('Ã¥');
}

// ─── Batched async processing with concurrency limit ─────────────────────────
async function processBatched<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── getPostsCatalog — Smart KV-first post catalog ───────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Strategy:
//   1. KV cache HIT  → Return immediately (0 GitHub API calls)
//   2. KV cache MISS →
//      a. GitHub Contents API to list files (1 call)
//      b. Load old metadata cache (dates + titles from previous runs)
//      c. Only fetch metadata for UNCACHED posts (batched, 5 at a time)
//      d. Save merged catalog to KV
//
// This replaces getPublishedPostsWithDates() which made 100+ parallel calls.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function getPostsCatalog(
  owner: string,
  repo: string,
  contentPath: string,
  token: string,
  branch: string,
  kv?: KVLike
): Promise<{ posts: PostMeta[]; totalCount: number }> {
  const catalogKey = `posts-catalog:${owner}/${repo}`;
  const metadataKey = `metadata:${owner}/${repo}:${contentPath}`;

  // ── 1. Try full catalog cache first (fastest path: 0 API calls) ────────
  if (kv) {
    try {
      const cached = await kv.get(catalogKey, 'json') as PostMeta[] | null;
      if (cached && Array.isArray(cached) && cached.length > 0) {
        return { posts: cached, totalCount: cached.length };
      }
    } catch {
      // KV read failed — fall through to live fetch
    }
  }

  // ── 2. Catalog cache miss — fetch file list from GitHub (1 API call) ───
  const fileList = await getPublishedPosts(owner, repo, contentPath, token);
  if (fileList.length === 0) {
    return { posts: [], totalCount: 0 };
  }

  // ── 3. Load existing metadata cache (dates + titles from previous runs) ─
  let metadataCache: Record<string, { publishedAt: string | null; title: string }> = {};
  if (kv) {
    try {
      const cached = await kv.get(metadataKey, 'json');
      if (cached) metadataCache = cached;
    } catch {
      // ignore
    }
  }

  // ── 4. Separate cached vs uncached posts ────────────────────────────────
  const cachedPosts: PostMeta[] = [];
  const uncachedFiles: typeof fileList = [];

  for (const file of fileList) {
    const meta = metadataCache[file.path];
    if (meta && meta.publishedAt && meta.title && !isCorruptedTitle(meta.title)) {
      // Fully cached — no API calls needed
      cachedPosts.push({
        name: file.name,
        path: file.path,
        sha: file.sha,
        slug: file.slug,
        title: meta.title,
        publishedAt: meta.publishedAt,
      });
    } else {
      uncachedFiles.push(file);
    }
  }

  // ── 5. Batched fetch for uncached posts only (5 at a time) ──────────────
  let metadataUpdated = false;

  const newlyFetched = await processBatched(
    uncachedFiles,
    async (file) => {
      let publishedAt: string | null = metadataCache[file.path]?.publishedAt || null;
      let title: string = metadataCache[file.path]?.title || '';
      if (title && isCorruptedTitle(title)) title = '';

      // Fetch commit date if missing
      if (!publishedAt) {
        try {
          const commitUrl = `https://api.github.com/repos/${owner}/${repo}/commits?path=${encodeURIComponent(file.path)}&sha=${branch}&per_page=1&t=${Date.now()}`;
          const res = await fetch(commitUrl, { 
            headers: GITHUB_HEADERS(token),
            cache: 'no-store'
          });
          if (res.ok) {
            const commits = await res.json();
            publishedAt = Array.isArray(commits) && commits.length > 0
              ? (commits[0].commit?.author?.date || commits[0].commit?.committer?.date || null)
              : null;
          }
        } catch {
          // skip — will retry on next catalog build
        }
      }

      // Fetch title if missing
      if (!title) {
        try {
          const rawFile = await getFileContent(owner, repo, file.path, token);
          if (rawFile) {
            title = extractTitleFromMarkdown(rawFile.content);
            if (isCorruptedTitle(title)) title = '';
          }
        } catch {
          // skip
        }
      }

      // Update metadata cache for this post
      if (publishedAt || title) {
        metadataCache[file.path] = { publishedAt, title };
        metadataUpdated = true;
      }

      return {
        name: file.name,
        path: file.path,
        sha: file.sha,
        slug: file.slug,
        title: title || file.slug,
        publishedAt,
      } as PostMeta;
    },
    BATCH_CONCURRENCY
  );

  // ── 6. Merge all posts ──────────────────────────────────────────────────
  const allPosts = [...cachedPosts, ...newlyFetched];

  // ── 7. Save to KV caches ────────────────────────────────────────────────
  if (kv) {
    try {
      // Save full catalog (fast lookup — 0 API calls on next request)
      await kv.put(catalogKey, JSON.stringify(allPosts), { expirationTtl: CATALOG_CACHE_TTL });
    } catch {
      // ignore write errors
    }

    if (metadataUpdated) {
      try {
        // Save metadata cache (survives catalog expiry — reduces API calls on rebuild)
        await kv.put(metadataKey, JSON.stringify(metadataCache), { expirationTtl: CATALOG_CACHE_TTL });
      } catch {
        // ignore
      }
    }
  }

  return { posts: allPosts, totalCount: allPosts.length };
}


// ─── Get recent commits ──────────────────────────────────────────────────────
export async function getRecentCommits(
  owner: string,
  repo: string,
  branch: string,
  token: string,
  limit = 6
): Promise<
  Array<{
    sha: string;
    shortSha: string;
    message: string;
    author: string;
    date: string;
    url: string;
  }>
> {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&per_page=${limit}&t=${Date.now()}`;

  try {
    const response = await fetch(url, { 
      headers: GITHUB_HEADERS(token),
      cache: 'no-store'
    });

    if (!response.ok) {
      console.error(`Commits API Failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data.map((commit: any) => ({
      sha: commit.sha || '',
      shortSha: (commit.sha || '').slice(0, 7),
      message: ((commit.commit?.message || 'No message').split('\n')[0]).slice(0, 80),
      author:
        commit.commit?.author?.name ||
        commit.author?.login ||
        'Unknown',
      date: commit.commit?.author?.date || '',
      url: commit.html_url || '',
    }));
  } catch (error) {
    console.error('getRecentCommits Error:', error);
    return [];
  }
}

// ─── Get raw file content by path ────────────────────────────────────────────
export async function getFileContent(
  owner: string,
  repo: string,
  filePath: string,
  token: string
): Promise<{ content: string; sha: string } | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?t=${Date.now()}`;

  try {
    const response = await fetch(url, { 
      headers: GITHUB_HEADERS(token),
      cache: 'no-store'
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.content) return null;

    const binaryString = atob(data.content.replace(/\s/g, ''));
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const decoded = new TextDecoder('utf-8').decode(bytes);
    return { content: decoded, sha: data.sha };
  } catch (error) {
    console.error('getFileContent Error:', error);
    return null;
  }
}