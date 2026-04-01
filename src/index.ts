import { Hono } from "hono"
import { Mppx, tempo } from "mppx/hono"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { scrapeUser, scrapeHashtag, scrapeVideo, scrapeSearch } from "./apify.js"

// ── PathUSD contract address on Tempo mainnet ────────────────────────────────
const PATH_USD = "0x20c0000000000000000000000000000000000000" as const

// Debug: log which env vars are present (not their values)
console.log("🔍 Env vars present:", Object.keys(process.env).filter(k =>
  ["RECIPIENT_ADDRESS", "APIFY_TOKEN", "SERVER_PRIVATE_KEY", "MPP_SECRET_KEY", "PORT"].includes(k)
))

const RECIPIENT = process.env.RECIPIENT_ADDRESS
if (!RECIPIENT) {
  console.error("❌  RECIPIENT_ADDRESS env var is not set — check your .env file")
  console.error("    All env keys:", Object.keys(process.env).join(", "))
  process.exit(1)
}

// ── Server signing account ───────────────────────────────────────────────────
// This key is used by mppx to sign/verify on-chain payment operations.
// It is NOT the same as your recipient wallet — payments still land at RECIPIENT.
// On first run a key is auto-generated; save SERVER_PRIVATE_KEY to .env for persistence.
let serverPrivateKey = process.env.SERVER_PRIVATE_KEY as `0x${string}` | undefined
if (!serverPrivateKey) {
  serverPrivateKey = generatePrivateKey()
  console.warn(`⚠️  No SERVER_PRIVATE_KEY set — generated a temporary one for this session.`)
  console.warn(`   Add this to your .env to keep it persistent:\n   SERVER_PRIVATE_KEY=${serverPrivateKey}\n`)
}
const serverAccount = privateKeyToAccount(serverPrivateKey)

// ── MPP secret key (internal session signing) ────────────────────────────────
let mppSecretKey = process.env.MPP_SECRET_KEY
if (!mppSecretKey) {
  mppSecretKey = crypto.randomUUID()
  console.warn(`⚠️  No MPP_SECRET_KEY set — generated a temporary one for this session.`)
  console.warn(`   Add this to your .env to keep it persistent:\n   MPP_SECRET_KEY=${mppSecretKey}\n`)
}

// ── MPP setup ────────────────────────────────────────────────────────────────
const mppx = Mppx.create({
  secretKey: mppSecretKey,
  methods: [
    tempo({
      account: serverAccount,
      currency: PATH_USD,
      recipient: RECIPIENT as `0x${string}`,
      feePayer: false,  // client pays gas on mainnet
      testnet: false,   // 🟢 mainnet — real payments
    }),
  ],
})

// ── Hono app ─────────────────────────────────────────────────────────────────
const app = new Hono()

