// src/config/sitesConfig.ts

export const sitesConfig = {
  demoblog: {
    id: 'demoblog',
    // The display name of your blog/website
    name: 'Demo Blog',
    // The public URL of your blog (your DEMO-BLOG-QUICDECODE deployment)
    url: 'https://demo-blog.quicdecode.com',
    // Google Search Console property (e.g., 'sc-domain:your-domain.com')
    gscProperty: 'sc-domain:YOUR-DOMAIN.com',
    // Your GitHub username
    githubOwner: 'YOUR_GITHUB_USERNAME',
    // The repository name of your blog (e.g., 'DEMO-BLOG-QUICDECODE' or your fork)
    githubRepo: 'YOUR_BLOG_REPO_NAME',
    branch: 'main',
    // Path inside the repo where your blog posts (.md/.mdx) are stored
    contentPath: 'src/content/blog',
  }
};

/** Returns the first (active) site configuration. */
export function getActiveSite() {
  const keys = Object.keys(sitesConfig);
  if (keys.length === 0) throw new Error('No site configured in sitesConfig');
  return sitesConfig[keys[0] as keyof typeof sitesConfig];
}