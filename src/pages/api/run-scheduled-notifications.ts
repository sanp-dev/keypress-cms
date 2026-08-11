// src/pages/api/run-scheduled-notifications.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { sendPushToAll } from '../../lib/firebase-messaging';
import { getPostNotificationData } from '../../lib/post-metadata';
import { sitesConfig, getActiveSite } from '../../config/sitesConfig';

export const GET: APIRoute = async (context) => {
  try {
    const { url } = context || {};

    // 1. Security Check
    const secret = url?.searchParams?.get('secret');
    const expectedSecret = env.CRON_SECRET || import.meta.env.CRON_SECRET || 'change_this_cron_secret_key';
    
    if (secret !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized secret token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!env || !env.DB) {
      return new Response(JSON.stringify({ error: 'DB binding missing' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch pending notifications that are due (scheduled_time <= current time)
    const nowIso = new Date().toISOString();
    const pendingRes = await env.DB.prepare(
      `SELECT * FROM scheduled_notifications 
       WHERE status = 'pending' AND scheduled_time <= ? 
       ORDER BY scheduled_time ASC`
    )
      .bind(nowIso)
      .all();

    const pendingList = pendingRes.results || [];
    if (pendingList.length === 0) {
      return new Response(JSON.stringify({ message: 'No pending scheduled notifications due.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const serviceAccountJson = env.FIREBASE_SERVICE_ACCOUNT_JSON || import.meta.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      return new Response(JSON.stringify({ error: 'FIREBASE_SERVICE_ACCOUNT_JSON is not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const processed = [];

    // 3. Process each due notification
    for (const notif of pendingList) {
      try {
        console.log(`Processing scheduled push ID: ${notif.id} for slug: ${notif.slug}`);
        
        let title = notif.title;
        let body = notif.body;
        let image = notif.image;
        let clickUrl = notif.url;

        // If title is null, fetch the original post metadata from markdown frontmatter
        if (!title) {
          try {
            const token = env.GITHUB_PAT || import.meta.env.GITHUB_PAT || '';
            const site = getActiveSite();
            const imageBaseUrl = env.IMAGE_PUBLIC_BASE_URL || import.meta.env.IMAGE_PUBLIC_BASE_URL || '';

            const meta = await getPostNotificationData(
              notif.slug,
              site.githubOwner,
              site.githubRepo,
              site.contentPath,
              token,
              site.url,
              imageBaseUrl
            );
            if (meta) {
              title = meta.title || 'New Tech Update';
              body = meta.description || '';
              image = meta.heroImage || '';
              clickUrl = meta.url || '';
            }
          } catch (metaErr) {
            console.error(`Failed to load post metadata for slug ${notif.slug}:`, metaErr);
          }
        }

        const payload = {
          title: title || 'New Tech Update',
          body: body || '',
          image: image || '',
          icon: '/icon.png',
          click_action: clickUrl || '',
        };

        // Send notifications
        const result = await sendPushToAll(env.DB, serviceAccountJson, payload);

        // Delete from database directly since it is completed/processed!
        await env.DB.prepare(
          `DELETE FROM scheduled_notifications WHERE id = ?`
        )
          .bind(notif.id)
          .run();

        processed.push({
          id: notif.id,
          slug: notif.slug,
          status: 'sent',
          result,
        });

      } catch (err: any) {
        console.error(`Scheduled push ID ${notif.id} failed:`, err);
        
        // Delete failed ones too to prevent database clutter
        await env.DB.prepare(
          `DELETE FROM scheduled_notifications WHERE id = ?`
        )
          .bind(notif.id)
          .run();

        processed.push({
          id: notif.id,
          slug: notif.slug,
          status: 'failed',
          error: err.message,
        });
      }
    }

    return new Response(JSON.stringify({ success: true, processed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('run-scheduled-notifications Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
