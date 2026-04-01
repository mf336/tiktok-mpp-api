import { Hono } from "hono"
import { Mppx, tempo } from "mppx/hono"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { scrapeUser, scrapeHashtag, scrapeVideo, scrapeSearch } from "./apify.js"

// ── PathUSD contract address on Tempo testnet ────────────────────────────────
const PATH_USD = "0x20c0000000000000000000000000000000000000" as const

const RECIPIENT = process.env.RECIPIENT_ADDRESS
if (!RECIPIENT) {
  console.error("❌  RECIPIENT_ADDRESS env var is not set — check your .env file")
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
      feePayer: true,  // server sponsors gas on testnet
      testnet: true,   // switch to false + mainnet address when going live
    }),
  ],
})

// ── Hono app ─────────────────────────────────────────────────────────────────
const app = new Hono()

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

console.log(`
🎵  TikTok MPP API
    ├─ http://localhost:${port}/health
    ├─ GET /api/tiktok/user    — $0.05
    ├─ GET /api/tiktok/hashtag — $0.10
    ├─ GET /api/tiktok/video   — $0.02
    └─ GET /api/tiktok/search  — $0.05

    Payments: Tempo/PathUSD (testnet)
    Recipient: ${RECIPIENT}
`)

export default {
  port,
  hostname: "0.0.0.0",
  fetch: app.fetch,
}
