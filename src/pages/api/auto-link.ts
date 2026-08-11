// src/pages/api/auto-link.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getActiveSite } from '../../config/sitesConfig';
import { getPublishedPosts } from '../../lib/github';

export const POST: APIRoute = async ({ request }) => {
  const logs: { level: string; message: string; detail?: string }[] = [];

  function log(level: 'INFO' | 'SUCCESS' | 'ERROR' | 'WARN', message: string, detail?: any) {
    const detailStr = detail !== undefined
      ? (detail instanceof Error ? (detail.stack || detail.message) : typeof detail === 'object' ? JSON.stringify(detail, null, 2) : String(detail))
      : undefined;
    logs.push({ level, message, detail: detailStr });
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](`[auto-link][${level}] ${message}`, detail ?? '');
  }

  try {
    const { html } = await request.json();

    log('INFO', `Request received. HTML length: ${html?.length ?? 0} chars`);

    if (!html) {
      log('ERROR', 'HTML content missing in request body');
      return new Response(JSON.stringify({ error: "HTML content is missing", logs }), { status: 400 });
    }

    const apiKey = env.GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
    if (!apiKey) {
      log('ERROR', 'GEMINI_API_KEY environment variable is not set');
      return new Response(JSON.stringify({ error: "Gemini API Key is missing in .env", logs }), { status: 500 });
    }
    log('INFO', 'Gemini API Key: present ✓');

    // ── Resolve dynamic site base URL ──
    const activeSite = getActiveSite();
    const rawBlogBaseUrl = (env as any)?.BLOG_BASE_URL || (import.meta as any).env?.BLOG_BASE_URL || activeSite?.url || 'https://YOUR-BLOG-DOMAIN.com';
    const BLOG_BASE_URL = rawBlogBaseUrl.replace(/\/+$/, '');
    log('INFO', `Resolved Blog Base URL: ${BLOG_BASE_URL}`);

    // ── Step 1: RSS से articles fetch करें ──
    let suggestions: { title: string; url: string }[] = [];

    const rssCandidates = [
      `${BLOG_BASE_URL}/rss.xml`,
      `${BLOG_BASE_URL}/feed.xml`,
      `${BLOG_BASE_URL}/rss`
    ];

    for (const rssUrl of rssCandidates) {
      log('INFO', `Fetching RSS feed from: ${rssUrl}`);
      try {
        const rssRes = await fetch(rssUrl, {
          headers: { 'User-Agent': 'QuicDecode-CMS/1.0' },
          signal: AbortSignal.timeout(10000),
        });

        log('INFO', `RSS (${rssUrl}) response status: ${rssRes.status} ${rssRes.statusText}`);

        if (rssRes.ok) {
          const rssText = await rssRes.text();
          log('INFO', `RSS content fetched. Size: ${rssText.length} bytes`);

          const items = [...rssText.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/gi)];
          log('INFO', `RSS items matched via regex: ${items.length}`);

          items.forEach(match => {
            const title = match[1].trim();
            const url = match[2].trim();
            if (title && url) suggestions.push({ title, url });
          });

          if (suggestions.length > 0) {
            log('SUCCESS', `RSS parsed successfully. Articles found: ${suggestions.length}`, suggestions.slice(0, 5));
            break;
          }
        }
      } catch (e: any) {
        log('WARN', `RSS fetch exception for ${rssUrl}`, e instanceof Error ? e.message : String(e));
      }
    }

    // ── Step 2: Sitemap fallback ──
    if (suggestions.length === 0) {
      const sitemapCandidates = [
        `${BLOG_BASE_URL}/sitemap-posts.xml`,
        `${BLOG_BASE_URL}/sitemap-index.xml`,
        `${BLOG_BASE_URL}/sitemap-0.xml`,
        `${BLOG_BASE_URL}/sitemap.xml`
      ];
      log('INFO', 'RSS yielded 0 results. Trying sitemap fallbacks...');

      for (const sitemapUrl of sitemapCandidates) {
        log('INFO', `Trying sitemap: ${sitemapUrl}`);
        try {
          const sitemapRes = await fetch(sitemapUrl, {
            headers: { 'User-Agent': 'QuicDecode-CMS/1.0' },
            signal: AbortSignal.timeout(10000),
          });

          if (sitemapRes.ok) {
            const sitemapText = await sitemapRes.text();

            // Check if this is a sitemap index containing child sitemaps (e.g. sitemap-0.xml)
            const childSitemaps = [...sitemapText.matchAll(/<loc>(https?:\/\/[^<]+\.xml)<\/loc>/gi)].map(m => m[1].trim());
            const sitemapsToParse = childSitemaps.length > 0 ? childSitemaps : [sitemapUrl];

            for (const targetSitemap of sitemapsToParse) {
              let textToParse = sitemapText;
              if (targetSitemap !== sitemapUrl) {
                const childRes = await fetch(targetSitemap, {
                  headers: { 'User-Agent': 'QuicDecode-CMS/1.0' },
                  signal: AbortSignal.timeout(10000),
                });
                if (!childRes.ok) continue;
                textToParse = await childRes.text();
              }

              const urls = [...textToParse.matchAll(/<loc>(.*?)<\/loc>/gi)];
              urls.forEach(match => {
                const url = match[1].trim();
                if (
                  url.endsWith('.xml') ||
                  url === BLOG_BASE_URL ||
                  url === `${BLOG_BASE_URL}/` ||
                  url.includes('/tags/') ||
                  url.includes('/category/')
                ) return;

                const slug = url.split('/').filter(Boolean).pop() || '';
                const title = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                if (title && !suggestions.some(s => s.url === url)) {
                  suggestions.push({ title, url });
                }
              });
            }

            if (suggestions.length > 0) {
              log('SUCCESS', `Sitemap parsed successfully. Articles extracted: ${suggestions.length}`);
              break;
            }
          } else {
            log('WARN', `Sitemap ${sitemapUrl} returned status ${sitemapRes.status}`);
          }
        } catch (e: any) {
          log('WARN', `Sitemap fetch exception for ${sitemapUrl}`, e instanceof Error ? e.message : String(e));
        }
      }
    }

    // ── Step 3: GitHub repository fallback (if RSS & Sitemap both return 0) ──
    if (suggestions.length === 0) {
      log('INFO', 'RSS and Sitemap yielded 0 articles. Attempting GitHub repository fallback...');
      try {
        const token = (env as any)?.GITHUB_PAT || (import.meta as any).env?.GITHUB_PAT;
        if (token && activeSite.githubOwner && activeSite.githubRepo) {
          const githubPosts = await getPublishedPosts(
            activeSite.githubOwner,
            activeSite.githubRepo,
            activeSite.contentPath,
            token
          );

          githubPosts.forEach(post => {
            const slug = post.slug;
            const title = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const url = `${BLOG_BASE_URL}/${slug}`;
            if (title && url) suggestions.push({ title, url });
          });

          log('SUCCESS', `GitHub fallback parsed. Articles extracted: ${suggestions.length}`);
        } else {
          log('WARN', 'GitHub fallback skipped: GITHUB_PAT token or repository configuration missing.');
        }
      } catch (e: any) {
        log('ERROR', 'GitHub fallback exception', e instanceof Error ? e.message : String(e));
      }
    }

    if (suggestions.length === 0) {
      log('ERROR', 'No published articles found from RSS, Sitemap, or GitHub fallback. Cannot proceed with auto-linking.');
      return new Response(JSON.stringify({
        error: `No find any published article. Blog URL "${BLOG_BASE_URL}" पर RSS (${BLOG_BASE_URL}/rss.xml) या Sitemap accessible होना चाहिए।`,
        logs
      }), { status: 400 });
    }

    // ── Step 3: Current article title निकालें (for exclusion) ──
    // HTML में पहला <h1> या <h2> tag से title guess करें
    const currentTitleMatch = html.match(/<h[12][^>]*>(.*?)<\/h[12]>/i);
    const currentTitle = currentTitleMatch ? currentTitleMatch[1].replace(/<[^>]+>/g, '').trim().toLowerCase() : '';

    // Current article के URL को suggestions से exclude करें
    const filteredSuggestions = suggestions.filter(s => {
      const slugFromUrl = s.url.split('/').filter(Boolean).pop() || '';
      return s.title.toLowerCase() !== currentTitle && !html.includes(s.url);
    });

    log('INFO', `Suggestions after filtering current article: ${filteredSuggestions.length} of ${suggestions.length}`);

    const topSuggestions = filteredSuggestions.slice(0, 80);
    log('INFO', `Sending top ${topSuggestions.length} article suggestions to Gemini AI`);

    // ── Step 4: Gemini AI call ──
    const aiInstruction = `You are an Expert SEO Editor strictly following Google's latest helpful content and internal linking guidelines.
Task: Add internal links to the provided HTML.
Available Links (Live Published Articles): ${JSON.stringify(topSuggestions)}

Google SEO Guidelines to Follow:
1. Natural Anchor Text: Link naturally occurring, descriptive phrases inside <p> tags. DO NOT use exact-match keyword stuffing.
2. High Relevance: Only link to an article if it provides genuine contextual value.
3. User Experience ('Also Read'): Insert EXACTLY TWO 'Also Read' blocks between major paragraphs.
Use this exact HTML format: <p style="padding:12px;border-radius:4px;font-weight:700;margin:15px 0;">Also Read: <a href="..." style="color:#1a73e8;text-decoration:underline;">[Insert Exact Title Here]</a></p>
4. Link Density: Insert a maximum of 3 to 5 internal links in total.
5. Output constraint: Return ONLY the raw modified HTML without any markdown formatting (\`\`\`html) or explanations.

Original HTML:
${html}`;

    // ── model name fix ──
    const models = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.5-flash-lite"];
    let finalHtml: string | null = null;
    let successModel: string | null = null;

    for (const modelId of models) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
      log('INFO', `Trying Gemini model: ${modelId}`);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(60000),
          body: JSON.stringify({
            contents: [{ parts: [{ text: aiInstruction }] }],
            generationConfig: { temperature: 0.3 }
          })
        });

        log('INFO', `${modelId} response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
          const errBody = await response.text().catch(() => '(unreadable)');
          log('WARN', `${modelId} returned non-OK`, errBody.substring(0, 400));
          continue;
        }

        const data = await response.json();

        if (data.error) {
          log('WARN', `${modelId} API error in response body`, data.error);
          continue;
        }

        const candidate = data.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text;

        if (!text) {
          log('WARN', `${modelId}: No text in response`, JSON.stringify(data).substring(0, 300));
          continue;
        }

        finalHtml = text;
        successModel = modelId;
        log('SUCCESS', `✅ AI linking completed by model: ${modelId}. Response length: ${text.length} chars`);
        break;

      } catch (e: any) {
        log('ERROR', `${modelId} threw exception`, e instanceof Error ? e.message : String(e));
      }
    }

    if (!finalHtml || !successModel) {
      log('ERROR', 'All Gemini models failed. Auto-linking aborted.');
      return new Response(JSON.stringify({
        error: 'सभी Gemini AI models fail हो गए। Console Logs देखें।',
        logs
      }), { status: 500 });
    }

    // ── Step 5: Clean output ──
    let cleanHtml = finalHtml
      .replace(/^```html\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    log('SUCCESS', `Auto-linking done. Final HTML length: ${cleanHtml.length} chars. Model used: ${successModel}`);

    return new Response(JSON.stringify({
      html: cleanHtml,
      model: successModel,
      articleCount: filteredSuggestions.length,
      logs
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    log('ERROR', 'Unhandled exception in auto-link handler', error instanceof Error ? error.stack : String(error));
    return new Response(JSON.stringify({
      error: error.message || 'Unknown server error',
      logs
    }), { status: 500 });
  }
};