// src/lib/seo/index.ts
import { inspectUrlWithGoogle } from './google/inspection';
import { submitSitemapToGoogle } from './google/sitemap';
import {
  getCachedInspectionResult,
  saveCachedInspectionResult,
  getAggregatedSeoMetrics,
  getAllCachedSeoMetadata,
} from './google/cache';

export type SeoStatus = 'indexed' | 'pending' | 'crawled' | 'error' | 'unknown';

export interface UnifiedInspectionResult {
  url: string;
  siteUrl?: string;
  inspectionResultLink?: string | null;
  status: SeoStatus;
  coverage: string;
  lastCrawl: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  robots: string | null;
  indexing: string | null;
  pageFetchStatus: string | null;
  richResults: string[]; // E.g., ["Breadcrumbs", "Sitelinks searchbox"]
  mobile: string | null;
  referringUrls: string[];
  updatedAt: string;
  verdict: string;
}

export interface SeoClient {
  inspectUrl(url: string, forceRefresh: boolean, env: any): Promise<UnifiedInspectionResult>;
  submitSitemap(sitemapUrl: string, env: any): Promise<{ success: boolean; message: string }>;
}

export class GoogleSeoProvider implements SeoClient {
  async inspectUrl(url: string, forceRefresh: boolean, env: any): Promise<UnifiedInspectionResult> {
    if (!forceRefresh) {
      const cached = await getCachedInspectionResult(url, env);
      if (cached) return cached;
    }

    const result = await inspectUrlWithGoogle(url, env);
    // Only cache if it isn't a completely empty failure response, or cache it anyway to prevent rapid retries.
    // In this case, saving it is better to respect limits.
    await saveCachedInspectionResult(url, result, env);
    return result;
  }

  async submitSitemap(sitemapUrl: string, env: any): Promise<{ success: boolean; message: string }> {
    return submitSitemapToGoogle(sitemapUrl, env);
  }
}

/**
 * Factory function to retrieve the configured SEO client.
 * Allows adding Bing Webmaster or IndexNow in the future without modifying page code.
 */
export function getSeoClient(provider: 'google' | 'bing' = 'google'): SeoClient {
  if (provider === 'google') {
    return new GoogleSeoProvider();
  }
  throw new Error(`SEO Provider "${provider}" is not implemented.`);
}

export {
  getCachedInspectionResult,
  saveCachedInspectionResult,
  getAggregatedSeoMetrics,
  getAllCachedSeoMetadata,
};
