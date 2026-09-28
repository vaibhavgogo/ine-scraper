# INE Price Tracker

Search INE's mock store, pick a product **and an option** (e.g. "Creator kit"), and track its price and stock over time. A scraper runs on a schedule, stores every attempt (success, retried or failed) in Postgres, and the dashboard shows price/stock history, a per-product scrape log, and a CSV export.

- **Live site:** `<your-vercel-url>`
- **Backend API:** https://ine-scraper-jsxn.onrender.com (`/health` to check it is up)
- **Repo:** https://github.com/vaibhavgogo/ine-scraper
- **Headed-run recording:** `<link>`
- **Design note:** see `DESIGN_NOTE.md`

## Stack

| Layer | Tech | Hosted on |
|---|---|---|
| Frontend | React (Vite) | Vercel |
| Backend | Node.js + Express | Render (Docker) |
| Database | Supabase (PostgreSQL) | Supabase |
| Scraper | Playwright (Chromium) | runs inside the backend container / locally |
| Scheduler | cron-job.org (external HTTP trigger) | cron-job.org |

## Repo layout

```
backend/
  Dockerfile              Chromium + Xvfb (virtual display) for the scraper
  schema.sql              products + price_history tables
  src/server.js           Express app
  src/routes/             search.js, products.js, scrape.js
  src/db/supabaseClient.js
  src/scraper/
    scrapeProduct.js      the scraper (retries, validation, extraction)
    testRun.js            run one product by hand (headed or headless)
    scheduledScrape.js    one full pass over all tracked products, then exit
frontend/                 React + Vite dashboard
```

## Setup

### 1. Database
Create a Supabase project, open the SQL editor and run `backend/schema.sql`. This creates:
- `products` - one row per tracked (product, option) pair
- `price_history` - one row per scrape attempt (`price`/`stock` are NULL on failure; `outcome` is `success`, `retried` or `failed`; `error_message` records the failing stage)

### 2. Backend
```bash
cd backend
npm install            # also downloads Chromium via Playwright
cp .env.example .env   # then fill in the values below
npm start              # http://localhost:3001
```

### 3. Frontend
```bash
cd frontend
npm install
# set VITE_API_BASE_URL in frontend/.env (e.g. http://localhost:3001)
npm run dev
```

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `SUPABASE_URL` | backend | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | backend | Server-side key (never sent to the browser) |
| `CRON_SECRET` | backend | Shared secret the scheduler must send in the `x-cron-secret` header |
| `PORT` | backend | Optional, defaults to 3001 |
| `VITE_API_BASE_URL` | frontend | Base URL of the backend API |

## Scraping schedule

**Every 2 hours**, triggered by cron-job.org (free-tier backends sleep, so there is no in-process timer):

- `POST https://ine-scraper-jsxn.onrender.com/api/scrape/run`
- Header: `x-cron-secret: <CRON_SECRET>`
- The endpoint replies `202` immediately and scrapes in the background, so neither the scheduler nor Render's proxy has to hold a long connection open. Results appear in `price_history` and in the Render logs (`scrape/run: product ... -> outcome=...`).

A local fallback, `backend/src/scraper/scheduledScrape.js`, does the same pass from your own machine (for example via Windows Task Scheduler every 2 hours) and writes to the same database. See the design note for why it exists.

## Observable (headed) run

```bash
cd backend/src/scraper
node testRun.js 2168 "Creator kit" --headed
```

A visible Chromium window opens, selects the option, hovers the price panel, clicks the reveal button and waits for the price. Retries and failures are printed with the stage that failed (`STAGE=enable-button`, `STAGE=offer-ready`, `STAGE=extract`, ...). Omit `--headed` for headless. Note: this store blocks headless Chromium at the reveal step, so headed mode (or a virtual display, see the Dockerfile) is what works.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/search?q=` | Search the store's catalogue by partial or full name |
| GET | `/api/store-item/:id` | Item detail including its options |
| POST | `/api/products` | Track a product + option |
| GET | `/api/products` | List tracked products |
| GET | `/api/products/:id/history` | Price/stock history (oldest first) |
| GET | `/api/products/:id/log` | Scrape log (newest first) |
| GET | `/api/export` | CSV of every attempt: store product ID, name, option, ISO-8601 UTC timestamp, price, stock, outcome (failed rows have empty price/stock) |
| POST | `/api/scrape/run` | Scheduler endpoint (requires `x-cron-secret`) |
| GET | `/health` | Liveness check |

## Deployment

- **Frontend:** Vercel, with `VITE_API_BASE_URL` pointing at the Render URL.
- **Backend:** Render web service, runtime **Docker**, root directory `backend`, env vars as above. The Dockerfile installs Xvfb and Chromium and starts a virtual display before the server.
- **Database:** Supabase.
- **Scheduler:** cron-job.org job as described above.

## Known limitations

- The mock store was taken offline after the deadline, so scraping and the headed-run demonstration can no longer be reproduced against it.
- From the cloud host the store's reveal step failed far more often than from a home connection (details in `DESIGN_NOTE.md`). The database therefore holds a mix of successful, retried and failed attempts, and all of them are kept.
