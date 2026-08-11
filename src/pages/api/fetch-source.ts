// src/pages/api/fetch-source.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite'];

function jsonErr(message: string, status: number, extra: Record<string, any> = {}) {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json();
    const { source, input, cat, index, includeQuiz, quizTopic, quizCount, newsCountry, includeTable, tableTopic } = body;

    const apiKey = env.GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
    if (!apiKey) return jsonErr('Gemini API Key is missing in .env!', 500);

    let rawText = '';
    let originalTitle = (input || '').toString();
    let sourceUrl = '';

    if (source === 'default_rss') {
      const gnewsKey = env.GNEWS_API_KEY || import.meta.env.GNEWS_API_KEY;
      if (!gnewsKey) return jsonErr('GNews API Key is missing in .env!', 500);
      const gnewsCat = (cat || 'general').toString().toLowerCase();
      const country = newsCountry || 'in';
      const cacheKey = `gnews_${gnewsCat}_${country}`;

      let data: any = await env.CACHE_KV.get(cacheKey, 'json');
      if (!data) {
        const gnewsUrl = `https://gnews.io/api/v4/top-headlines?category=${gnewsCat}&lang=en&country=${country}&max=10&apikey=${gnewsKey}`;
        const r = await fetch(gnewsUrl);
        if (!r.ok) return jsonErr(`GNews Fetch Failed: ${r.status}`, 502);
        data = await r.json();
        if (!data.articles || data.articles.length === 0) {
          return jsonErr('No articles found for this category/country', 404);
        }
        await env.CACHE_KV.put(cacheKey, JSON.stringify(data), { expirationTtl: 7200 });
      }

      const idx = (parseInt(index) - 1) || 0;
      const article = data.articles[idx] || data.articles[0];
      originalTitle = article.title;
      sourceUrl = article.url;
    } else if (source === 'custom_rss') {
      const r = await fetch(input, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      const text = await r.text();
      if (!r.ok) return jsonErr(`Custom RSS Fetch Failed: ${r.status}`, 502);
      const items = text.match(/<item>[\s\S]*?<\/item>/gi);
      if (!items || items.length === 0) return jsonErr('No RSS items found', 404);
      const first = items[0];
      const t = first.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i);
      const l = first.match(/<link>(.*?)<\/link>/i);
      if (t) originalTitle = t[1];
      if (l) sourceUrl = l[1];
    } else if (source === 'url') {
      sourceUrl = input;
    }

    if (sourceUrl) {
      const r = await fetch(sourceUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        redirect: 'follow',
      });
      let html = await r.text();
      if (source === 'url') {
        const tm = html.match(/<title>(.*?)<\/title>/i);
        if (tm) originalTitle = tm[1];
      }
      rawText = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/(<([^>]+)>)/gi, ' ')
        .replace(/\s+/g, ' ')
        .substring(0, 15000);
    }

    let prompt = '';
    if (source === 'only_quiz') {
      prompt = `You are an expert educator and SEO writer. Task: Create an SEO-friendly Quiz article on the topic: "${input}".
Return STRICTLY as JSON: { "title": "Catchy SEO Title (MAX 60 chars) - MUST INCLUDE words like 'Quiz' or 'MCQs'", "meta_description": "SEO description (MAX 150 chars) - MUST MENTION it contains a Quiz", "seo_slug": "url-friendly-slug", "label": "Quiz", "seo_tags": "comma separated seo tags", "content": "Full article in Markdown", "ai_summary": "A brief AI-generated summary of the article (1-2 sentences)", "image_prompt": "detailed AI image prompt for the topic", "image_alt": "8 to 10 words alt text", "image_title": "Attractive title text for the image" }

CONTENT INSTRUCTIONS:
1. Start with a catchy H2 heading.
2. Write exactly 2 SEO paragraphs introducing the topic and why this quiz helps.
3. Generate EXACTLY ${quizCount || 15} multiple-choice questions in Markdown — each with 4 options (A-D), mark the correct one in **bold**, followed by an "Explanation:" line.`;
    } else {
      let quizInstruction = '';
      if (includeQuiz) {
        quizInstruction = `\n\nAt the very end, add a "## Test Your Knowledge (MCQs)" section with exactly ${quizCount || 10} multiple-choice questions on "${quizTopic || originalTitle}", each with 4 options where the correct one is in **bold**, followed by "Explanation:".`;
      }
      let tableInstruction = '';
      if (includeTable) {
        tableInstruction = `\n\nWithin the article content (preferably in the middle, after a few paragraphs), add a highly detailed comparison or data table about "${tableTopic || originalTitle}" formatted in Markdown table syntax. Include at least 3-4 columns and 4-6 rows of useful comparative data.`;
      }
      prompt = `You are an expert journalist and SEO writer.${
        sourceUrl
          ? `\nTitle: "${originalTitle}"\nSource text: "${rawText}"\nTask: Rewrite the FULL article — do not just summarize, add valuable context and background, make it informative and engaging.`
          : `\nTask: Write a comprehensive, original article about: "${originalTitle || input}".`
      }
Use clear ## and ### headings, bullet points where useful, an authoritative and factually accurate tone. Write completely in Markdown.${tableInstruction}${quizInstruction}
Return STRICTLY as JSON: { "title": "Catchy SEO Title (MAX 60 chars)", "meta_description": "SEO description (MAX 150 chars)", "seo_slug": "url-friendly-slug", "label": "Category name", "seo_tags": "comma, separated, seo, tags", "content": "Full article in Markdown", "ai_summary": "A brief AI-generated summary of the article (1-2 sentences)", "image_prompt": "A highly detailed prompt for an AI image generator describing the featured image", "image_alt": "8 to 10 words alt text for the image", "image_title": "Attractive title text for the image" }`;
    }

    let result: any = null;
    const logs: any[] = [];

    for (const model of GEMINI_MODELS) {
      logs.push({ time: new Date().toLocaleTimeString(), model, status: 'INFO', message: `Trying ${model}...` });
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    meta_description: { type: 'string' },
                    seo_slug: { type: 'string' },
                    label: { type: 'string' },
                    seo_tags: { type: 'string' },
                    content: { type: 'string' },
                    ai_summary: { type: 'string' },
                    image_prompt: { type: 'string' },
                    image_alt: { type: 'string' },
                    image_title: { type: 'string' }
                  },
                  required: [
                    'title',
                    'meta_description',
                    'seo_slug',
                    'label',
                    'seo_tags',
                    'content',
                    'ai_summary',
                    'image_prompt',
                    'image_alt',
                    'image_title'
                  ]
                }
              },
            }),
          }
        );
        const data = await r.json();
        if (!r.ok) {
          logs.push({ time: new Date().toLocaleTimeString(), model, status: 'FAILED', message: data.error?.message || `HTTP ${r.status}` });
          continue;
        }
        if (data.candidates?.length) {
          result = JSON.parse(data.candidates[0].content.parts[0].text);
          logs.push({ time: new Date().toLocaleTimeString(), model, status: 'SUCCESS', message: 'Generated!' });
          break;
        }
        logs.push({ time: new Date().toLocaleTimeString(), model, status: 'FAILED', message: 'Empty candidates (safety block)' });
      } catch (e: any) {
        logs.push({ time: new Date().toLocaleTimeString(), model, status: 'FAILED', message: e.message });
      }
    }

    if (!result) return jsonErr('All AI models failed', 500, { logs });

    result.original_article_url = sourceUrl;
    result.logs = logs;
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return jsonErr(e.message, 500);
  }
};