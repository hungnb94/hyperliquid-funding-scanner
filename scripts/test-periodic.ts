import { FundingScanner } from '../src/services/funding-scanner';
import { HyperliquidClient } from '../src/clients/hyperliquid-client';
import { initializeCSV } from '../src/utils/csv-writer';
import { logger } from '../src/utils/logger';

async function main() {
  logger.info('Testing periodic scanning (interval 10s)...');
  
  try {
    await initializeCSV();
    const client = new HyperliquidClient();
    const scanner = new FundingScanner(client);
    
    // Override interval to 10 seconds for testing
    const testIntervalMs = 10000;
    let scanCount = 0;
    const maxScans = 2;
    
    const originalStart = scanner.startPeriodicScanning;
    scanner.startPeriodicScanning = function() {
      logger.info(`Starting periodic scanning with test interval ${testIntervalMs}ms`);
      
      // Initial scan
      this.scanOnce().catch(error => {
        logger.error('Initial scan failed:', error);
      });
      
      // Set up interval
      this.intervalId = setInterval(() => {
        this.scanOnce().catch(error => {
          logger.error('Periodic scan failed:', error);
        });
        scanCount++;
        if (scanCount >= maxScans) {
          logger.info(`Reached ${maxScans} scans, stopping...`);
          this.stop();
          process.exit(0);
        }
      }, testIntervalMs);
    };
    
    // Handle graceful shutdown
    const shutdown = (signal: string) => {
      logger.info(`Received ${signal}, shutting down...`);
      scanner.stop();
      process.exit(0);
    };
    
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    scanner.startPeriodicScanning();
    logger.info('Test periodic scanner started. Will stop after 2 scans.');
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