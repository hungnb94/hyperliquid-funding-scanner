import { FundingScanner } from '../src/services/funding-scanner';
import { HyperliquidClient } from '../src/clients/hyperliquid-client';
import { initializeCSV } from '../src/utils/csv-writer';
import { logger } from '../src/utils/logger';

async function main() {
  logger.info('Test scanning once...');
  
  try {
    await initializeCSV();
    const client = new HyperliquidClient();
    const scanner = new FundingScanner(client);
    
    await scanner.scanOnce();
    logger.info('Test scan completed');
    process.exit(0);
  } catch (error) {
    logger.error('Test scan failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}