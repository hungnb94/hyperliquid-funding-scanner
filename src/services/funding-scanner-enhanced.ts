import { HyperliquidClient } from '../clients/hyperliquid-client';
import { writeFundingRateToCSV } from '../utils/csv-writer';
import { FundingRateRecord, FilteredCoin } from '../types/hyperliquid';
import { TARGET_COINS, SCAN_INTERVAL_MS } from '../config';
import { logger } from '../utils/logger';
import { TelegramBotServiceEnhanced } from './telegram-bot-enhanced';
import { scanAndFilterAllCoins } from '../utils/scan-filter';

export class FundingScannerEnhanced {
  private client: HyperliquidClient;
  private telegramBot: TelegramBotServiceEnhanced;
  protected intervalId: NodeJS.Timeout | null = null;
  private isScanning = false;
  private lastScanTime: Date | null = null;
  private lastFilteredCoins: FilteredCoin[] = [];
  private alertedCoins: Set<string> = new Set();

  constructor(client: HyperliquidClient, telegramBot?: TelegramBotServiceEnhanced) {
    this.client = client;
    this.telegramBot = telegramBot || new TelegramBotServiceEnhanced();
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

    this.lastScanTime = new Date();
    logger.info('Funding rate scan completed');
    this.isScanning = false;
  }

  async scanAndFilterAllCoins(): Promise<FilteredCoin[]> {
    if (this.isScanning) {
      logger.warn('Scan already in progress, skipping');
      return this.lastFilteredCoins;
    }

    this.isScanning = true;

    try {
      const allFiltered = await scanAndFilterAllCoins(this.client);

      // Build a set of coin keys from current scan
      const currentCoinKeys = new Set(allFiltered.map(c => `${c.dexName || ''}:${c.coin}`));

      // Filter to only NEW coins not previously alerted
      const newCoins = allFiltered.filter(c => {
        const key = `${c.dexName || ''}:${c.coin}`;
        return !this.alertedCoins.has(key);
      });

      // Send notifications only for new matches
      if (newCoins.length > 0) {
        logger.info(`Found ${newCoins.length} new coins matching criteria (of ${allFiltered.length} total), sending notifications`);
        await this.telegramBot.sendFundingAlert(newCoins);
      } else {
        logger.debug('No new coins matched filtering criteria (all previously alerted)');
      }

      // Update alerted set: add all current matches, remove stale ones
      this.alertedCoins = currentCoinKeys;

      this.lastFilteredCoins = allFiltered;
      this.lastScanTime = new Date();

    } catch (error) {
      logger.error('Error during full scan and filtering:', error);
    }

    this.isScanning = false;
    return this.lastFilteredCoins;
  }

  async triggerManualScan(): Promise<{
    success: boolean;
    coinsFound: number;
    message: string;
    coins: FilteredCoin[];
  }> {
    try {
      logger.info('Manual scan triggered');
      const coins = await this.scanAndFilterAllCoins();

      return {
        success: true,
        coinsFound: coins.length,
        message: coins.length > 0
          ? `Found ${coins.length} coins matching criteria. Notifications sent to subscribers.`
          : 'No coins matching criteria found.',
        coins
      };
    } catch (error: any) {
      logger.error('Manual scan failed:', error);
      return {
        success: false,
        coinsFound: 0,
        message: `Scan failed: ${error.message}`,
        coins: []
      };
    }
  }

  getScannerStatus(): {
    isScanning: boolean;
    lastScanTime: Date | null;
    lastCoinsFound: number;
    subscribedUsers: number;
    totalChats: number;
  } {
    return {
      isScanning: this.isScanning,
      lastScanTime: this.lastScanTime,
      lastCoinsFound: this.lastFilteredCoins.length,
      subscribedUsers: this.telegramBot.getSubscribedUserCount(),
      totalChats: this.telegramBot.getTotalChatCount(),
    };
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
