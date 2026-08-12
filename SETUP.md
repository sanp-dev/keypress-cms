# Keypress CMS — Setup Guide

This guide walks you through deploying Keypress CMS to Cloudflare Workers.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Configure Site Settings](#2-configure-site-settings)
3. [Set Up Dashboard Users (Login Credentials)](#3-set-up-dashboard-users-login-credentials)
4. [Cloudflare Resources Setup](#4-cloudflare-resources-setup)
5. [Configure wrangler.deploy.json](#5-configure-wranglerdeployjson)
6. [Set Cloudflare Worker Secrets](#6-set-cloudflare-worker-secrets)
7. [Deploy](#7-deploy)
8. [Set Custom Domain](#8-set-custom-domain)
9. [Optional: Google Search Console OAuth](#9-optional-google-search-console-oauth)

---

## 1. Prerequisites

- Node.js v22.12.0 or later
- A Cloudflare account (free tier works)
- A GitHub account + GitHub Personal Access Token
- The [keypress-theme](https://github.com/sanp-dev/keypress-theme) repo (or your own Astro blog)

Install dependencies:

```bash
npm install
```

---

## 2. Configure Site Settings

Open `src/config/sitesConfig.ts` and update the site details to match your blog:

```typescript
export const sitesConfig = {
  demoblog: {
    name: 'My Blog',                          // Display name
    url: 'https://my-blog.example.com',       // Blog public URL
    gscProperty: 'sc-domain:example.com',     // Google Search Console property
    githubOwner: 'your-github-username',      // GitHub username
    githubRepo: 'your-blog-repo-name',        // Blog repo name
    branch: 'main',
    contentPath: 'src/content/blog',          // Path to .md/.mdx posts in repo
  }
};
```

---

## 3. Set Up Dashboard Users (Login Credentials)

The dashboard uses PBKDF2-SHA256 hashed passwords stored in the `USERS_JSON` secret.

**Step 1: Generate a password hash**

```bash
npm run hash-password yourpassword
# Output: SALT:HASH (copy this string)
```

**Step 2: Build your USERS_JSON**

Format (JSON array, single line):

```json
[
  {"email":"admin@example.com","hash":"SALT:HASH_FROM_ABOVE","role":"admin"},
  {"email":"writer@example.com","hash":"SALT:HASH_FROM_ABOVE","role":"assistant"}
]
```

Roles:
- `admin` — Full access to all features
- `assistant` — Limited access (no delete, no settings)

**Default demo credentials (change before production):**
- Email: `admin@example.com`
- Password: `Admin@1234`

---

## 4. Cloudflare Resources Setup

Log in to [Cloudflare Dashboard](https://dash.cloudflare.com) and create:

### KV Namespaces (Workers & Pages > KV)

Create two namespaces:

| Binding Name | Purpose              |
|--------------|----------------------|
| `CACHE_KV`   | Post catalog cache   |
| `SESSION`    | User session storage |

Copy their **namespace IDs** for use in `wrangler.deploy.json`.

### R2 Buckets (R2 Object Storage)

Create up to three buckets (names are suggestions, change as needed):

| Binding Name   | Bucket Name | Purpose              |
|----------------|-------------|----------------------|
| `IMG_BUCKET`   | `qd-images` | Blog post images     |
| `STORY_BUCKET` | `qd-stories`| Web Stories (optional)|
| `VID_BUCKET`   | `qd-videos` | Videos (optional)    |

### D1 Database (D1 SQL)

Create one database:

| Binding Name | Database Name | Purpose       |
|--------------|---------------|---------------|
| `DB`         | `qd-cms-db`   | CMS database  |

Copy the **database ID** for use in `wrangler.deploy.json`.

---

## 5. Configure wrangler.deploy.json

Open `wrangler.deploy.json` and replace all `YOUR_*` placeholders:

```json
{
  "name": "your-worker-name",
  "vars": {
    "IMAGE_PUBLIC_BASE_URL": "https://images.your-domain.com",
    "BLOG_BASE_URL": "https://your-blog-domain.com",
    "CF_ZONE_TAG": "your-zone-tag",
    "BING_INDEXNOW_KEY": "your-bing-indexnow-key",
    "VID_PUBLIC_BASE_URL": "https://cdn.your-domain.com",
    "CRON_SECRET": "any-random-secret-string"
  },
  "kv_namespaces": [
    { "binding": "CACHE_KV", "id": "your-cache-kv-id" },
    { "binding": "SESSION",  "id": "your-session-kv-id" }
  ],
  "r2_buckets": [
    { "binding": "IMG_BUCKET",   "bucket_name": "qd-images" },
    { "binding": "STORY_BUCKET", "bucket_name": "qd-stories" },
    { "binding": "VID_BUCKET",   "bucket_name": "qd-videos" }
  ],
  "d1_databases": [
    { "binding": "DB", "database_name": "qd-cms-db", "database_id": "your-d1-db-id" }
  ]
}
```

---

## 6. Set Cloudflare Worker Secrets

Run these commands one by one. Each will prompt you to paste the value:

```bash
npx wrangler secret put GITHUB_PAT
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put GNEWS_API_KEY
npx wrangler secret put PEXELS_API_KEY
npx wrangler secret put PIXABAY_API_KEY
npx wrangler secret put UNSPLASH_API_KEY
npx wrangler secret put CF_ANALYTICS_API_TOKEN
npx wrangler secret put BING_WEBMASTER_API_KEY
npx wrangler secret put USERS_JSON
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
```

For `USERS_JSON`, paste your JSON array (from Step 3) as a single line.

Optional (only if using Google Search Console features):

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REFRESH_TOKEN
```

---

## 7. Deploy

Build and deploy to Cloudflare Workers:

```bash
npm run build
npm run deploy
```

Your dashboard will be available at:
`https://keypress-cms.YOUR-SUBDOMAIN.workers.dev`

---

## 8. Set Custom Domain

To use a custom domain (e.g., `demo-cms.your-domain.com`):

1. Go to Cloudflare Dashboard > Workers & Pages > your worker
2. Click **Settings** > **Triggers** > **Add Custom Domain**
3. Enter your subdomain: `demo-cms.your-domain.com`
4. Cloudflare will automatically provision SSL

Then update `wrangler.deploy.json` to add the route:

```json
"routes": [
  {
    "pattern": "demo-cms.your-domain.com",
    "custom_domain": true
  }
]
```

---

## 9. Optional: Google Search Console OAuth

The dashboard includes Google Search Console integration for indexing and URL inspection.

Run the helper script to get your refresh token:

```bash
npm run get-refresh-token
```

Follow the browser prompts, then set the token as a secret:

```bash
npx wrangler secret put GOOGLE_REFRESH_TOKEN
```
