// src/pages/api/stock-search.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

function jsonErr(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const { query, provider, page = 1 } = await request.json();
    const q = (query || 'news').toString().trim();
    const p = Math.max(1, parseInt(page) || 1);

    let results: { url: string; thumb: string }[] = [];

    if (provider === 'pexels') {
      const key = env.PEXELS_API_KEY || import.meta.env.PEXELS_API_KEY;
      if (!key) return jsonErr('Pexels API Key not found in .env', 500);
      const res = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=30&page=${p}&orientation=landscape`,
        { headers: { Authorization: key } }
      );
      if (!res.ok) return jsonErr(`Pexels API Error: ${res.status}`, 502);
      const data = await res.json();
      results = (data.photos || []).map((ph: any) => ({ url: ph.src.large, thumb: ph.src.medium }));
    } else if (provider === 'pixabay') {
      const key = env.PIXABAY_API_KEY || import.meta.env.PIXABAY_API_KEY;
      if (!key) return jsonErr('Pixabay API Key not found in .env', 500);
      const res = await fetch(
        `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(q)}&per_page=30&page=${p}&orientation=horizontal`
      );
      if (!res.ok) return jsonErr(`Pixabay API Error: ${res.status}`, 502);
      const data = await res.json();
      results = (data.hits || []).map((ph: any) => ({ url: ph.largeImageURL, thumb: ph.previewURL }));
    } else if (provider === 'unsplash') {
      const key = env.UNSPLASH_API_KEY || import.meta.env.UNSPLASH_API_KEY;
      if (!key) return jsonErr('Unsplash API Key not found in .env', 500);
      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=30&page=${p}&orientation=landscape`,
        { headers: { Authorization: `Client-ID ${key}` } }
      );
      if (!res.ok) return jsonErr(`Unsplash API Error: ${res.status}`, 502);
      const data = await res.json();
      results = (data.results || []).map((ph: any) => ({ url: ph.urls.regular, thumb: ph.urls.small }));
    } else {
      return jsonErr('Invalid provider', 400);
    }

    return new Response(JSON.stringify(results), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return jsonErr(e.message, 500);
  }
};