// src/lib/seo/google/inspection.ts
import { getGoogleAccessToken } from './auth';
import { mapGoogleResponseToUnified } from './mapper';
import { sitesConfig, getActiveSite } from '../../../config/sitesConfig';
import type { UnifiedInspectionResult } from '../index';
import type { GoogleInspectionResponse } from './types';

/**
 * Inspects a URL using the Google Search Console URL Inspection API
 * and maps the response to a UnifiedInspectionResult.
 */
export async function inspectUrlWithGoogle(
  url: string,
  env: any
): Promise<UnifiedInspectionResult> {
  try {
    const activeSite = getActiveSite();
    // For Domain properties, use the format sc-domain:<domain> (e.g. sc-domain:example.com)
    // For URL-prefix properties, use the format <url> with a trailing slash
    let siteUrl = activeSite.gscProperty || activeSite.url;
    if (!siteUrl.startsWith('sc-domain:') && !siteUrl.endsWith('/')) {
      siteUrl = siteUrl + '/';
    }

    const accessToken = await getGoogleAccessToken(env);

    const response = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inspectionUrl: url,
        siteUrl: siteUrl,
        languageCode: 'en-US',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google URL Inspection API returned status ${response.status}: ${errorText}`);
    }

    const rawData = await response.json() as GoogleInspectionResponse;

    if (rawData.error) {
      throw new Error(rawData.error.message || 'Unknown Google API error');
    }

    return mapGoogleResponseToUnified(url, rawData, siteUrl);
  } catch (error: any) {
    console.error(`Google URL Inspection failed for ${url}:`, error);
    // Return a fallback result instead of crashing
    return {
      url,
      siteUrl: activeSite.gscProperty || activeSite.url,
      inspectionResultLink: null,
      status: 'unknown',
      coverage: `Error: ${error.message || 'Inspection failed'}`,
      lastCrawl: null,
      googleCanonical: null,
      userCanonical: null,
      robots: 'Unknown',
      indexing: 'Unknown',
      pageFetchStatus: 'Failed',
      richResults: [],
      mobile: null,
      referringUrls: [],
      updatedAt: new Date().toISOString(),
      verdict: 'NEUTRAL',
    };
  }
}
