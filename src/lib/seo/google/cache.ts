// src/lib/seo/google/cache.ts
import type { UnifiedInspectionResult } from '../index';

const KEY_PREFIX = 'seo:index:';

function getUrlKey(url: string): string {
  return `${KEY_PREFIX}${url}`;
}

/**
 * Retrieves a cached inspection result for a URL from Cloudflare KV.
 * DISABLED: Now returns null to use browser localStorage instead.
 */
export async function getCachedInspectionResult(
  url: string,
  env: any
): Promise<UnifiedInspectionResult | null> {
  return null;
}

/**
 * Saves an inspection result to Cloudflare KV.
 * DISABLED: Now a no-op to avoid Cloudflare KV writes.
 */
export async function saveCachedInspectionResult(
  url: string,
  result: UnifiedInspectionResult,
  env: any
): Promise<void> {
  // No-op to avoid KV writes
}

/**
 * Retrieves aggregated metrics for all cached inspection results
 * using KV metadata list, which avoids reading every key individually.
 */
export async function getAggregatedSeoMetrics(
  env: any
): Promise<{
  indexed: number;
  pending: number;
  crawled: number;
  error: number;
  unknown: number;
  lastSync: string | null;
}> {
  return {
    indexed: 0,
    pending: 0,
    crawled: 0,
    error: 0,
    unknown: 0,
    lastSync: null,
  };
}

/**
 * Retrieves all cached results using a list operation with metadata,
 * returns a Map of URL -> Metadata.
 * DISABLED: Returns empty map to use browser localStorage instead.
 */
export async function getAllCachedSeoMetadata(
  env: any
): Promise<Map<string, { status: string; updatedAt: string }>> {
  return new Map<string, { status: string; updatedAt: string }>();
}
