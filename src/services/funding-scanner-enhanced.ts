import { HyperliquidClient, calculateSpread } from '../clients/hyperliquid-client';
import { writeFundingRateToCSV } from '../utils/csv-writer';
import { FundingRateRecord, FilteredCoin } from '../types/hyperliquid';
import { TARGET_COINS, SCAN_INTERVAL_MS } from '../config';
import { logger } from '../utils/logger';
import { TelegramBotServiceEnhanced } from './telegram-bot-enhanced';

export class FundingScannerEnhanced {
  private client: HyperliquidClient;
  private telegramBot: TelegramBotServiceEnhanced;
  protected intervalId: NodeJS.Timeout | null = null;
  private isScanning = false;
  private lastScanTime: Date | null = null;
  private lastFilteredCoins: FilteredCoin[] = [];

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
    const timestamp = new Date();

    logger.info('Starting full funding rate scan and filtering for notifications');

    const filteredCoins: FilteredCoin[] = [];
    const MIN_VOLUME = 1_000_000; // $1M
    const MIN_FUNDING = 0.0001; // 0.01%

    try {
      // Fetch perp dex list
      const perpDexs = await this.client.getPerpDexs();
      logger.debug(`Found ${perpDexs.length} perp dexes`);

      for (let dexIndex = 0; dexIndex < perpDexs.length; dexIndex++) {
        const dexEntry = perpDexs[dexIndex]!;
        const dexName = dexEntry === null ? "" : dexEntry.name;
        const dexDisplayName = dexName || "(first perp dex)";

        logger.debug(`Processing dex ${dexIndex}: ${dexDisplayName}`);

        try {
          const [meta, assetContexts] = await this.client.getMetaAndAssetContexts(dexName);

          for (let coinIndex = 0; coinIndex < meta.universe.length; coinIndex++) {
            const coinMeta = meta.universe[coinIndex]!;
            const assetContext = assetContexts[coinIndex];

            if (!assetContext) {
              continue;
            }

            // Parse volume (dayNtlVlm is string)
            const volume = parseFloat(assetContext.dayNtlVlm);
            if (isNaN(volume)) {
              continue;
            }

            // Parse funding rate (string to decimal)
            const fundingRate = parseFloat(assetContext.funding);
            if (isNaN(fundingRate)) {
              continue;
            }

            // Calculate spread from impactPxs
            const spread = calculateSpread(assetContext.impactPxs);

            // Apply filters
            if (volume > MIN_VOLUME &&
                Math.abs(fundingRate) > MIN_FUNDING &&
                Math.abs(fundingRate) > spread) {

              filteredCoins.push({
                dexIndex,
                dexName: dexName || undefined,
                coin: coinMeta.name,
                volume,
                fundingRate,
                spread,
              });

              logger.info(`Found matching coin: ${coinMeta.name} (funding: ${(fundingRate * 100).toFixed(4)}%, volume: $${volume.toLocaleString()})`);
            }
          }
        } catch (error) {
          logger.error(`Failed to process dex ${dexDisplayName}:`, error);
        }

        // Small delay between dex requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Send notifications if any coins match criteria
      if (filteredCoins.length > 0) {
        logger.info(`Found ${filteredCoins.length} coins matching criteria, sending notifications`);
        await this.telegramBot.sendFundingAlert(filteredCoins);
      } else {
        logger.debug('No coins matched filtering criteria');
      }

      this.lastFilteredCoins = filteredCoins;
      this.lastScanTime = new Date();

    } catch (error) {
      logger.error('Error during full scan and filtering:', error);
    }

    this.isScanning = false;
    return filteredCoins;
  }

  async triggerManualScan(): Promise<{
    success: boolean;
    coinsFound: number;
    message: string;
  }> {
    try {
      logger.info('Manual scan triggered');
      const coins = await this.scanAndFilterAllCoins();
      
      return {
        success: true,
        coinsFound: coins.length,
        message: coins.length > 0 
          ? `Found ${coins.length} coins matching criteria. Notifications sent to subscribers.`
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