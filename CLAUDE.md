# Hyperliquid Funding Rate Scanner

## Project Overview
TypeScript/Node.js application that periodically scans funding rates for perpetual contracts on the Hyperliquid exchange and logs them to CSV. Uses Axios for API calls.

## Architecture

### Key Directories
- `src/clients/` — API clients (`HyperliquidClient` for Hyperliquid REST API)
- `src/services/` — Scanner logic (`FundingScanner` for periodic scanning)
- `src/utils/` — Utilities (`logger.ts` for logging, `csv-writer.ts` for CSV output)
- `src/config/` — Configuration from environment variables
- `src/types/` — TypeScript type definitions for Hyperliquid API responses
- `scripts/` — Entry point scripts (`start.ts`, `filter-coins.ts`, `test-scan.ts`)
- `data/` — CSV output directory

### Main Classes
- `HyperliquidClient` — fetches funding rates and asset contexts from Hyperliquid API
- `FundingScanner` — orchestrates periodic scans, writes results to CSV

## Commands
- `npm run dev` — run scanner (ts-node, transpile-only)
- `npm run build` — compile TypeScript to `dist/`
- `npx tsc --noEmit` — type check without emitting
- `npm run filter-coins` — run coin filter script

## Code Standards
- TypeScript strict mode enabled (`tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`)
- Use `logger` from `src/utils/logger.ts` for all logging (debug/info/warn/error levels)
- Config values go in `src/config/index.ts` — never hardcode config in services
- 100ms delay between coin API requests to respect rate limits

## Environment Variables
- `HYPERLIQUID_API_URL` — API endpoint (default: `https://api.hyperliquid.xyz/info`)
- `TARGET_COINS` — JSON array of `{dex, coin}` objects to monitor
- `SCAN_INTERVAL_MS` — scan interval in ms (default: 3600000 = 1 hour)
- `CSV_FILE_PATH` — output CSV path (default: `./data/funding_rates.csv`)
- `LOG_LEVEL` — debug/info/warn/error (default: info)
- Copy `.env.example` to `.env` for local development