// ── Discovery endpoint (required for MPPScan registration) ───────────────────
app.get("/openapi.json", (c) =>
  c.json({
    openapi: "3.1.0",
    info: {
      title: "TikTok MPP API",
      version: "1.0.0",
      description: "Pay-per-request TikTok scraping API powered by the Machine Payments Protocol. Scrape user profiles, hashtags, videos and search results with automatic micropayments.",
      "x-guidance": "This API requires MPP payments for each request. Call any endpoint and handle the 402 Payment Required response using an MPP-compatible client. Prices are in USD paid via Tempo/PathUSD. The /health endpoint is free and returns all available endpoints.",
    },
    "x-discovery": {
      ownershipProofs: [],
    },
    servers: [
      { url: "https://tiktok-mpp-api-production.up.railway.app", description: "Production" },
    ],
    paths: {
      "/api/tiktok/user": {
        get: {
          operationId: "scrapeTikTokUser",
          summary: "Scrape TikTok user profile and videos",
          description: "Returns a user's profile info and recent videos. Pass the handle with or without @.",
          parameters: [
            { name: "handle", in: "query", required: true, schema: { type: "string" }, description: "TikTok username e.g. @charlidamelio" },
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 10, maximum: 50 }, description: "Number of videos to return" },
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["handle"], properties: { handle: { type: "string", description: "TikTok username e.g. @charlidamelio" }, limit: { type: "integer", default: 10, maximum: 50, description: "Number of videos to return" } } } } },
          },
          "x-payment-info": {
            protocols: [{ mpp: { method: "", intent: "", currency: "" } }],
            price: { mode: "fixed", amount: "0.050000", currency: "USD" },
          },
          responses: {
            "200": {
              description: "User profile and videos",
              content: { "application/json": { schema: { type: "object", properties: { handle: { type: "string" }, count: { type: "integer" }, results: { type: "array", items: { type: "object" } } } } } },
            },
            "402": { description: "Payment required — use an MPP client to pay $0.05 and retry" },
          },
        },
      },
      "/api/tiktok/hashtag": {
        get: {
          operationId: "scrapeTikTokHashtag",
          summary: "Scrape TikTok hashtag posts",
          description: "Returns recent posts under a hashtag. Pass the tag with or without #.",
          parameters: [
            { name: "tag", in: "query", required: true, schema: { type: "string" }, description: "Hashtag e.g. fyp or #fyp" },
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 10, maximum: 50 }, description: "Number of posts to return" },
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["tag"], properties: { tag: { type: "string", description: "Hashtag e.g. fyp or #fyp" }, limit: { type: "integer", default: 10, maximum: 50, description: "Number of posts to return" } } } } },
          },
          "x-payment-info": {
            protocols: [{ mpp: { method: "", intent: "", currency: "" } }],
            price: { mode: "fixed", amount: "0.100000", currency: "USD" },
          },
          responses: {
            "200": {
              description: "Hashtag posts",
              content: { "application/json": { schema: { type: "object", properties: { tag: { type: "string" }, count: { type: "integer" }, results: { type: "array", items: { type: "object" } } } } } },
            },
            "402": { description: "Payment required — use an MPP client to pay $0.10 and retry" },
          },
        },
      },
      "/api/tiktok/video": {
        get: {
          operationId: "scrapeTikTokVideo",
          summary: "Scrape single TikTok video metadata",
          description: "Returns full metadata for a single TikTok video by URL.",
          parameters: [
            { name: "url", in: "query", required: true, schema: { type: "string", format: "uri" }, description: "Full TikTok video URL" },
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri", description: "Full TikTok video URL e.g. https://www.tiktok.com/@user/video/123" } } } } },
          },
          "x-payment-info": {
            protocols: [{ mpp: { method: "", intent: "", currency: "" } }],
            price: { mode: "fixed", amount: "0.020000", currency: "USD" },
          },
          responses: {
            "200": {
              description: "Video metadata",
              content: { "application/json": { schema: { type: "object", properties: { url: { type: "string" }, results: { type: "array", items: { type: "object" } } } } } },
            },
            "402": { description: "Payment required — use an MPP client to pay $0.02 and retry" },
          },
        },
      },
      "/api/tiktok/search": {
        get: {
          operationId: "searchTikTok",
          summary: "Search TikTok by keyword",
          description: "Returns TikTok videos matching a keyword search query.",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" }, description: "Search query e.g. funny cats" },
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 10, maximum: 50 }, description: "Number of results to return" },
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["q"], properties: { q: { type: "string", description: "Search query e.g. funny cats" }, limit: { type: "integer", default: 10, maximum: 50, description: "Number of results to return" } } } } },
          },
          "x-payment-info": {
            protocols: [{ mpp: { method: "", intent: "", currency: "" } }],
            price: { mode: "fixed", amount: "0.050000", currency: "USD" },
          },
          responses: {
            "200": {
              description: "Search results",
              content: { "application/json": { schema: { type: "object", properties: { query: { type: "string" }, count: { type: "integer" }, results: { type: "array", items: { type: "object" } } } } } },
            },
            "402": { description: "Payment required — use an MPP client to pay $0.05 and retry" },
          },
        },
      },
    },
  })
)

