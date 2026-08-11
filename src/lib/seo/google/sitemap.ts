// src/lib/seo/google/sitemap.ts
import { getGoogleAccessToken } from './auth';
import { sitesConfig, getActiveSite } from '../../../config/sitesConfig';

/**
 * Submits a sitemap URL to the Google Search Console API.
 * Uses PUT https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}
 */
export async function submitSitemapToGoogle(
  sitemapUrl: string,
  env: any
): Promise<{ success: boolean; message: string }> {
  try {
    const activeSite = getActiveSite();
    // GSC property siteUrl must have a trailing slash for URL-prefix properties, but not for domain properties
    let siteUrl = activeSite.gscProperty || activeSite.url;
    if (!siteUrl.startsWith('sc-domain:') && !siteUrl.endsWith('/')) {
      siteUrl = siteUrl + '/';
    }

    const accessToken = await getGoogleAccessToken(env);
    const encodedSiteUrl = encodeURIComponent(siteUrl);
    const encodedFeedPath = encodeURIComponent(sitemapUrl);
    
    const requestUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/sitemaps/${encodedFeedPath}`;

    const response = await fetch(requestUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Length': '0',
      },
    });

    if (response.status === 204 || response.ok) {
      return {
        success: true,
        message: `Sitemap successfully submitted to Google for site: ${siteUrl}`,
      };
    }

    const errorText = await response.text();
    throw new Error(`Google API responded with status ${response.status}: ${errorText}`);
  } catch (error: any) {
    console.error('Google Sitemap Submit Error:', error);
    return {
      success: false,
      message: `Failed to submit sitemap: ${error.message}`,
    };
  }
}
