// src/lib/seo/google/types.ts

export interface GoogleAuthCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface GoogleInspectionRequest {
  inspectionUrl: string;
  siteUrl: string;
  languageCode?: string;
}

export interface GoogleInspectionResponse {
  inspectionResult?: {
    inspectionResultLink?: string;
    indexStatusResult?: {
      verdict?: 'PASS' | 'FAIL' | 'NEUTRAL';
      coverageState?: string;
      robotsTxtState?: 'ALLOWED' | 'DISALLOWED' | 'ROBOTS_TXT_STATE_UNSPECIFIED';
      indexingState?: 'INDEXING_ALLOWED' | 'INDEXING_BLOCKED' | 'INDEXING_STATE_UNSPECIFIED';
      lastCrawlTime?: string;
      pageFetchState?: 'SUCCESSFUL' | 'FETCH_STATE_UNSPECIFIED' | string;
      googleCanonical?: string;
      userCanonical?: string;
      sitemap?: string[];
      referringUrls?: string[];
    };
    mobileUsabilityResult?: {
      verdict?: 'PASS' | 'FAIL' | 'NEUTRAL';
    };
    richResultsResult?: {
      verdict?: 'PASS' | 'FAIL' | 'NEUTRAL';
      detectedItems?: Array<{
        richResultType?: string;
        name?: string;
        items?: Array<{
          name?: string;
          richResultType?: string;
        }>;
      }>;
    };
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}
