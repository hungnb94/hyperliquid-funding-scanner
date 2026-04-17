import { createObjectCsvWriter } from 'csv-writer';
import { CSV_FILE_PATH, FILTER_OUTPUT_CSV_PATH } from '../config';
import { FundingRateRecord, FilteredCoinCSVRow } from '../types/hyperliquid';
import { logger } from './logger';

const csvWriter = createObjectCsvWriter({
  path: CSV_FILE_PATH,
  header: [
    { id: 'timestamp', title: 'TIMESTAMP' },
    { id: 'dex', title: 'DEX' },
    { id: 'coin', title: 'COIN' },
    { id: 'fundingRate', title: 'FUNDING_RATE' },
    { id: 'oraclePrice', title: 'ORACLE_PRICE' },
    { id: 'markPrice', title: 'MARK_PRICE' },
    { id: 'openInterest', title: 'OPEN_INTEREST' },
    { id: 'dayNtlVlm', title: 'DAY_NTL_VLM' },
  ],
  append: true,
});

const filteredCsvWriter = createObjectCsvWriter({
  path: FILTER_OUTPUT_CSV_PATH,
  header: [
    { id: 'TIMESTAMP', title: 'TIMESTAMP' },
    { id: 'DEX_INDEX', title: 'DEX_INDEX' },
    { id: 'DEX_NAME', title: 'DEX_NAME' },
    { id: 'COIN', title: 'COIN' },
    { id: 'VOLUME_USD', title: 'VOLUME_USD' },
    { id: 'FUNDING_RATE', title: 'FUNDING_RATE' },
    { id: 'SPREAD', title: 'SPREAD' },
  ],
  append: false,
});

export async function writeFundingRateToCSV(record: FundingRateRecord): Promise<void> {
  try {
    // Convert Date to ISO string for CSV
    const csvRecord = {
      ...record,
      timestamp: record.timestamp.toISOString(),
    };
    await csvWriter.writeRecords([csvRecord]);
    logger.debug(`Written to CSV: ${record.coin} funding ${record.fundingRate}`);
  } catch (error) {
    logger.error('Failed to write to CSV:', error);
  }
}

export async function writeFilteredCoinsToCSV(records: FilteredCoinCSVRow[]): Promise<void> {
  try {
    await filteredCsvWriter.writeRecords(records);
    logger.debug(`Written ${records.length} filtered coins to CSV`);
  } catch (error) {
    logger.error('Failed to write filtered coins to CSV:', error);
  }
}

export async function initializeCSV(): Promise<void> {
  // Check if file exists, if not create with header
  // csv-writer with append: true will create file with header automatically
  logger.debug(`CSV file path: ${CSV_FILE_PATH}`);
}