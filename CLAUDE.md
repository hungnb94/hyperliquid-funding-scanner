# Hyperliquid Funding Rate Scanner

## Project Overview
TypeScript/Node.js application that periodically scans funding rates for perpetual contracts on the Hyperliquid exchange, logs them to CSV, and sends Telegram notifications when coins match alert criteria. Uses Axios for API calls and Telegraf for the Telegram bot.

## Architecture

### Key Directories
- `src/clients/` — API clients (`HyperliquidClient` for Hyperliquid REST API)
- `src/services/` — Scanner and Telegram bot services
- `src/utils/` — Utilities (`logger.ts`, `csv-writer.ts`, `scan-filter.ts`)
- `src/config/` — Configuration from environment variables
- `src/types/` — TypeScript type definitions for Hyperliquid API responses
- `scripts/` — Entry point scripts (`start-enhanced.ts`)
- `data/` — CSV output and subscribed users JSON

### Main Classes
- **`HyperliquidClient`** (`src/clients/hyperliquid-client.ts`) — fetches funding rates, asset contexts, and perp dex list from Hyperliquid API. Exports `calculateSpread()` helper.
- **`FundingScannerEnhanced`** (`src/services/funding-scanner-enhanced.ts`) — orchestrates periodic scans, writes results to CSV, sends Telegram alerts. Tracks `lastScanTime`, `lastFilteredCoins`, and `alertedCoins`. Exposes `getScannerStatus()` for bot status commands.
- **`TelegramBotServiceEnhanced`** (`src/services/telegram-bot-enhanced.ts`) — Telegram bot with dynamic `/subscribe` and `/unsubscribe` commands. Persists subscribers to `data/subscribed_users.json`. Merges env-configured chat IDs with dynamically subscribed users. Auto-removes users who block the bot (403/400 errors). Limits alert messages to 10 coins.

### Shared Logic
- **`scanAndFilterAllCoins()`** (`src/utils/scan-filter.ts`) — iterates all perp dexes via `getPerpDexs()`, fetches `metaAndAssetContexts` for each dex, and filters coins by alert criteria.

## Commands
- `npm run dev` — run enhanced scanner (ts-node, transpile-only) via `scripts/start-enhanced.ts`
- `npm run build` — compile TypeScript to `dist/`
- `npm run start` — run enhanced scanner (ts-node)

## Alert Criteria
A coin triggers an alert when ALL of the following are true:
- `|Funding Rate| > 0.01%` (threshold: `MIN_FUNDING = 0.0001`)
- `|Funding Rate| > 0.2 * Spread` (spread calculated from `impactPxs` via `calculateSpread()`)
- `24h Volume > $1M` (threshold: `MIN_VOLUME = 1_000_000`)

## Environment Variables
- `HYPERLIQUID_API_URL` — API endpoint (default: `https://api.hyperliquid.xyz/info`)
- `SCAN_INTERVAL_MS` — scan interval in ms (default: `3600000` = 1 hour)
- `CSV_FILE_PATH` — output CSV path (default: `./data/funding_rates.csv`)
- `FILTER_OUTPUT_CSV_PATH` — filtered coins CSV path (default: `./data/filtered_coins.csv`)
- `LOG_LEVEL` — `debug` / `info` / `warn` / `error` (default: `info`)
- `TELEGRAM_BOT_TOKEN` — Telegram bot token from @BotFather
- `TELEGRAM_CHAT_IDS` — comma-separated list of chat IDs for static notifications
- Copy `.env.example` to `.env` for local development

## Data Storage
- `data/funding_rates.csv` — append-only CSV of all scanned funding rate records (timestamp, dex, coin, funding rate, oracle price, mark price, open interest, volume)
- `data/filtered_coins.csv` — overwritten each scan with coins matching alert criteria
- `data/subscribed_users.json` — dynamically managed list of Telegram subscribers (id, username, firstName, lastName, subscribedAt)

## Code Standards
- TypeScript strict mode enabled (`tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`)
- Use `logger` from `src/utils/logger.ts` for all logging (debug/info/warn/error levels)
- Config values go in `src/config/index.ts` — never hardcode config in services
- 100ms delay between coin/dex API requests to respect rate limits

## Important Notes
- Telegram messages use HTML `parse_mode` — user-supplied text (coin names, DEX names) must be escaped with `escapeHtml()` to prevent injection
- Duplicate alert prevention: the scanner tracks previously alerted coins and only notifies on new matches. The alerted set is replaced (not merged) each scan cycle so stale coins drop off
- `TelegramBotServiceEnhanced` auto-removes subscribers on 403 (bot blocked) or 400 (chat not found) errors
- The `start-enhanced.ts` entrypoint wires `telegramBot.setScanCallback()` to the scanner's `triggerManualScan()` so `/scan` works at runtime
