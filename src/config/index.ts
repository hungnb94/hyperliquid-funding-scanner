import dotenv from 'dotenv';
dotenv.config();

export interface TargetCoin {
  dex: string;
  coin: string;
}

export const HYPERLIQUID_API_URL = process.env.HYPERLIQUID_API_URL || 'https://api.hyperliquid.xyz/info';

let targetCoins: TargetCoin[] = [];
try {
  const coinsJson = process.env.TARGET_COINS;
  if (coinsJson) {
    targetCoins = JSON.parse(coinsJson);
  }
} catch (error) {
  console.error('Failed to parse TARGET_COINS JSON:', error);
  process.exit(1);
}

if (targetCoins.length === 0) {
  console.error('No target coins configured. Please set TARGET_COINS environment variable.');
  process.exit(1);
}

export const TARGET_COINS = targetCoins;
export const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || '3600000', 10);
export const CSV_FILE_PATH = process.env.CSV_FILE_PATH || './data/funding_rates.csv';
export const FILTER_OUTPUT_CSV_PATH = process.env.FILTER_OUTPUT_CSV_PATH || './data/filtered_coins.csv';
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Telegram Bot Configuration
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_IDS ? process.env.TELEGRAM_CHAT_IDS.split(',').map(id => id.trim()) : [];