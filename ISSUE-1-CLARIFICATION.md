# Issue #1 Clarification: Create telegram bot auto notify user

## Current Implementation Status

The codebase already has a `TelegramBotService` (`src/services/telegram-bot.ts`) that:

1. **Sends alerts** when scanner finds coins matching criteria:
   - |Funding Rate| > 0.01% (0.0001)
   - 24h Volume > $1,000,000
   - |Funding Rate| > Spread
2. **Basic bot commands**: `/start`, `/help`
3. **Configuration**: Chat IDs via `TELEGRAM_CHAT_IDS` environment variable (comma-separated)
4. **Integration**: Called from `FundingScanner.scanAndFilterAllCoins()`

## Questions for Clarification

### 1. User Registration & Management
- **Option A**: Keep current static configuration (`TELEGRAM_CHAT_IDS` in .env)
- **Option B**: Dynamic registration via bot commands (`/subscribe`, `/unsubscribe`)
- **Option C**: Hybrid - static admin users + dynamic regular users

### 2. Required Bot Commands
What additional commands are needed beyond `/start` and `/help`?
- `/scan` - Run manual scan and show results
- `/status` - Check scanner status (last scan time, active users, etc.)
- `/subscribe` - Subscribe to alerts
- `/unsubscribe` - Unsubscribe from alerts  
- `/thresholds` - View current alert thresholds
- `/latest` - Show latest scan results
- `/config` - Configure user-specific settings (if supported)

### 3. Alert Logic & Frequency
- **When to send alerts?**
  - Every scan when coins match criteria (current)
  - Only when new coins appear (not in previous scan)
  - Only when funding rate changes by X%
  - Only during market hours?
- **Alert format**: Current format includes all matching coins. Should we limit to top N coins?
- **Duplicate prevention**: Minimum time between alerts for same coin?

### 4. User-Specific Configuration
Should users be able to customize:
- Thresholds (funding rate %, volume $)
- Which dexes to monitor
- Alert frequency
- Notification style (compact/full)

### 5. Data Persistence
- **User preferences**: File (JSON), database, or in-memory only?
- **Alert history**: Store sent alerts to prevent duplicates?
- **State across restarts**: Should survive process restart?

### 6. Error Handling & Monitoring
- Bot crash recovery
- Failed message retry logic
- Rate limiting (Telegram API limits)
- Health checks / status reporting

## Proposed Implementation Phases

### Phase 1: Basic Enhancement (MVP)
- Add `/subscribe`/`/unsubscribe` commands with file-based storage
- Add `/scan` command for manual trigger
- Add `/status` command
- Maintain backward compatibility with `TELEGRAM_CHAT_IDS`

### Phase 2: User Preferences
- User-specific threshold configuration
- Per-user dex filters
- Alert frequency controls

### Phase 3: Advanced Features
- Web dashboard for configuration
- Multiple notification channels (optional)
- Historical data access

## Technical Considerations

### Storage Options
1. **JSON file**: `data/users.json` - simple, no dependencies
2. **SQLite**: `data/bot.db` - more structured, query support
3. **In-memory only**: Lost on restart, simplest

### Dependencies
Current: `telegraf` (Telegram bot framework)
May need: Additional storage library if using database

### Configuration Changes
Need to update `.env.example` and README with new bot setup instructions.

## Acceptance Criteria Proposal

- [ ] Users can subscribe/unsubscribe via Telegram commands
- [ ] Subscribed users receive alerts when scanner finds matching coins
- [ ] Basic commands: `/start`, `/help`, `/subscribe`, `/unsubscribe`, `/scan`, `/status`
- [ ] User list persists across bot restarts
- [ ] Backward compatibility with `TELEGRAM_CHAT_IDS` env variable
- [ ] Error handling for failed messages
- [ ] Logging of bot activities
- [ ] Graceful shutdown handling

## Next Steps

1. **Clarify requirements** for each question above
2. **Choose implementation approach** (Phase 1, 2, or 3)
3. **Update issue description** with agreed requirements
4. **Implement and test**

---

*Last updated: 2026-04-19*  
*For discussion on GitHub issue #1*