import { Telegraf } from 'telegraf';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_IDS } from '../config';
import { FilteredCoin } from '../types/hyperliquid';
import { logger } from '../utils/logger';

export class TelegramBotService {
  private bot: Telegraf | null = null;
  private chatIds: string[] = [];

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
        await this.bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        logger.info(`Sent funding alert to chat ${chatId}`);
      } catch (error) {
        logger.error(`Failed to send message to chat ${chatId}:`, error);
      }
    }
  }

  private formatFundingAlertMessage(filteredCoins: FilteredCoin[]): string {
    const timestamp = new Date().toLocaleString();

    let message = `🚨 *Hyperliquid Funding Rate Alert*\n`;
    message += `📅 ${timestamp}\n\n`;
    message += `📊 *Coins matching criteria:*\n\n`;

    // Sort by volume descending for display
    const sortedCoins = [...filteredCoins].sort((a, b) => b.volume - a.volume);

    for (const coin of sortedCoins) {
      const fundingPercent = (coin.fundingRate * 100).toFixed(4);
      const spreadPercent = (coin.spread * 100).toFixed(4);
      const volumeFormatted = coin.volume.toLocaleString();

      message += `💰 *${coin.coin}*\n`;
      message += `   📈 Funding: ${fundingPercent}%\n`;
      message += `   📊 Spread: ${spreadPercent}%\n`;
      message += `   💵 Volume: $${volumeFormatted}\n`;
      if (coin.dexName) {
        message += `   🏛️ DEX: ${coin.dexName}\n`;
      }
      message += `\n`;
    }

    message += `*Criteria:*\n`;
    message += `• |Funding Rate| > 0.01%\n`;
    message += `• |Funding Rate| > Spread\n`;
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
        ctx.reply('🤖 Hyperliquid Funding Rate Scanner Bot\n\nI will notify you when coins match your funding rate criteria!');
      });

      this.bot.help((ctx) => {
        ctx.reply('📋 *Commands:*\n/start - Start the bot\n/help - Show this help\n\nI automatically send alerts when coins meet the criteria.');
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