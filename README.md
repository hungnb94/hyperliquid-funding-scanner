# Hyperliquid Funding Rate Scanner

A TypeScript application that periodically scans funding rates for perpetual contracts on Hyperliquid exchange and logs them to a CSV file.

## Features

- Fetches current funding rates from Hyperliquid API
- Supports multiple coins across different perp dexes
- Configurable scan interval (default: 1 hour)
- Logs results to CSV with timestamp
- **Telegram bot notifications for coins meeting funding criteria**
- Environment-based configuration
- Graceful shutdown handling

## Supported Coins

The scanner can monitor any perpetual contract available on Hyperliquid. By default, it tracks four oil-related perpetuals:
- `cash:WTI` (WTI crude oil on cash dex)
- `km:USOIL` (US oil on km dex)
- `flx:OIL` (Oil on flx dex)
- `xyz:BRENTOIL` (Brent oil on xyz dex)

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
4. Edit `.env` to configure target coins and settings

## Configuration

Edit the `.env` file:

```env
# Hyperliquid API URL
HYPERLIQUID_API_URL=https://api.hyperliquid.xyz/info

# Target coins as JSON array
TARGET_COINS=[{"dex": "cash", "coin": "cash:WTI"}, {"dex": "km", "coin": "km:USOIL"}, {"dex": "flx", "coin": "flx:OIL"}, {"dex": "xyz", "coin": "xyz:BRENTOIL"}]

# Scan interval in milliseconds (default: 1 hour = 3600000ms)
SCAN_INTERVAL_MS=3600000

# CSV file path
CSV_FILE_PATH=./data/funding_rates.csv

# Log level: debug, info, warn, error
LOG_LEVEL=info

# Telegram Bot Configuration (optional)
# Get bot token from @BotFather on Telegram
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# Comma-separated list of chat IDs to send notifications to
# Get chat ID by messaging your bot and checking https://api.telegram.org/bot<YourBOTToken>/getUpdates
TELEGRAM_CHAT_IDS=your_chat_id_here,another_chat_id_here
```

### Target Coins Format

The `TARGET_COINS` environment variable must be a JSON array of objects with:
- `dex`: The perp dex name (empty string for first perp dex)
- `coin`: The full coin name (e.g., "cash:WTI")

To find available coins and dexes, you can use the Hyperliquid API directly or check the exchange interface.

## Telegram Notifications

The scanner can send Telegram notifications when coins meet specific funding rate criteria:

- **Funding Rate**: |funding rate| > 0.01% (0.0001)
- **Spread**: |funding rate| > spread
- **Volume**: 24h volume > $1,000,000

### Setting up Telegram Bot

1. Create a new bot with [@BotFather](https://t.me/botfather) on Telegram
2. Get your bot token from BotFather
3. Add the token to your `.env` file as `TELEGRAM_BOT_TOKEN`
4. Start a chat with your bot and send a message
5. Get your chat ID by visiting: `https://api.telegram.org/bot<YourBOTToken>/getUpdates`
6. Add the chat ID to your `.env` file as `TELEGRAM_CHAT_IDS`

### Notification Format

When criteria are met, you'll receive messages like:

```
🚨 Hyperliquid Funding Rate Alert
📅 4/17/2026, 10:51:51 PM

📊 Coins matching criteria:

💰 BTC
   📈 Funding: 0.0234%
   📊 Spread: 0.0156%
   💵 Volume: $2,345,678
   🏛️ DEX: main

💰 ETH
   📈 Funding: -0.0345%
   📊 Spread: 0.0123%
   💵 Volume: $1,987,654

Criteria:
• |Funding Rate| > 0.01%
• |Funding Rate| > 0.2 * Spread
• 24h Volume > $1M
```

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

### Build
```bash
npm run build
```
Compiled JavaScript files will be in the `dist/` directory.

## Output

The scanner writes funding rate data to a CSV file (default: `data/funding_rates.csv`) with the following columns:

- `TIMESTAMP`: ISO 8601 timestamp
- `DEX`: Perp dex name
- `COIN`: Coin name
- `FUNDING_RATE`: Current funding rate (decimal)
- `ORACLE_PRICE`: Oracle price
- `MARK_PRICE`: Mark price
- `OPEN_INTEREST`: Open interest
- `DAY_NTL_VLM`: 24-hour notional volume

## Project Structure

```
hyperliquid-funding-scanner/
├── src/
│   ├── types/           # TypeScript type definitions
│   ├── clients/         # API clients (Hyperliquid)
│   ├── services/        # Scanner service
│   ├── utils/           # Utilities (CSV writer, logger)
│   └── config/          # Configuration
├── scripts/             # Entry point scripts
├── data/                # CSV output directory
├── .env.example         # Example environment variables
└── package.json
```

## Error Handling

- Failed API requests are logged and retried on next interval
- Missing coins are logged with available alternatives
- CSV write errors are logged but don't stop the scanner
- Graceful shutdown on SIGINT/SIGTERM signals

## Rate Limiting

The scanner respects Hyperliquid API rate limits by:
- Default 1-hour interval between scans
- 100ms delay between coin requests within a scan
- Exponential backoff on rate limit errors (planned)

## Extending

### Adding More Coins

Edit the `TARGET_COINS` array in `.env` to include additional coins.

### Customizing Scan Logic

Modify `src/services/funding-scanner.ts` to change scanning behavior.

### Adding Alerting

The scanner includes Telegram bot notifications when funding rates meet criteria. Additional alerting methods (Slack, email, etc.) can be added by extending the `TelegramBotService` or creating new notification services.

## License

MIT