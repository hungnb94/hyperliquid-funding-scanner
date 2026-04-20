import { HyperliquidClient } from '../clients/hyperliquid-client';
import { FilteredCoin } from '../types/hyperliquid';
import { SCAN_INTERVAL_MS } from '../config';
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
    logger.info('Starting funding rate scan across all coins');

    try {
      await scanAndFilterAllCoins(this.client);
    } catch (error) {
      logger.error('Scan failed:', error);
    }

    this.lastScanTime = new Date();
    this.isScanning = false;
  }

  async scanAndFilterAllCoins(): Promise<FilteredCoin[]> {
    const coins = await this.scanOnly();

    // Send notifications for new matches
    if (coins.length > 0) {
      logger.info(`Found ${coins.length} coins matching criteria, sending notifications`);
      await this.telegramBot.sendFundingAlert(coins);
    } else {
      logger.debug('No coins matched filtering criteria');
    }

    return coins;
  }

  async scanOnly(): Promise<FilteredCoin[]> {
    if (this.isScanning) {
      logger.warn('Scan already in progress, skipping');
      return this.lastFilteredCoins;
    }

    this.isScanning = true;

    try {
      const allFiltered = await scanAndFilterAllCoins(this.client);

      // Build a set of coin keys from current scan
      const currentCoinKeys = new Set(allFiltered.map(c => `${c.dexName || ''}:${c.coin}`));

      // Update alerted set: add all current matches, remove stale ones
      this.alertedCoins = currentCoinKeys;

      this.lastFilteredCoins = allFiltered;
      this.lastScanTime = new Date();

      return this.lastFilteredCoins;
    } catch (error) {
      logger.error('Error during scan:', error);
      return [];
    } finally {
      this.isScanning = false;
    }
  }

  async triggerManualScan(): Promise<{
    success: boolean;
    coinsFound: number;
    message: string;
    coins: FilteredCoin[];
  }> {
    try {
      logger.info('Manual scan triggered');
      // Use scanOnly() to avoid sending duplicate alerts to subscribers
      const coins = await this.scanOnly();

      return {
        success: true,
        coinsFound: coins.length,
        message: coins.length > 0
          ? `Found ${coins.length} coins matching criteria.`
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

    // Initial scan
    this.scanAndFilterAllCoins().catch(error => {
      logger.error('Initial filtering scan failed:', error);
    });

    // Set up interval
    this.intervalId = setInterval(() => {
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
