/// <reference types="astro/client" />
/// <reference path="../worker-configuration.d.ts" /> <!-- Run `npm run generate-types` to create this file -->

interface Env {
  CACHE_KV:     KVNamespace;
  SESSION:      KVNamespace;
  IMG_BUCKET:   R2Bucket;
  STORY_BUCKET: R2Bucket;
  VID_BUCKET:   R2Bucket;
  AI:           Ai;

  // wrangler.deploy.json vars
  IMAGE_PUBLIC_BASE_URL: string;
  BLOG_BASE_URL:         string;
  CF_ZONE_TAG:           string;
  BING_INDEXNOW_KEY:     string;
  BING_WEBMASTER_API_KEY: string;
  VID_PUBLIC_BASE_URL:   string;

  // D1 Database
  DB: D1Database;

  // Secrets — set via: npx wrangler secret put SECRET_NAME
  USERS_JSON: string;
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
}

declare namespace App {
  interface Locals {
    runtime: {
      env: Env;
      ctx: ExecutionContext;
    };
    // Middleware stores authenticated user data here
    user?: {
      email: string;
      role:  import('./lib/auth').UserRole;
    };
  }
}