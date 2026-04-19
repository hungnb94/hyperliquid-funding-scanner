import { HyperliquidClient, calculateSpread } from '../clients/hyperliquid-client';
import { FilteredCoin } from '../types/hyperliquid';
import { MIN_VOLUME, MIN_FUNDING } from '../config';
import { logger } from './logger';

export async function scanAndFilterAllCoins(client: HyperliquidClient): Promise<FilteredCoin[]> {
  const filteredCoins: FilteredCoin[] = [];

  logger.info('Starting full funding rate scan and filtering');

  try {
    const perpDexs = await client.getPerpDexs();
    logger.debug(`Found ${perpDexs.length} perp dexes`);

    for (let dexIndex = 0; dexIndex < perpDexs.length; dexIndex++) {
      const dexEntry = perpDexs[dexIndex]!;
      const dexName = dexEntry === null ? "" : dexEntry.name;
      const dexDisplayName = dexName || "(first perp dex)";

      logger.debug(`Processing dex ${dexIndex}: ${dexDisplayName}`);

      try {
        const [meta, assetContexts] = await client.getMetaAndAssetContexts(dexName);

        for (let coinIndex = 0; coinIndex < meta.universe.length; coinIndex++) {
          const coinMeta = meta.universe[coinIndex]!;
          const assetContext = assetContexts[coinIndex];

          if (!assetContext) {
            continue;
          }

          const volume = parseFloat(assetContext.dayNtlVlm);
          if (isNaN(volume)) {
            continue;
          }

          const fundingRate = parseFloat(assetContext.funding);
          if (isNaN(fundingRate)) {
            continue;
          }

          const spread = calculateSpread(assetContext.impactPxs);

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
  } catch (error) {
    logger.error('Error during full scan and filtering:', error);
  }

  return filteredCoins;
}
