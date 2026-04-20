import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FundingScannerEnhanced } from './funding-scanner-enhanced';
import { HyperliquidClient } from '../clients/hyperliquid-client';
import { TelegramBotServiceEnhanced } from './telegram-bot-enhanced';
import { FilteredCoin } from '../types/hyperliquid';

// Mock dependencies
vi.mock('../clients/hyperliquid-client');
vi.mock('./telegram-bot-enhanced');
vi.mock('../utils/scan-filter');

describe('FundingScannerEnhanced', () => {
  let mockClient: HyperliquidClient;
  let mockTelegramBot: TelegramBotServiceEnhanced;

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient = {
      getPerpDexs: vi.fn().mockResolvedValue([]),
      getMetaAndAssetContexts: vi.fn().mockResolvedValue([{ universe: [] }, []]),
    } as unknown as HyperliquidClient;

    mockTelegramBot = {
      sendFundingAlert: vi.fn().mockResolvedValue(undefined),
      getSubscribedUserCount: vi.fn().mockReturnValue(0),
      getTotalChatCount: vi.fn().mockReturnValue(0),
    } as unknown as TelegramBotServiceEnhanced;
  });

  describe('triggerManualScan', () => {
    it('should NOT call sendFundingAlert when user triggers /scan', async () => {
      const scanner = new FundingScannerEnhanced(mockClient, mockTelegramBot);

      // Mock scanAndFilterAllCoins to return some filtered coins
      const { scanAndFilterAllCoins } = await import('../utils/scan-filter');
      vi.mocked(scanAndFilterAllCoins).mockResolvedValue([
        {
          dexIndex: 0,
          coin: 'BTC',
          fundingRate: 0.05,
          volume: 1000000,
          spread: 0.01,
        },
      ] as FilteredCoin[]);

      const result = await scanner.triggerManualScan();

      expect(result.success).toBe(true);
      expect(result.coinsFound).toBe(1);
      // Critical assertion: sendFundingAlert should NOT be called on manual scan
      expect(mockTelegramBot.sendFundingAlert).not.toHaveBeenCalled();
    });

    it('should return coins in the result for display to user', async () => {
      const scanner = new FundingScannerEnhanced(mockClient, mockTelegramBot);

      const mockCoins = [
        {
          dexIndex: 0,
          coin: 'ETH',
          fundingRate: 0.03,
          volume: 2000000,
          spread: 0.02,
        },
      ] as FilteredCoin[];

      const { scanAndFilterAllCoins } = await import('../utils/scan-filter');
      vi.mocked(scanAndFilterAllCoins).mockResolvedValue(mockCoins);

      const result = await scanner.triggerManualScan();

      expect(result.success).toBe(true);
      expect(result.coins).toEqual(mockCoins);
      expect(result.coinsFound).toBe(1);
    });
  });
});
