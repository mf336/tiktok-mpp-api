/**
 * Apify TikTok Scraper client
 * Actor: clockworks/tiktok-scraper
 * Docs: https://apify.com/clockworks/tiktok-scraper
 */

const APIFY_TOKEN = process.env.APIFY_TOKEN
const ACTOR_ID = "clockworks~tiktok-scraper"
const BASE_URL = "https://api.apify.com/v2"

// Run the scraper synchronously and return dataset items directly.
// Apify waits up to 300 s — we keep resultsPerPage low to stay fast.
async function runScraper(input: Record<string, unknown>): Promise<unknown[]> {
  if (!APIFY_TOKEN) throw new Error("APIFY_TOKEN env var is not set")

  const url =
    `${BASE_URL}/acts/${ACTOR_ID}/run-sync-get-dataset-items` +
    `?token=${APIFY_TOKEN}&timeout=120&memory=512`

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Apify error ${res.status}: ${text}`)
  }

  return (await res.json()) as unknown[]
}

// ── Public helpers ──────────────────────────────────────────────────────────

/** Scrape a user's profile + recent videos */
export async function scrapeUser(handle: string, limit = 10) {
  return runScraper({
    profiles: [handle.replace("@", "")],
    resultsPerPage: Math.min(limit, 50),
  })
}

/** Scrape posts under a hashtag */
export async function scrapeHashtag(tag: string, limit = 10) {
  return runScraper({
    hashtags: [tag.replace("#", "")],
    resultsPerPage: Math.min(limit, 50),
  })
}

/** Scrape metadata for a single video URL */
export async function scrapeVideo(videoUrl: string) {
  return runScraper({
    postURLs: [videoUrl],
    resultsPerPage: 1,
  })
}

/** Search TikTok for a keyword */
export async function scrapeSearch(query: string, limit = 10) {
  return runScraper({
    searchQueries: [query],
    resultsPerPage: Math.min(limit, 50),
  })
}
