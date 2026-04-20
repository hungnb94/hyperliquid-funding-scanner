import { Telegraf, Context } from 'telegraf';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_IDS } from '../config';
import { FilteredCoin } from '../types/hyperliquid';
import { logger } from '../utils/logger';
import { formatScanResults } from '../utils/format';
import {
  initDatabase,
  addSubscriber,
  removeSubscriber,
  getActiveSubscribers,
  isSubscribed,
  getSubscriberCount,
} from '../db/subscriber-db';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface SubscribedUser {
  id: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  subscribedAt: string;
}

export type ScanCallback = () => Promise<{
  success: boolean;
  coinsFound: number;
  message: string;
  coins?: FilteredCoin[];
}>;

export class TelegramBotServiceEnhanced {
  private bot: Telegraf | null = null;
  private subscribedUsers: Array<{
    id: number;
    username?: string;
    firstName?: string;
    lastName?: string;
    subscribedAt: string;
  }> = [];
  private scanCallback: ScanCallback | null = null;

  constructor(scanCallback?: ScanCallback) {
    this.scanCallback = scanCallback || null;

    if (!TELEGRAM_BOT_TOKEN) {
      logger.warn('TELEGRAM_BOT_TOKEN not configured, Telegram notifications disabled');
      return;
    }

    try {
      this.bot = new Telegraf(TELEGRAM_BOT_TOKEN);
      this.setupCommandHandlers();
      logger.info('Telegram bot initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Telegram bot:', error);
    }
  }

  setScanCallback(callback: ScanCallback): void {
    this.scanCallback = callback;
  }

  private async loadSubscribedUsers(): Promise<void> {
    try {
      this.subscribedUsers = getActiveSubscribers();
      logger.info(`Loaded ${this.subscribedUsers.length} subscribed users from database`);
    } catch (error) {
      logger.error('Failed to load subscribed users:', error);
      this.subscribedUsers = [];
    }
  }

  private getAllChatIds(): string[] {
    const chatIds = new Set<string>();

    // Add users from environment variable (backward compatibility)
    TELEGRAM_CHAT_IDS.forEach(id => chatIds.add(id));

    // Add dynamically subscribed users
    this.subscribedUsers.forEach(user => chatIds.add(user.id.toString()));

    return Array.from(chatIds);
  }

  private setupCommandHandlers(): void {
    if (!this.bot) return;

    // Start command
    this.bot.start(async (ctx) => {
      const user = ctx.from;
      const welcomeMessage = `🤖 <b>Hyperliquid Funding Rate Scanner Bot</b>\n\n` +
        `I monitor funding rates on Hyperliquid and notify you when coins match criteria:\n` +
        `• |Funding Rate| > 0.01%\n` +
        `• 24h Volume > $1M\n` +
        `• |Funding Rate| > 0.2 * Spread\n\n` +
        `<b>Commands:</b>\n` +
        `/subscribe - Subscribe to alerts\n` +
        `/unsubscribe - Unsubscribe from alerts\n` +
        `/scan - Run manual scan\n` +
        `/status - Check scanner status\n` +
        `/help - Show help`;

      await ctx.reply(welcomeMessage, { parse_mode: 'HTML' });
    });

    // Help command
    this.bot.help(async (ctx) => {
      const helpMessage = `📋 <b>Available Commands</b>\n\n` +
        `/subscribe - Subscribe to funding rate alerts\n` +
        `/unsubscribe - Unsubscribe from alerts\n` +
        `/scan - Run manual scan and show results\n` +
        `/status - Check scanner status and user count\n` +
        `/help - Show this help message\n\n` +
        `<b>Alert Criteria:</b>\n` +
        `• |Funding Rate| > 0.01%\n` +
        `• 24h Volume > $1,000,000\n` +
        `• |Funding Rate| > 0.2 * Spread\n\n` +
        `Scans run automatically every hour.`;

      await ctx.reply(helpMessage, { parse_mode: 'HTML' });
    });

    // Subscribe command
    this.bot.command('subscribe', async (ctx) => {
      const user = ctx.from;
      if (!user) {
        await ctx.reply('Unable to identify user.');
        return;
      }

      if (isSubscribed(user.id)) {
        await ctx.reply('✅ You are already subscribed to alerts.');
        return;
      }

      const newUser = {
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        subscribedAt: new Date().toISOString(),
      };

      addSubscriber(newUser);
      this.subscribedUsers = getActiveSubscribers();

      await ctx.reply(
        '✅ Successfully subscribed to funding rate alerts!\n\n' +
        'You will receive notifications when the scanner finds coins matching the criteria.',
        { parse_mode: 'HTML' }
      );

      logger.info(`User ${user.id} (${user.username || 'no username'}) subscribed`);
    });

    // Unsubscribe command
    this.bot.command('unsubscribe', async (ctx) => {
      const user = ctx.from;
      if (!user) {
        await ctx.reply('Unable to identify user.');
        return;
      }

      const removed = removeSubscriber(user.id);

      if (removed) {
        this.subscribedUsers = getActiveSubscribers();
        await ctx.reply('✅ Successfully unsubscribed from alerts.');
        logger.info(`User ${user.id} unsubscribed`);
      } else {
        await ctx.reply('You are not currently subscribed.');
      }
    });

    // Scan command
    this.bot.command('scan', async (ctx) => {
      await ctx.reply('🔍 Running manual scan...');

      if (!this.scanCallback) {
        await ctx.reply('⚠️ Scanner not available. Please try again later.');
        return;
      }

      try {
        const result = await this.scanCallback();
        
        let replyMessage: string;
        if (result.success) {
          if (result.coins && result.coins.length > 0) {
            // Use the new formatting function for detailed coin list
            replyMessage = `✅ ${result.message}\n\n${formatScanResults(result.coins)}`;
          } else {
            // Fallback to original message if no coins array
            replyMessage = `✅ ${result.message}`;
          }
        } else {
          replyMessage = `❌ ${result.message}`;
        }
        
        await ctx.reply(replyMessage, { parse_mode: 'HTML' });
      } catch (error: any) {
        logger.error('Error during manual scan from /scan command:', error);
        await ctx.reply(`❌ Scan failed: ${error.message}`);
      }
    });

    // Status command
    this.bot.command('status', async (ctx) => {
      const totalUsers = this.getAllChatIds().length;
      const subscribedCount = this.subscribedUsers.length;
      const envUsersCount = TELEGRAM_CHAT_IDS.length;

      const statusMessage = `📊 <b>Scanner Status</b>\n\n` +
        `<b>Users:</b> ${totalUsers} total\n` +
        `• ${subscribedCount} dynamically subscribed\n` +
        `• ${envUsersCount} from environment configuration\n\n` +
        `<b>Alert Criteria:</b>\n` +
        `• |Funding Rate| > 0.01%\n` +
        `• Volume > $1M\n` +
        `• |Funding Rate| > 0.2 * Spread\n\n` +
        `Scans run automatically every hour.`;

      await ctx.reply(statusMessage, { parse_mode: 'HTML' });
    });
  }

