import { FundingScanner } from '../src/services/funding-scanner';
import { HyperliquidClient } from '../src/clients/hyperliquid-client';
import { initializeCSV } from '../src/utils/csv-writer';
import { logger } from '../src/utils/logger';

async function main() {
  logger.info('Hyperliquid Funding Rate Scanner starting...');
  
  try {
    // Initialize CSV writer
    await initializeCSV();
    
    // Create client and scanner
    const client = new HyperliquidClient();
    const scanner = new FundingScanner(client);
    
    // Handle graceful shutdown
    const shutdown = (signal: string) => {
      logger.info(`Received ${signal}, shutting down...`);
      scanner.stop();
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