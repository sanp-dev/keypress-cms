// src/lib/post-metadata.ts
// Extract notification-relevant metadata from markdown frontmatter

import { getFileContent } from './github';

export interface PostNotificationData {
  title: string;
  description: string;
  heroImage: string;
  url: string;
  slug: string;
}

// ─── Parse YAML frontmatter from markdown content ──────────────────────────────
function extractFrontmatter(content: string): Record<string, string> {
  const fmMatch = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return {};

  const fields: Record<string, string> = {};
  const lines = fmMatch[1].split(/\r?\n/);

  for (const line of lines) {
    // Match key: "value" or key: 'value' or key: value
    const kvMatch = line.match(
      /^(\w[\w-]*):\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(.+))$/
    );
    if (kvMatch) {
      const key = kvMatch[1];
      let value = (kvMatch[2] ?? kvMatch[3] ?? kvMatch[4] ?? '').trim();
      // Remove surrounding quotes if any remain
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      fields[key] = value.replace(/\\"/g, '"').replace(/\\'/g, "'");
    }
  }

  return fields;
}

// ─── Fetch post and extract notification data ──────────────────────────────────
export async function getPostNotificationData(
  slug: string,
  owner: string,
  repo: string,
  contentPath: string,
  token: string,
  siteUrl: string,
  imageBaseUrl: string
): Promise<PostNotificationData | null> {
  const filePath = `${contentPath}/${slug}.md`;

  const fileContent = await getFileContent(owner, repo, filePath, token);
  if (!fileContent) {
    // Try .mdx extension as fallback
    const mdxContent = await getFileContent(owner, repo, `${contentPath}/${slug}.mdx`, token);
    if (!mdxContent) return null;
    return parseContent(mdxContent.content, slug, siteUrl, imageBaseUrl);
  }

  return parseContent(fileContent.content, slug, siteUrl, imageBaseUrl);
}

function parseContent(
  content: string,
  slug: string,
  siteUrl: string,
  imageBaseUrl: string
): PostNotificationData {
  const fm = extractFrontmatter(content);

  // Try multiple common frontmatter keys for each field
  const title = fm.title || fm.Title || slug;
  const description =
    fm.description || fm.Description || fm.excerpt || fm.summary || '';

  // heroImage could be relative (/img/hero.webp) or absolute (https://...)
  let heroImage =
    fm.heroImage || fm.hero_image || fm.image || fm.thumbnail || fm.cover || '';
  if (heroImage && !heroImage.startsWith('http')) {
    heroImage = imageBaseUrl + (heroImage.startsWith('/') ? '' : '/') + heroImage;
  }

  return {
    title,
    description,
    heroImage,
    url: `${siteUrl}/post/${slug}/`,
    slug,
  };
}