  async sendFundingAlert(filteredCoins: FilteredCoin[]): Promise<void> {
    if (!this.bot) {
      logger.debug('Telegram bot not configured, skipping notification');
      return;
    }

    if (filteredCoins.length === 0) {
      logger.debug('No coins to notify about');
      return;
    }

    const message = this.formatFundingAlertMessage(filteredCoins);
    const chatIds = this.getAllChatIds();

    if (chatIds.length === 0) {
      logger.debug('No chat IDs configured, skipping notification');
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const chatId of chatIds) {
      try {
        await this.bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
        successCount++;
        logger.debug(`Sent funding alert to chat ${chatId}`);
      } catch (error: any) {
        failCount++;
        logger.error(`Failed to send message to chat ${chatId}:`, error.message);

        // If user blocked bot or chat doesn't exist, remove them
        if (error.response?.error_code === 403 || error.response?.error_code === 400) {
          logger.warn(`Removing invalid chat ID ${chatId} from subscriptions`);
          removeSubscriber(parseInt(chatId, 10));
          this.subscribedUsers = getActiveSubscribers();
        }
      }
    }

    logger.info(`Sent funding alerts: ${successCount} successful, ${failCount} failed`);
  }

  private formatFundingAlertMessage(filteredCoins: FilteredCoin[]): string {
    const timestamp = new Date().toLocaleString();

    let message = `🚨 <b>Hyperliquid Funding Rate Alert</b>\n`;
    message += `📅 ${timestamp}\n\n`;
    message += `📊 <b>Coins matching criteria:</b>\n\n`;

    // Sort by volume descending for display
    const sortedCoins = [...filteredCoins].sort((a, b) => b.volume - a.volume);

    for (const coin of sortedCoins.slice(0, 10)) { // Limit to 10 coins
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

    if (sortedCoins.length > 10) {
      message += `... and ${sortedCoins.length - 10} more.\n\n`;
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
      // Initialize database before loading users
      initDatabase();

      // Load subscribed users before starting
      await this.loadSubscribedUsers();

      // Register bot menu commands
      await this.setupBotMenu();

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

  getSubscribedUserCount(): number {
    return this.subscribedUsers.length;
  }

  private async setupBotMenu(): Promise<void> {
    if (!this.bot) return;

    try {
      await this.bot.telegram.setMyCommands([
        { command: 'start', description: 'Start the bot and show welcome message' },
        { command: 'subscribe', description: 'Subscribe to funding rate alerts' },
        { command: 'unsubscribe', description: 'Unsubscribe from alerts' },
        { command: 'scan', description: 'Run manual scan and show detailed results' },
        { command: 'status', description: 'Check scanner status and user count' },
        { command: 'help', description: 'Show help message' },
      ]);
      logger.info('Bot menu commands registered');
    } catch (error) {
      logger.error('Failed to set bot menu commands:', error);
    }
  }

  getTotalChatCount(): number {
    return this.getAllChatIds().length;
  }
}
