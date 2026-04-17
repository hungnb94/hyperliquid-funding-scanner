import {
  HyperliquidClient,
  calculateSpread,
} from "../src/clients/hyperliquid-client";
import { writeFilteredCoinsToCSV } from "../src/utils/csv-writer";
import { FilteredCoin, FilteredCoinCSVRow } from "../src/types/hyperliquid";
import { logger } from "../src/utils/logger";

async function main() {
  logger.info("Starting Hyperliquid coin filter scan");

  const client = new HyperliquidClient();

  try {
    // Fetch perp dex list
    const perpDexs = await client.getPerpDexs();
    logger.info(`Found ${perpDexs.length} perp dexes`);

    const filteredCoins: FilteredCoin[] = [];

    for (let dexIndex = 0; dexIndex < perpDexs.length; dexIndex++) {
      const dexEntry = perpDexs[dexIndex]!;
      const dexName = dexEntry === null ? "" : dexEntry.name;
      const dexDisplayName = dexName || "(first perp dex)";

      logger.info(`Processing dex ${dexIndex}: ${dexDisplayName}`);

      try {
        const [meta, assetContexts] =
          await client.getMetaAndAssetContexts(dexName);
        logger.debug(`  Universe size: ${meta.universe.length}`);
        const stats = {
          total: 0,
          volumePass: 0,
          fundingPass: 0,
          spreadPass: 0,
          filtered: 0,
        };
        const MIN_VOLUME = 1_000_000; // $1M
        const MIN_FUNDING = 0.0001; // 0.01%

        for (let coinIndex = 0; coinIndex < meta.universe.length; coinIndex++) {
          const coinMeta = meta.universe[coinIndex]!;
          const assetContext = assetContexts[coinIndex];

          if (!assetContext) {
            logger.warn(
              `No asset context for coin ${coinMeta.name} in dex ${dexDisplayName}`,
            );
            continue;
          }
          stats.total++;

          // Parse volume (dayNtlVlm is string)
          const volume = parseFloat(assetContext.dayNtlVlm);
          if (isNaN(volume)) {
            logger.warn(
              `Invalid volume for ${coinMeta.name}: ${assetContext.dayNtlVlm}`,
            );
            continue;
          }

          // Parse funding rate (string to decimal)
          const fundingRate = parseFloat(assetContext.funding);
          if (isNaN(fundingRate)) {
            logger.warn(
              `Invalid funding rate for ${coinMeta.name}: ${assetContext.funding}`,
            );
            continue;
          }

          // Calculate spread from impactPxs
          const spread = calculateSpread(assetContext.impactPxs);
          if (assetContext.impactPxs === null) {
            logger.debug(`No impact prices for ${coinMeta.name}, spread = 0`);
          }

          // Update stats
          if (volume > MIN_VOLUME) stats.volumePass++;
          if (Math.abs(fundingRate) > MIN_FUNDING) stats.fundingPass++;
          if (Math.abs(fundingRate) > spread) stats.spreadPass++;

          // Apply filters

          if (volume > MIN_VOLUME) {
            logger.debug(
              `  ${coinMeta.name}: volume=${volume.toLocaleString()}, funding=${fundingRate.toFixed(6)}, spread=${spread.toFixed(6)}`,
            );
            if (
              Math.abs(fundingRate) > MIN_FUNDING
              && Math.abs(fundingRate) > spread
            ) {
              filteredCoins.push({
                dexIndex,
                dexName: dexName || undefined,
                coin: coinMeta.name,
                volume,
                fundingRate,
                spread,
              });
              logger.debug(`  ✓ PASS`);
            } else {
              logger.debug(
                `  ✗ FAIL abs(funding)>0.01%? ${Math.abs(fundingRate) > MIN_FUNDING} abs(funding)>spread? ${Math.abs(fundingRate) > spread}`,
              );
            }
          }
        }
        logger.debug(
          `Stats for dex ${dexDisplayName}: total=${stats.total}, volume>1M=${stats.volumePass}, abs(funding)>0.01%=${stats.fundingPass}, abs(funding)>spread=${stats.spreadPass}`,
        );
      } catch (error) {
        logger.error(`Failed to process dex ${dexDisplayName}:`, error);
        // Continue with next dex
      }

      // Small delay between dex requests to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Sort by volume descending
    filteredCoins.sort((a, b) => b.volume - a.volume);

    // Output results
    logger.info(`\n=== Filtered Coins (${filteredCoins.length} matches) ===`);
    filteredCoins.forEach((coin) => {
      logger.info(
        `DEX ${coin.dexIndex}${coin.dexName ? " (" + coin.dexName + ")" : ""}: ${coin.coin}`,
      );
      logger.info(`  Volume: $${coin.volume.toLocaleString()}`);
      logger.info(`  Funding: ${(coin.fundingRate * 100).toFixed(4)}%`);
      logger.info(`  Spread: ${(coin.spread * 100).toFixed(4)}%`);
    });

    // Write to CSV
    const csvRows: FilteredCoinCSVRow[] = filteredCoins.map((coin) => ({
      TIMESTAMP: new Date().toISOString(),
      DEX_INDEX: coin.dexIndex.toString(),
      DEX_NAME: coin.dexName || "",
      COIN: coin.coin,
      VOLUME_USD: coin.volume.toFixed(2),
      FUNDING_RATE: coin.fundingRate.toString(),
      SPREAD: coin.spread.toString(),
    }));

    if (csvRows.length > 0) {
      await writeFilteredCoinsToCSV(csvRows);
      logger.info(`\nWritten ${csvRows.length} filtered coins to CSV`);
    } else {
      logger.info("No coins matched filters, CSV not written");
    }

    logger.info("Filter scan completed");
  } catch (error) {
    logger.error("Filter scan failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}
