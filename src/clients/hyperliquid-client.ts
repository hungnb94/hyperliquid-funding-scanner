import axios, { AxiosInstance } from 'axios';
import { HYPERLIQUID_API_URL } from '../config';
import { MetaAndAssetCtxsApiResponse } from '../types/hyperliquid';
import { logger } from '../utils/logger';

export function calculateSpread(impactPxs: [string, string] | null, fallbackMidPrice?: number): number {
  if (!impactPxs) return 0;
  const bid = parseFloat(impactPxs[0]);
  const ask = parseFloat(impactPxs[1]);
  if (bid === 0 || ask === 0) return 0;
  return (ask - bid) / ((ask + bid) / 2);
}

export class HyperliquidClient {
  private client: AxiosInstance;

  constructor(baseURL: string = HYPERLIQUID_API_URL) {
    this.client = axios.create({
      baseURL,
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });
  }

  async getMetaAndAssetContexts(dex: string = ''): Promise<MetaAndAssetCtxsApiResponse> {
    const requestBody = { type: 'metaAndAssetCtxs', dex };
    
    try {
      logger.debug(`Fetching meta and asset contexts for dex: ${dex || '(first perp dex)'}`);
      const response = await this.client.post('', requestBody);
      
      if (!Array.isArray(response.data) || response.data.length !== 2) {
        throw new Error(`Unexpected API response structure for dex ${dex}`);
      }
      
      return response.data as MetaAndAssetCtxsApiResponse;
    } catch (error) {
      logger.error(`Failed to fetch data for dex ${dex}:`, error);
      throw error;
    }
  }

  async getPerpDexs(): Promise<Array<{ name: string } | null>> {
    const requestBody = { type: 'perpDexs' };
    
    try {
      logger.debug('Fetching perp dex list');
      const response = await this.client.post('', requestBody);
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch perp dex list:', error);
      throw error;
    }
  }

  async getFundingRateForCoin(dex: string, coin: string): Promise<{ fundingRate: string; oraclePrice: string; markPrice: string; openInterest: string; dayNtlVlm: string } | null> {
    try {
      const [meta, assetContexts] = await this.getMetaAndAssetContexts(dex);
      
      const coinIndex = meta.universe.findIndex(c => c.name === coin);
      if (coinIndex === -1) {
        logger.warn(`Coin ${coin} not found in dex ${dex}`);
        return null;
      }
      
      const assetContext = assetContexts[coinIndex];
      if (!assetContext) {
        logger.warn(`No asset context found for coin ${coin} in dex ${dex}`);
        return null;
      }
      
      return {
        fundingRate: assetContext.funding,
        oraclePrice: assetContext.oraclePx,
        markPrice: assetContext.markPx,
        openInterest: assetContext.openInterest,
        dayNtlVlm: assetContext.dayNtlVlm,
      };
    } catch (error) {
      logger.error(`Error getting funding rate for ${coin} (dex ${dex}):`, error);
      return null;
    }
  }
}