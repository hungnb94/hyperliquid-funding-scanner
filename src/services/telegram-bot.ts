import { Telegraf } from 'telegraf';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_IDS } from '../config';
import { FilteredCoin } from '../types/hyperliquid';
import { logger } from '../utils/logger';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export type ScanCallback = () => Promise<{
  success: boolean;
  coinsFound: number;
  message: string;
}>;

export class TelegramBotService {
  private bot: Telegraf | null = null;
  private chatIds: string[] = [];
  private scanCallback: ScanCallback | null = null;

  constructor() {
    if (!TELEGRAM_BOT_TOKEN) {
      logger.warn('TELEGRAM_BOT_TOKEN not configured, Telegram notifications disabled');
      return;
    }

    this.chatIds = TELEGRAM_CHAT_IDS;
    if (this.chatIds.length === 0) {
      logger.warn('No TELEGRAM_CHAT_IDS configured, Telegram notifications disabled');
      return;
    }

    try {
      this.bot = new Telegraf(TELEGRAM_BOT_TOKEN);
      logger.info('Telegram bot initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Telegram bot:', error);
    }
  }

  setScanCallback(callback: ScanCallback): void {
    this.scanCallback = callback;
  }

  async sendFundingAlert(filteredCoins: FilteredCoin[]): Promise<void> {
    if (!this.bot || this.chatIds.length === 0) {
      logger.debug('Telegram bot not configured, skipping notification');
      return;
    }

    if (filteredCoins.length === 0) {
      logger.debug('No coins to notify about');
      return;
    }

    const message = this.formatFundingAlertMessage(filteredCoins);

    for (const chatId of this.chatIds) {
      try {
        await this.bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
        logger.info(`Sent funding alert to chat ${chatId}`);
      } catch (error) {
        logger.error(`Failed to send message to chat ${chatId}:`, error);
      }
    }
  }

  private formatFundingAlertMessage(filteredCoins: FilteredCoin[]): string {
    const timestamp = new Date().toLocaleString();

    let message = `🚨 <b>Hyperliquid Funding Rate Alert</b>\n`;
    message += `📅 ${timestamp}\n\n`;
    message += `📊 <b>Coins matching criteria:</b>\n\n`;

    // Sort by volume descending for display
    const sortedCoins = [...filteredCoins].sort((a, b) => b.volume - a.volume);

    for (const coin of sortedCoins) {
      const fundingPercent = (coin.fundingRate * 100).toFixed(4);
      const spreadPercent = (coin.spread * 100).toFixed(4);
      const volumeFormatted = coin.volume.toLocaleString();

      message += `💰 <b>${escapeHtml(coin.coin)}</b>\n`;
      message += `   📈 Funding: ${fundingPercent}%\n`;
      message += `   📊 Spread: ${spreadPercent}%\n`;
      message += `   💵 Volume: $${volumeFormatted}\n`;
      if (coin.dexName) {
        message += `   🏛️ DEX: ${escapeHtml(coin.dexName)}\n`;
      }
      message += `\n`;
    }

    message += `<b>Criteria:</b>\n`;
    message += `• |Funding Rate| > 0.01%\n`;
    message += `• |Funding Rate| > 0.2 * Spread\n`;
    message += `• 24h Volume > $1M\n`;

    return message;
  }

  async startBot(): Promise<void> {
    if (!this.bot) {
      logger.debug('Telegram bot not configured, not starting');
      return;
    }

    try {
      // Basic command handling
      this.bot.start((ctx) => {
        ctx.reply('🤖 Hyperliquid Funding Rate Scanner Bot\n\nI will notify you when coins match your funding rate criteria!\n\n<b>Commands:</b>\n/scan - Run manual scan\n/help - Show help', { parse_mode: 'HTML' });
      });

      this.bot.help((ctx) => {
        ctx.reply('📋 <b>Commands:</b>\n/start - Start the bot\n/scan - Run manual scan\n/help - Show this help\n\nI automatically send alerts when coins meet the criteria.', { parse_mode: 'HTML' });
      });

      this.bot.command('scan', async (ctx) => {
        await ctx.reply('🔍 Running manual scan...');

        if (!this.scanCallback) {
          await ctx.reply('⚠️ Scanner not available. Please try again later.');
          return;
        }

        try {
          const result = await this.scanCallback();
          await ctx.reply(
            result.success
              ? `✅ ${result.message}`
              : `❌ ${result.message}`,
            { parse_mode: 'HTML' }
          );
        } catch (error: any) {
          logger.error('Error during manual scan from /scan command:', error);
          await ctx.reply(`❌ Scan failed: ${error.message}`);
        }
      });

      // Launch bot
      await this.bot.launch();
      logger.info('Telegram bot started successfully');

      // Graceful shutdown
      process.on('SIGINT', () => this.bot?.stop('SIGINT'));
      process.on('SIGTERM', () => this.bot?.stop('SIGTERM'));
    } catch (error) {
      logger.error('Failed to start Telegram bot:', error);
    }
  }

  async stopBot(): Promise<void> {
    if (this.bot) {
      await this.bot.stop();
      logger.info('Telegram bot stopped');
    }
  }
}