// Root — redirect to health
app.get("/", (c) => c.redirect("/health"))

// Health check — free, no payment required
app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "TikTok MPP API",
    version: "1.0.0",
    endpoints: [
      { path: "/api/tiktok/user",    price: "$0.05", params: "?handle=@username&limit=10" },
      { path: "/api/tiktok/hashtag", price: "$0.10", params: "?tag=fyp&limit=10" },
      { path: "/api/tiktok/video",   price: "$0.02", params: "?url=https://tiktok.com/..." },
      { path: "/api/tiktok/search",  price: "$0.05", params: "?q=cats&limit=10" },
    ],
  })
)

// ── Paid endpoints ───────────────────────────────────────────────────────────

/**
 * GET /api/tiktok/user?handle=@charlidamelio&limit=10
 * Scrape a user's profile and recent videos — $0.05 per call
 */
app.get(
  "/api/tiktok/user",
  mppx.charge({ amount: "0.05", description: "TikTok user profile scrape" }),
  async (c) => {
    const handle = c.req.query("handle")
    if (!handle) return c.json({ error: 'Missing required param: ?handle=@username' }, 400)

    const limit = Number(c.req.query("limit") ?? 10)
    const results = await scrapeUser(handle, limit)

    return c.json({ handle, count: results.length, results })
  }
)

/**
 * GET /api/tiktok/hashtag?tag=fyp&limit=10
 * Scrape posts under a hashtag — $0.10 per call
 */
app.get(
  "/api/tiktok/hashtag",
  mppx.charge({ amount: "0.10", description: "TikTok hashtag scrape" }),
  async (c) => {
    const tag = c.req.query("tag")
    if (!tag) return c.json({ error: 'Missing required param: ?tag=fyp' }, 400)

    const limit = Number(c.req.query("limit") ?? 10)
    const results = await scrapeHashtag(tag, limit)

    return c.json({ tag, count: results.length, results })
  }
)

/**
 * GET /api/tiktok/video?url=https://www.tiktok.com/@user/video/123
 * Scrape metadata for a single video — $0.02 per call
 */
app.get(
  "/api/tiktok/video",
  mppx.charge({ amount: "0.02", description: "TikTok video metadata" }),
  async (c) => {
    const url = c.req.query("url")
    if (!url) return c.json({ error: 'Missing required param: ?url=https://tiktok.com/...' }, 400)

    const results = await scrapeVideo(url)
    return c.json({ url, results })
  }
)

/**
 * GET /api/tiktok/search?q=funny+cats&limit=10
 * Search TikTok for a keyword — $0.05 per call
 */
app.get(
  "/api/tiktok/search",
  mppx.charge({ amount: "0.05", description: "TikTok keyword search" }),
  async (c) => {
    const q = c.req.query("q")
    if (!q) return c.json({ error: 'Missing required param: ?q=your+keyword' }, 400)

    const limit = Number(c.req.query("limit") ?? 10)
    const results = await scrapeSearch(q, limit)

    return c.json({ query: q, count: results.length, results })
  }
)

// ── Start server ─────────────────────────────────────────────────────────────
const port = Number(process.env.PORT ?? 3000)
// Railway injects PORT — make sure networking config matches this value

console.log(`
🎵  TikTok MPP API
    ├─ http://localhost:${port}/health
    ├─ GET /api/tiktok/user    — $0.05
    ├─ GET /api/tiktok/hashtag — $0.10
    ├─ GET /api/tiktok/video   — $0.02
    └─ GET /api/tiktok/search  — $0.05

    Payments: Tempo/PathUSD (🟢 MAINNET)
    Recipient: ${RECIPIENT}
`)

export default {
  port,
  hostname: "0.0.0.0",
  fetch: app.fetch,
}
