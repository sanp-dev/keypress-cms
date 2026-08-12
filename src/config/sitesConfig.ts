// src/config/sitesConfig.ts

export const sitesConfig = {
  keypresstheme: {
    id: 'keypresstheme',
    // The display name of your blog/website
    name: 'Keypress Theme',
    // The public URL of your blog (your keypress-theme deployment)
    url: 'https://demo-blog.quicdecode.com',
    // Google Search Console property (e.g., 'sc-domain:your-domain.com')
    gscProperty: 'sc-domain:YOUR-DOMAIN.com',
    // Your GitHub username
    githubOwner: 'YOUR_GITHUB_USERNAME',
    // The repository name of your blog (e.g., 'keypress-theme' or your fork)
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