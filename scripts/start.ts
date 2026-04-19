import { FundingScanner } from '../src/services/funding-scanner';
import { TelegramBotService } from '../src/services/telegram-bot';
import { HyperliquidClient } from '../src/clients/hyperliquid-client';
import { initializeCSV } from '../src/utils/csv-writer';
import { logger } from '../src/utils/logger';

async function main() {
  logger.info('Hyperliquid Funding Rate Scanner starting...');

  try {
    // Initialize CSV writer
    await initializeCSV();

    // Create client, telegram bot, and scanner
    const client = new HyperliquidClient();
    const telegramBot = new TelegramBotService();
    const scanner = new FundingScanner(client, telegramBot);

    // Wire up the scan callback so /scan triggers a real scan
    telegramBot.setScanCallback(() => scanner.triggerManualScan());

    // Start Telegram bot
    await telegramBot.startBot();

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down...`);
      scanner.stop();
      await telegramBot.stopBot();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Start periodic scanning
    scanner.startPeriodicScanning();

    logger.info('Scanner started successfully. Press Ctrl+C to stop.');
  } catch (error) {
    logger.error('Failed to start scanner:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}