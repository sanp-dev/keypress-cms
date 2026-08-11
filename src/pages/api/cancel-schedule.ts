// src/pages/api/cancel-schedule.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { slug } = body;

    if (!slug) {
      return new Response(
        JSON.stringify({ success: false, error: 'slug is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, error: 'D1 database binding (DB) is not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Delete pending schedules for this slug to cancel them
    await env.DB.prepare(
      `DELETE FROM scheduled_notifications 
       WHERE slug = ? AND status = 'pending'`
    )
      .bind(slug)
      .run();

    return new Response(
      JSON.stringify({ success: true, message: 'Scheduled push cancelled successfully!' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('POST /api/cancel-schedule Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
