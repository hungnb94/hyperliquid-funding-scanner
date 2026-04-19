import { FundingScannerEnhanced } from '../src/services/funding-scanner-enhanced';
import { TelegramBotServiceEnhanced } from '../src/services/telegram-bot-enhanced';
import { HyperliquidClient } from '../src/clients/hyperliquid-client';
import { initializeCSV } from '../src/utils/csv-writer';
import { logger } from '../src/utils/logger';

async function main() {
  logger.info('Hyperliquid Funding Rate Scanner (Enhanced) starting...');

  try {
    // Initialize CSV writer
    await initializeCSV();

    // Create client and telegram bot (without scan callback yet)
    const client = new HyperliquidClient();
    const telegramBot = new TelegramBotServiceEnhanced();
    const scanner = new FundingScannerEnhanced(client, telegramBot);

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

    logger.info('Enhanced scanner started successfully. Press Ctrl+C to stop.');

    // Log initial status
    const status = scanner.getScannerStatus();
    logger.info(`Scanner status: ${status.subscribedUsers} subscribed users, ${status.totalChats} total chats`);

  } catch (error) {
    logger.error('Failed to start enhanced scanner:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
