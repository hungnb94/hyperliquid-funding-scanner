import { describe, it, expect } from 'vitest';
import { formatScanResults } from './format';
import { FilteredCoin } from '../types/hyperliquid';

describe('formatScanResults', () => {
  const mockCoin = (overrides: Partial<FilteredCoin> = {}): FilteredCoin => ({
    dexIndex: 0,
    coin: 'BTC',
    fundingRate: 0.0001,
    volume: 1000000,
    spread: 0.001,
    dexName: 'main',
    ...overrides,
  });

  it('should return no coins message when array is empty', () => {
    const result = formatScanResults([]);
    expect(result).toBe('✅ No coins matching criteria found.');
  });

  it('should format single coin correctly', () => {
    const coins = [mockCoin({ coin: 'ETH', fundingRate: 0.0005, volume: 2000000, spread: 0.002, dexName: undefined })];
    const result = formatScanResults(coins);

    expect(result).toContain('💰 <b>ETH</b>');
    expect(result).toContain('📈 Funding: 0.0500%');
    expect(result).toContain('📊 Spread: 0.2000%');
    expect(result).toContain('💵 Volume: $2,000,000');
  });

  it('should format coin with dexName as dexName:coin', () => {
    const coins = [mockCoin({ coin: 'BTC', dexName: 'perp' })];
    const result = formatScanResults(coins);
    expect(result).toContain('💰 <b>perp:BTC</b>');
  });

  it('should format coin without dexName as just coin name', () => {
    const coins = [mockCoin({ coin: 'SOL', dexName: undefined })];
    const result = formatScanResults(coins);
    expect(result).toContain('💰 <b>SOL</b>');
  });

  it('should sort coins by volume descending', () => {
    const coins = [
      mockCoin({ coin: 'LOW', volume: 100000 }),
      mockCoin({ coin: 'HIGH', volume: 5000000 }),
      mockCoin({ coin: 'MID', volume: 1000000 }),
    ];
    const result = formatScanResults(coins);

    const highIndex = result.indexOf('HIGH');
    const midIndex = result.indexOf('MID');
    const lowIndex = result.indexOf('LOW');

    expect(highIndex).toBeLessThan(midIndex);
    expect(midIndex).toBeLessThan(lowIndex);
  });

  it('should format negative funding rate correctly', () => {
    const coins = [mockCoin({ coin: 'DOGE', fundingRate: -0.0003 })];
    const result = formatScanResults(coins);
    expect(result).toContain('📈 Funding: -0.0300%');
  });

  it('should format positive funding rate correctly', () => {
    const coins = [mockCoin({ coin: 'DOGE', fundingRate: 0.0007 })];
    const result = formatScanResults(coins);
    expect(result).toContain('📈 Funding: 0.0700%');
  });

  it('should NOT include "Found X coins" header - message field provides that', () => {
    const coins = [mockCoin({ coin: 'BTC', dexName: undefined })];
    const result = formatScanResults(coins);
    // The header should NOT be present - it's provided by the message field in triggerManualScan
    expect(result).not.toContain('🚨 Found');
    expect(result).not.toContain('coins:');
    expect(result).toContain('💰 <b>BTC</b>');
  });

  it('should format multiple coins with proper spacing', () => {
    const coins = [
      mockCoin({ coin: 'BTC', volume: 5000000 }),
      mockCoin({ coin: 'ETH', volume: 3000000 }),
    ];
    const result = formatScanResults(coins);

    // Both coins should be present
    expect(result).toContain('BTC');
    expect(result).toContain('ETH');

    // Should have proper line breaks between coins
    expect(result).toContain('\n\n');
  });
});
