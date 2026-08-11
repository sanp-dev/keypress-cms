// src/pages/api/schedule-notification.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { slug, title, body: notifBody, image, url, scheduled_time } = body;

    if (!slug || !scheduled_time) {
      return new Response(
        JSON.stringify({ success: false, error: 'slug and scheduled_time are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, error: 'D1 database binding (DB) is not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Insert the scheduled notification into the D1 table
    await env.DB.prepare(
      `INSERT INTO scheduled_notifications (slug, title, body, image, url, scheduled_time, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`
    )
      .bind(
        slug,
        title || null,
        notifBody || null,
        image || null,
        url || null,
        new Date(scheduled_time).toISOString()
      )
      .run();

    return new Response(
      JSON.stringify({ success: true, message: 'Notification scheduled successfully!' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('POST /api/schedule-notification Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
