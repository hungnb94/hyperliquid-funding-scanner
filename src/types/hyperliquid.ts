export interface CoinMetadata {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated?: boolean;
  marginMode?: string;
  isDelisted?: boolean;
}

export interface AssetContext {
  dayNtlVlm: string;
  funding: string;
  impactPxs: [string, string] | null;
  markPx: string;
  midPx: string | null;
  openInterest: string;
  oraclePx: string;
  premium: string | null;
  prevDayPx: string;
  dayBaseVlm?: string;
}

export interface MetaAndAssetCtxsResponse {
  universe: CoinMetadata[];
  marginTables: Array<[number, { description: string; marginTiers: Array<{ lowerBound: string; maxLeverage: number }> }]>;
  collateralToken: number;
  assetContexts?: AssetContext[]; // mapping by index with universe
}

// Response from metaAndAssetCtxs endpoint is a tuple [MetaAndAssetCtxsResponse, AssetContext[]]
export type MetaAndAssetCtxsApiResponse = [MetaAndAssetCtxsResponse, AssetContext[]];

export interface FundingRateRecord {
  timestamp: Date;
  dex: string;
  coin: string;
  fundingRate: string;
  oraclePrice: string;
  markPrice: string;
  openInterest: string;
  dayNtlVlm: string;
}

export interface FilteredCoin {
  dexIndex: number;
  dexName?: string; // dex identifier if available
  coin: string;
  volume: number;
  fundingRate: number;
  spread: number;
}

export interface FilteredCoinCSVRow {
  TIMESTAMP: string;
  DEX_INDEX: string;
  DEX_NAME: string;
  COIN: string;
  VOLUME_USD: string;
  FUNDING_RATE: string;
  SPREAD: string;
}