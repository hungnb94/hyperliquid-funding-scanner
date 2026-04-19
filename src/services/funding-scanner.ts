import { HyperliquidClient } from '../clients/hyperliquid-client';
import { writeFundingRateToCSV } from '../utils/csv-writer';
import { FundingRateRecord, FilteredCoin } from '../types/hyperliquid';
import { TARGET_COINS, SCAN_INTERVAL_MS } from '../config';
import { logger } from '../utils/logger';
import { TelegramBotService } from './telegram-bot';
import { scanAndFilterAllCoins } from '../utils/scan-filter';

export class FundingScanner {
  private client: HyperliquidClient;
  private telegramBot: TelegramBotService;
  protected intervalId: NodeJS.Timeout | null = null;
  private isScanning = false;
  private lastAlertedCoins: Set<string> = new Set();

  constructor(client: HyperliquidClient, telegramBot?: TelegramBotService) {
    this.client = client;
    this.telegramBot = telegramBot || new TelegramBotService();
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

  async scanAndFilterAllCoins(): Promise<void> {
    if (this.isScanning) {
      logger.warn('Scan already in progress, skipping');
      return;
    }

    this.isScanning = true;

    try {
      const allFiltered = await scanAndFilterAllCoins(this.client);

      // Build a set of coin keys from current scan
      const currentCoinKeys = new Set(allFiltered.map(c => `${c.dexName || ''}:${c.coin}`));

      // Filter to only NEW coins not previously alerted
      const newCoins = allFiltered.filter(c => {
        const key = `${c.dexName || ''}:${c.coin}`;
        return !this.lastAlertedCoins.has(key);
      });

      // Send notifications only for new matches
      if (newCoins.length > 0) {
        logger.info(`Found ${newCoins.length} new coins matching criteria (of ${allFiltered.length} total), sending notifications`);
        await this.telegramBot.sendFundingAlert(newCoins);
      } else {
        logger.debug('No new coins matched filtering criteria (all previously alerted)');
      }

      // Update alerted set: add all current matches, remove stale ones
      this.lastAlertedCoins = currentCoinKeys;

    } catch (error) {
      logger.error('Error during full scan and filtering:', error);
    }

    this.isScanning = false;
  }

  async triggerManualScan(): Promise<{
    success: boolean;
    coinsFound: number;
    message: string;
  }> {
    try {
      logger.info('Manual scan triggered');
      await this.scanAndFilterAllCoins();
      const coinsFound = this.lastAlertedCoins.size;

      return {
        success: true,
        coinsFound,
        message: coinsFound > 0
          ? `Found ${coinsFound} coins matching criteria. Notifications sent to subscribers.`
          : 'No coins matching criteria found.'
      };
    } catch (error: any) {
      logger.error('Manual scan failed:', error);
      return {
        success: false,
        coinsFound: 0,
        message: `Scan failed: ${error.message}`
      };
    }
  }

  startPeriodicScanning(): void {
    logger.info(`Starting periodic scanning with interval ${SCAN_INTERVAL_MS}ms`);

    // Initial scans
    this.scanOnce().catch(error => {
      logger.error('Initial targeted scan failed:', error);
    });

    this.scanAndFilterAllCoins().catch(error => {
      logger.error('Initial filtering scan failed:', error);
    });

    // Set up interval
    this.intervalId = setInterval(() => {
      this.scanOnce().catch(error => {
        logger.error('Periodic targeted scan failed:', error);
      });

      this.scanAndFilterAllCoins().catch(error => {
        logger.error('Periodic filtering scan failed:', error);
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
