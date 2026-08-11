// src/lib/cloudflare-analytics.ts
//
// Wrapper around Cloudflare's GraphQL Analytics API to pull REAL traffic
// (pageviews) for each blog article from Cloudflare Web Analytics (RUM).
//
// IMPORTANT: `rumPageloadEventsAdaptiveGroups` is an ACCOUNT-scoped dataset,
// not a zone-scoped one (Cloudflare's schema name is literally
// `AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject`). That means the
// query must go through `viewer.accounts(filter: { accountTag })`, NOT
// `viewer.zones(filter: { zoneTag })`. An earlier version of this file queried
// through `viewer.zones`, which silently returned an empty/null result for
// this field (no GraphQL error, just nothing under that path) — that's why
// every article showed "0 views" even though the request succeeded.
//
// Requires two secrets (set via `wrangler secret put`, NOT in wrangler.deploy.json):
//   CF_ACCOUNT_ID            -> your Cloudflare Account ID
//   CF_ANALYTICS_API_TOKEN   -> API Token with "Account Analytics: Read" permission
//
// We filter by `requestHost` (your live domain) instead of Web Analytics'
// separate `siteTag`, so you don't need to dig up another ID beyond the
// Account ID you already have.

const CF_GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';

/**
 * Fetches pageview counts for every requestPath under the given host,
 * for the last `sinceDays` days, grouped by path. Returns a Map of
 * normalized path -> view count, e.g. "/post/my-slug" -> 482.
 */
export async function getPageViewsByPath(
  accountId: string,
  apiToken: string,
  requestHost: string,
  sinceDays = 30
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const until = new Date().toISOString();

  // Account-scoped RUM (Web Analytics) query. `count` is the pageview count
  // per requestPath bucket. Filtering by requestHost keeps this to just your
  // site's traffic (an account can have multiple sites under Web Analytics).
  const query = `
    query GetPageViews($accountTag: string!, $filter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          rumPageloadEventsAdaptiveGroups(
            limit: 5000
            filter: $filter
            orderBy: [count_DESC]
          ) {
            count
            dimensions {
              requestPath
            }
          }
        }
      }
    }
  `;

  const variables = {
    accountTag: accountId,
    filter: {
      AND: [
        { datetime_geq: since, datetime_leq: until },
        { requestHost },
      ],
    },
  };

  try {
    const res = await fetch(CF_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Cloudflare GraphQL API Error:', res.status, errText);
      return result;
    }

    const json = await res.json();

    if (json.errors && json.errors.length > 0) {
      console.error('Cloudflare GraphQL returned errors:', JSON.stringify(json.errors));
      return result;
    }

    const groups = json?.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups;
    if (!Array.isArray(groups)) {
      console.error('Cloudflare GraphQL: unexpected response shape:', JSON.stringify(json));
      return result;
    }

    for (const g of groups as Array<{ count: number; dimensions: { requestPath: string } }>) {
      const path = g.dimensions?.requestPath;
      const count = g.count || 0;
      if (!path) continue;
      // Accumulate in case multiple buckets map to the same normalized path
      result.set(path, (result.get(path) || 0) + count);
    }

    return result;
  } catch (error) {
    console.error('getPageViewsByPath Error:', error);
    return result;
  }
}

/**
 * Convenience helper: given a Map of path->views (as returned above) and a
 * post slug, look up the view count for that post's live URL path.
 * Tries a couple of path shapes since Cloudflare records the exact path hit.
 */
export function viewsForSlug(
  viewsMap: Map<string, number>,
  slug: string,
  pathPrefix = '/post/'
): number {
  const candidates = [
    `${pathPrefix}${slug}`,
    `${pathPrefix}${slug}/`,
  ];
  let total = 0;
  for (const c of candidates) {
    total += viewsMap.get(c) || 0;
  }
  return total;
}