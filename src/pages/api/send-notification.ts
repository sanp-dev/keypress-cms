// src/pages/api/send-notification.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { sitesConfig, getActiveSite } from '../../config/sitesConfig';
import { sendPushToAll } from '../../lib/firebase-messaging';
import { getPostNotificationData } from '../../lib/post-metadata';

// ─── GET: Fetch post metadata for the edit-notification modal ─────────────────
export const GET: APIRoute = async ({ url }) => {
  try {
    const slug = url.searchParams.get('slug');
    if (!slug) {
      return new Response(JSON.stringify({ error: 'slug parameter is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = env.GITHUB_PAT || import.meta.env.GITHUB_PAT;
    if (!token) {
      return new Response(JSON.stringify({ error: 'GitHub PAT not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const site = getActiveSite();
    const imageBaseUrl = env.IMAGE_PUBLIC_BASE_URL || import.meta.env.IMAGE_PUBLIC_BASE_URL || '';

    const postData = await getPostNotificationData(
      slug,
      site.githubOwner,
      site.githubRepo,
      site.contentPath,
      token,
      site.url,
      imageBaseUrl
    );

    if (!postData) {
      return new Response(JSON.stringify({ error: `Post "${slug}" not found` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(postData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('GET /api/send-notification Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// ─── POST: Send push notification ─────────────────────────────────────────────
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { slug, title, body: notifBody, image, url: clickUrl } = body;

    if (!slug) {
      return new Response(
        JSON.stringify({ success: false, error: 'slug is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate Firebase secret
    const serviceAccountJson =
      env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      import.meta.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'FIREBASE_SERVICE_ACCOUNT_JSON secret is not configured. Run: wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate D1 binding
    if (!env.DB) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'D1 database binding (DB) is not configured',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch post metadata from GitHub
    const githubToken = env.GITHUB_PAT || import.meta.env.GITHUB_PAT;
    const site = getActiveSite();
    const imageBaseUrl = env.IMAGE_PUBLIC_BASE_URL || import.meta.env.IMAGE_PUBLIC_BASE_URL || '';

    const postData = await getPostNotificationData(
      slug,
      site.githubOwner,
      site.githubRepo,
      site.contentPath,
      githubToken,
      site.url,
      imageBaseUrl
    );

    if (!postData) {
      return new Response(
        JSON.stringify({ success: false, error: `Post "${slug}" not found on GitHub` }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Build notification payload — user overrides take priority
    const payload = {
      title: title || postData.title,
      body: notifBody || postData.description,
      image: image || postData.heroImage,
      icon: '/icon.png',
      click_action: clickUrl || postData.url,
    };

    // Send to all subscribers
    const result = await sendPushToAll(env.DB, serviceAccountJson, payload);

    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('POST /api/send-notification Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
