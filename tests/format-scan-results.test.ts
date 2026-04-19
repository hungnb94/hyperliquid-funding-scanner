import { describe, it, expect } from 'vitest';
import { FilteredCoin } from '../src/types/hyperliquid';
import { formatScanResults } from '../src/utils/format';

describe('formatScanResults (production)', () => {
  it('should return no-coins message when array is empty', () => {
    const result = formatScanResults([]);
    expect(result).toBe('✅ No coins matching criteria found.');
  });

  it('should format a single coin with correct data', () => {
    const coins: FilteredCoin[] = [{
      dexIndex: 0,
      coin: 'BTC',
      volume: 5_000_000,
      fundingRate: 0.0002,
      spread: 0.0005,
    }];

    const result = formatScanResults(coins);

    expect(result).toContain('🚨 Found 1 coins:');
    expect(result).toContain('<b>BTC</b>');
    expect(result).toContain('Funding: 0.0200%');
    expect(result).toContain('Spread: 0.0500%');
    expect(result).toContain('Volume: $5,000,000');
  });

  it('should format multiple coins sorted by volume descending', () => {
    const coins: FilteredCoin[] = [
      { dexIndex: 0, coin: 'LOW', volume: 2_000_000, fundingRate: 0.0001, spread: 0.0003 },
      { dexIndex: 0, coin: 'HIGH', volume: 10_000_000, fundingRate: -0.0002, spread: 0.0004 },
    ];

    const result = formatScanResults(coins);
    const highIdx = result.indexOf('HIGH');
    const lowIdx = result.indexOf('LOW');

    expect(highIdx).toBeLessThan(lowIdx);
    expect(result).toContain('🚨 Found 2 coins:');
  });

  it('should include dex name when present', () => {
    const coins: FilteredCoin[] = [{
      dexIndex: 1,
      dexName: 'xyz',
      coin: 'BRENTOIL',
      volume: 114_803_684,
      fundingRate: 0.000174,
      spread: 0.000409,
    }];

    const result = formatScanResults(coins);
    expect(result).toContain('<b>xyz:BRENTOIL</b>');
  });

  it('should handle negative funding rates', () => {
    const coins: FilteredCoin[] = [{
      dexIndex: 0,
      coin: 'ZRO',
      volume: 32_245_109,
      fundingRate: -0.000119,
      spread: 0.000533,
    }];

    const result = formatScanResults(coins);
    expect(result).toContain('Funding: -0.0119%');
  });
});