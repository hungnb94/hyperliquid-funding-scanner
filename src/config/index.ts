import dotenv from 'dotenv';
dotenv.config();

export const HYPERLIQUID_API_URL = process.env.HYPERLIQUID_API_URL || 'https://api.hyperliquid.xyz/info';

export const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || '3600000', 10);
export const CSV_FILE_PATH = process.env.CSV_FILE_PATH || './data/funding_rates.csv';
export const FILTER_OUTPUT_CSV_PATH = process.env.FILTER_OUTPUT_CSV_PATH || './data/filtered_coins.csv';
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Telegram Bot Configuration
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_IDS ? process.env.TELEGRAM_CHAT_IDS.split(',').map(id => id.trim()) : [];

// Scan filter thresholds
export const MIN_VOLUME = 1_000_000; // $1M minimum 24h volume
export const MIN_FUNDING = 0.0001; // 0.01% minimum funding rate