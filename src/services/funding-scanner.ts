import { HyperliquidClient } from '../clients/hyperliquid-client';
import { writeFundingRateToCSV } from '../utils/csv-writer';
import { FundingRateRecord } from '../types/hyperliquid';
import { TARGET_COINS, SCAN_INTERVAL_MS } from '../config';
import { logger } from '../utils/logger';

export class FundingScanner {
  private client: HyperliquidClient;
  protected intervalId: NodeJS.Timeout | null = null;
  private isScanning = false;

  constructor(client: HyperliquidClient) {
    this.client = client;
  }

  async scanOnce(): Promise<void> {
    if (this.isScanning) {
      logger.warn('Scan already in progress, skipping');
      return;
    }

    this.isScanning = true;
    const timestamp = new Date();

    logger.info(`Starting funding rate scan for ${TARGET_COINS.length} coins`);

    for (const target of TARGET_COINS) {
      try {
        logger.debug(`Scanning ${target.coin} (dex: ${target.dex})`);
        
        const data = await this.client.getFundingRateForCoin(target.dex, target.coin);
        
        if (data) {
          const record: FundingRateRecord = {
            timestamp,
            dex: target.dex,
            coin: target.coin,
            fundingRate: data.fundingRate,
            oraclePrice: data.oraclePrice,
            markPrice: data.markPrice,
            openInterest: data.openInterest,
            dayNtlVlm: data.dayNtlVlm,
          };
          
          await writeFundingRateToCSV(record);
          
          logger.info(`Funding rate for ${target.coin}: ${data.fundingRate} (oracle: ${data.oraclePrice}, mark: ${data.markPrice})`);
        } else {
          logger.warn(`No funding rate data for ${target.coin}`);
        }
      } catch (error) {
        logger.error(`Error scanning ${target.coin}:`, error);
      }
      
      // Small delay between coins to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info('Funding rate scan completed');
    this.isScanning = false;
  }

  startPeriodicScanning(): void {
    logger.info(`Starting periodic scanning with interval ${SCAN_INTERVAL_MS}ms`);
    
    // Initial scan
    this.scanOnce().catch(error => {
      logger.error('Initial scan failed:', error);
    });
    
    // Set up interval
    this.intervalId = setInterval(() => {
      this.scanOnce().catch(error => {
        logger.error('Periodic scan failed:', error);
      });
    }, SCAN_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Periodic scanning stopped');
    }
  }
}