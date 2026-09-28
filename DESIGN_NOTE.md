# Design note

## Why a headless browser, not plain HTTP

I checked for a JSON API first. `/api/v2/listings` and `/api/v2/items/:id` return names, SKUs, specs, reviews and the option list, but **no price or stock**. The product page ships an empty shell and the price only appears after the user hovers the price panel and clicks "Check today's price". So the price genuinely requires a real browser session, and I used Playwright for the scrape and plain `fetch` for everything else (search, item detail).

## How the scraper works

For each tracked (product, option) pair, one attempt does:

1. Load `/item/{id}` in a fresh browser context; remove any consent/cookie overlay that would intercept clicks.
2. Click the requested option (e.g. "Creator kit") *before* revealing, since the price depends on it.
3. Hover the price panel with a direct mouse move, wait for the reveal button to become enabled, click it.
4. Wait for the panel to reach the **`offer-ready`** state. Waiting for the "locked" class to disappear is not enough: it is removed immediately on click while the panel still says "Loading current price...".
5. Extract the price and stock, validate them, and return an outcome.

Around that:

- **Retries with backoff** (2s, 5s, 10s) using a fresh page load each time. Outcome is `success` (first try), `retried` (succeeded after a retry) or `failed` (all attempts exhausted).
- **Never store guessed data.** On failure price and stock are NULL and `error_message` records the stage that failed (`enable-button`, `offer-ready`, `extract`, a navigation error, ...). Failures are written to `price_history` exactly like successes.
- **Validation:** a parsed price must be a positive number or the attempt fails.
- **Scheduling** is an external HTTP trigger (cron-job.org every 2 hours), because free-tier backends sleep. The endpoint answers `202` immediately and scrapes in the background.

## Extracting the right number

The store plants decoys, so I could not just take "the first price on the page":

- hidden elements (`display:none`, `aria-hidden`) holding random prices;
- a struck-through list price;
- a visible but secondary line, "Member price ₹35,805";
- the real price rendered one `<span>` per character, sometimes with **fullwidth Unicode digits** (`１４５`) and zero-width or non-breaking spaces mixed in.

The final rule: normalise the text (fullwidth to ASCII digits, strip invisible characters), then accept an element only if its **entire text is a single currency amount**, it is actually visible, neither it nor any ancestor is struck through, and prefer the bold, heavy-weight one. That excludes labelled lines, containers holding several prices, hidden decoys and the list price. I stopped relying on class names because they are re-randomised per revision.

## Trade-offs

- **Headed / virtual display instead of headless.** Headless Chromium was blocked at the reveal step every time (button never enabled), while a real window worked. I ruled out focus, hover registration, `navigator.webdriver` masking and mouse-path differences, then chose to run a real browser inside a virtual display (Xvfb, see `backend/Dockerfile`).
- **Cloud vs home connection.** Even with all of that, scrapes from the Render host kept stalling at the reveal step while a home connection worked. I did not have time to prove the cause (a datacenter-IP penalty and a per-IP limit on reveals are both consistent with what I saw), and the database does not record where each attempt ran, so I cannot split the failures by source. Pragmatic response: keep the API, database and dashboard deployed, and add `scheduledScrape.js` so a scrape pass can run from a machine where it works, writing to the same database.
- **Pacing.** In one local run the first few products succeeded and the rest stalled, so the scheduled script now pauses 45-60s between products and I reduced the number of actively tracked products.
- **Free tiers:** Render sleeps (hence the external trigger and the instant `202`), and Chromium in a small container is slow.

## What the AI tools got wrong, and how I corrected it

I used Claude throughout, and I verified its suggestions against the real page before keeping them.

1. **Trusted the store's manifest for the price selector.** The first version read `manifest.classes.sale` and targeted that class. The debug output showed that class did not exist in the rendered panel; the real price used a different class. I dropped the manifest and identified the price by how it renders (visible, not struck through, single amount, bold).
2. **Assumed a plain-text price.** The extractor only accepted elements with no children, so it missed prices built from per-character spans, and it also missed fullwidth digits. The captured HTML showed both; the extractor now matches on normalised whole-element text.
3. **Read the price too early.** Waiting for the lock class to clear returned the "Loading..." text. I switched to waiting for `offer-ready`.
4. **Picked the wrong visible price.** "First visible, non-struck-through price" would have returned the "Member price" line on some variants. A Render log showed that variant; the whole-text and emphasis rules fixed it.
5. **Environment differences it could not predict:** the headless block, and a consent overlay that only appeared from the cloud host, were found only by logging the page state at every failure (screenshot + panel HTML + the failing stage).
6. **Process problem:** I ran several separate AI chats in parallel, which produced mismatched files (a different `package.json`, route files and database schema in the same paths). It cost hours until I verified each file on disk and rebuilt the database from `schema.sql`.

## Data and known limits

`price_history` holds 52 attempts recorded between 27 Sep 2026 17:51 IST and 28 Sep 2026 17:02 IST (about 23 hours): **9 success, 5 retried, 38 failed**. That means 14 of 52 attempts (about 27%) produced a real price. The failures are kept, not hidden, and each row's `error_message` names the stage that failed:

- **31 (about 82% of failures)** failed at `STAGE=enable-button`: the store's reveal button never became enabled within the timeout.
- **6 (about 16%)** failed with `net::ERR_NAME_NOT_RESOLVED`, from when the store went offline and its hostname stopped resolving.
- **1 (about 3%)** failed at `STAGE=offer-ready`: the price panel never reached its ready state.

The scraper never stores a guessed or empty price. On failure, price and stock are left NULL and the outcome is recorded as `failed`. Because the store was taken offline after the deadline, I could not collect more history or record a fresh headed run.