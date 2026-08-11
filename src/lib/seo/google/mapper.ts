// src/lib/seo/google/mapper.ts
import type { GoogleInspectionResponse } from './types';
import type { UnifiedInspectionResult, SeoStatus } from '../index';

export function mapGoogleResponseToUnified(
  url: string,
  response: GoogleInspectionResponse,
  siteUrl?: string
): UnifiedInspectionResult {
  const result = response.inspectionResult;
  const indexResult = result?.indexStatusResult;
  const mobileResult = result?.mobileUsabilityResult;
  const richResult = result?.richResultsResult;

  const verdict = indexResult?.verdict || 'NEUTRAL';
  const coverageState = indexResult?.coverageState || 'Unknown status';
  const robotsTxtState = indexResult?.robotsTxtState || 'ROBOTS_TXT_STATE_UNSPECIFIED';
  const indexingState = indexResult?.indexingState || 'INDEXING_STATE_UNSPECIFIED';
  const pageFetchState = indexResult?.pageFetchState || 'FETCH_STATE_UNSPECIFIED';
  const googleCanonical = indexResult?.googleCanonical || null;
  const userCanonical = indexResult?.userCanonical || null;
  const lastCrawlTime = indexResult?.lastCrawlTime || null;
  const referringUrls = indexResult?.referringUrls || [];

  // Determine SEO Status badge value
  let status: SeoStatus = 'unknown';

  if (verdict === 'PASS') {
    status = 'indexed';
  } else if (
    verdict === 'FAIL' ||
    indexingState === 'INDEXING_BLOCKED' ||
    robotsTxtState === 'DISALLOWED' ||
    (pageFetchState !== 'SUCCESSFUL' && pageFetchState !== 'FETCH_STATE_UNSPECIFIED')
  ) {
    status = 'error';
  } else if (coverageState.toLowerCase().includes('indexed')) {
    status = 'indexed';
  } else if (coverageState.toLowerCase().includes('crawled')) {
    status = 'crawled';
  } else if (
    coverageState.toLowerCase().includes('discovered') ||
    coverageState.toLowerCase().includes('pending') ||
    coverageState.toLowerCase().includes('submitted')
  ) {
    status = 'pending';
  } else if (verdict === 'NEUTRAL') {
    status = 'pending'; // Default neutral state to pending (e.g. submitted but not crawled yet)
  }

  // Map mobile friendly verdict
  let mobile: string | null = null;
  if (mobileResult?.verdict === 'PASS') {
    mobile = 'Friendly';
  } else if (mobileResult?.verdict === 'FAIL') {
    mobile = 'Not Friendly';
  } else if (mobileResult?.verdict === 'NEUTRAL') {
    mobile = 'Neutral';
  }

  // Extract detected rich result types
  const richResults: string[] = [];
  if (richResult?.detectedItems) {
    for (const item of richResult.detectedItems as any[]) {
      const typeName = item.richResultType || item.name;
      if (typeName && !richResults.includes(typeName)) {
        richResults.push(typeName);
      } else if (item.items && Array.isArray(item.items)) {
        for (const subItem of item.items) {
          const subName = subItem.name || subItem.richResultType;
          if (subName && !richResults.includes(subName)) {
            richResults.push(subName);
          }
        }
      }
    }
  }

  // Format robots.txt state
  let robots = 'Unknown';
  if (robotsTxtState === 'ALLOWED') robots = 'Allowed';
  if (robotsTxtState === 'DISALLOWED') robots = 'Blocked';

  // Format indexing allowed state
  let indexing = 'Unknown';
  if (indexingState === 'INDEXING_ALLOWED') indexing = 'Allowed';
  if (indexingState === 'INDEXING_BLOCKED') indexing = 'Blocked';

  // Format page fetch status
  let pageFetchStatus = 'Unknown';
  if (pageFetchState === 'SUCCESSFUL') pageFetchStatus = 'Successful';
  if (pageFetchState.startsWith('FETCH_STATE_')) {
    pageFetchStatus = pageFetchState.replace('FETCH_STATE_', '').toLowerCase();
    pageFetchStatus = pageFetchStatus.charAt(0).toUpperCase() + pageFetchStatus.slice(1);
  } else if (pageFetchState !== 'FETCH_STATE_UNSPECIFIED') {
    pageFetchStatus = pageFetchState;
  }

  return {
    url,
    siteUrl,
    inspectionResultLink: result?.inspectionResultLink || null,
    status,
    coverage: coverageState,
    lastCrawl: lastCrawlTime,
    googleCanonical,
    userCanonical,
    robots,
    indexing,
    pageFetchStatus,
    richResults,
    mobile,
    referringUrls,
    updatedAt: new Date().toISOString(),
    verdict,
  };
}
