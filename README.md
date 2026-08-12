# Keypress CMS — Content Management Dashboard

A self-hosted CMS dashboard built with Astro and deployed as a Cloudflare Worker. Designed to manage blog posts, images, and push notifications for the [keypress-theme](https://github.com/sanp-dev/keypress-theme) platform.

## Live Demo & Resources

[![Dashboard Demo](https://img.shields.io/badge/🖥_Dashboard_Demo-demo--cms.quicdecode.com-1a73e8?style=for-the-badge)](https://demo-cms.quicdecode.com)
[![Blog Demo](https://img.shields.io/badge/🌐_Blog_Demo-demo--blog.quicdecode.com-34a853?style=for-the-badge)](https://demo-blog.quicdecode.com)
[![Blog Repository](https://img.shields.io/badge/📦_Blog_GitHub_Repository-keypress--theme-24292e?style=for-the-badge)](https://github.com/sanp-dev/keypress-theme)

## Default Demo Login

> **For demo purposes only — change before any real deployment.**

| Field    | Value                  |
|----------|------------------------|
| Email    | `admin@example.com`    |
| Password | `Admin@1234`           |

## Key Features

- **Post Editor**: Full-featured Markdown/MDX editor with live preview, frontmatter UI, AI writing assist (Gemini), and auto-link injection.
- **Image Manager**: Upload, browse, and manage images stored in Cloudflare R2, with CDN URL copy.
- **Push Notifications**: Send and schedule Firebase web push notifications.
- **Google Search Console**: Index pages, inspect URLs, and view SEO performance.
- **Bing IndexNow**: One-click URL submission to Bing.
- **Analytics Dashboard**: Cloudflare Analytics and post view tracking.
- **Secure Auth**: PBKDF2-SHA256 hashed passwords, session-based login via Cloudflare KV, rate limiting.
- **Stock Image Search**: Integrated Pexels, Pixabay, and Unsplash image search in the editor.

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Framework   | Astro 7 (SSR)                       |
| Adapter     | @astrojs/cloudflare (Worker)        |
| Styling     | Tailwind CSS v3                     |
| Storage     | Cloudflare R2 (images/videos)       |
| Database    | Cloudflare D1 (optional)            |
| Cache       | Cloudflare KV (sessions + catalog)  |
| AI          | Cloudflare AI + Google Gemini       |
| Deploy      | Cloudflare Workers (`wrangler deploy`) |

## Project Structure

```
keypress-cms/
├── scripts/
│   ├── hash-password.mjs      # Generate PBKDF2 password hash
│   └── get-refresh-token.mjs  # Google OAuth refresh token helper
├── src/
│   ├── config/
│   │   ├── sitesConfig.ts     # Blog repo + site URL configuration
│   │   └── authors.ts         # Author profiles mapped to login emails
│   ├── lib/
│   │   ├── auth.ts            # Session management, password verify, rate limiting
│   │   ├── github.ts          # GitHub API: post catalog, file read/write
│   │   ├── cloudflare-analytics.ts
│   │   ├── firebase-messaging.ts
│   │   └── ...
│   ├── pages/
│   │   ├── index.astro        # Dashboard home (analytics + recent commits)
│   │   ├── posts.astro        # Post list manager
│   │   ├── write.astro        # Full post editor
│   │   ├── images.astro       # Image / media manager
│   │   ├── messaging.astro    # Push notification manager
│   │   └── api/               # Server API routes
│   └── middleware.ts          # Auth guard + security headers
├── .env.example               # All environment variables documented
├── wrangler.deploy.json       # Cloudflare Worker configuration
└── astro.config.mjs
```

## Quick Start

See [SETUP.md](SETUP.md) for full setup instructions.

```bash
# 1. Clone the repo
git clone https://github.com/sanp-dev/keypress-cms.git
cd keypress-cms

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your actual credentials

# 4. Run locally
npm run dev

# 5. Deploy to Cloudflare
npm run deploy
```

## License

See [LICENSE.md](LICENSE.md) for full terms.
