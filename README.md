# 🎵 TikTok MPP API

A pay-per-request TikTok scraper API powered by the [Machine Payments Protocol (MPP)](https://mpp.dev) and [Apify](https://apify.com/clockworks/tiktok-scraper).

AI agents and clients pay in **Tempo/PathUSD stablecoins** on each request — no subscriptions, no API keys.

---

## Endpoints

| Endpoint | Price | Description |
|---|---|---|
| `GET /health` | Free | Service info & endpoint list |
| `GET /api/tiktok/user` | **$0.05** | Scrape user profile + recent videos |
| `GET /api/tiktok/hashtag` | **$0.10** | Scrape posts under a hashtag |
| `GET /api/tiktok/video` | **$0.02** | Single video metadata |
| `GET /api/tiktok/search` | **$0.05** | Search TikTok by keyword |

### Query params

```bash
# User scrape
GET /api/tiktok/user?handle=@charlidamelio&limit=10

# Hashtag scrape
GET /api/tiktok/hashtag?tag=fyp&limit=20

# Single video
GET /api/tiktok/video?url=https://www.tiktok.com/@user/video/123456789

# Search
GET /api/tiktok/search?q=funny+cats&limit=10
```

---

## How MPP works

1. Client makes a normal HTTP request
2. Server responds with **402 Payment Required** + payment instructions
3. Client pays with Tempo/PathUSD (stablecoin)
4. Client retries with `Authorization` header containing payment proof
5. Server verifies payment → returns TikTok data + receipt

---

## Setup

### 1. Install deps

```bash
bun install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
APIFY_TOKEN=apify_api_your_token_here
RECIPIENT_ADDRESS=0xYourWalletAddress
PORT=3000
```

- **APIFY_TOKEN** — get at [apify.com](https://console.apify.com/account#/integrations)
- **RECIPIENT_ADDRESS** — your EVM wallet address for receiving payments

### 3. Run

```bash
# Development (hot reload)
bun run dev

# Production
bun run start
```

---

## Tech stack

| Layer | Tool |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| Framework | [Hono](https://hono.dev) |
| Payments | [mppx](https://github.com/wevm/mppx) — MPP TypeScript SDK |
| Stablecoin | Tempo PathUSD (testnet → Base mainnet) |
| Scraper | [Apify TikTok Scraper](https://apify.com/clockworks/tiktok-scraper) |

---

## Going to mainnet

In `src/index.ts`, update:
```ts
testnet: false,
```
And update `RECIPIENT_ADDRESS` in `.env` to your mainnet wallet.

---

## License

MIT
