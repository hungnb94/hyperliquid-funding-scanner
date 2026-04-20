import { FilteredCoin } from '../types/hyperliquid';

/**
 * Format filtered coins into a Telegram message.
 * 
 * @param coins Array of filtered coins
 * @returns HTML-formatted message ready for Telegram
 */
export function formatScanResults(coins: FilteredCoin[]): string {
  if (coins.length === 0) {
    return '✅ No coins matching criteria found.';
  }

  const sortedCoins = [...coins].sort((a, b) => b.volume - a.volume);

  let message = '';
  for (const coin of sortedCoins) {
    const fundingPercent = (coin.fundingRate * 100).toFixed(4);
    const spreadPercent = (coin.spread * 100).toFixed(4);
    const volumeFormatted = coin.volume.toLocaleString();

    const displayName = coin.dexName ? `${coin.dexName}:${coin.coin}` : coin.coin;
    message += `💰 <b>${displayName}</b>\n`;
    message += `   📈 Funding: ${fundingPercent}%\n`;
    message += `   📊 Spread: ${spreadPercent}%\n`;
    message += `   💵 Volume: $${volumeFormatted}\n\n`;
  }

  return message.trimEnd();
}

// Optional: export helper for escaping HTML if needed
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}