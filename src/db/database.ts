import Database, { Statement } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';
import { APP_DB_PATH } from '../config';

interface Subscriber {
  id: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  subscribedAt: string;
  unsubscribedAt?: string;
}

let db: Database.Database | null = null;

// Cached prepared statements
let stmtAddSubscriber: Statement<[number, string | null, string | null, string | null, string]> | null = null;
let stmtRemoveSubscriber: Statement<[string, number]> | null = null;
let stmtGetActiveSubscribers: Statement | null = null;
let stmtIsSubscribed: Statement<[number]> | null = null;
let stmtGetSubscriberCount: Statement | null = null;

function getDbPath(): string {
  return APP_DB_PATH;
}

function openDatabase(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);

  // Best practice pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');

  // Initialize cached statements
  initializeStatements(db);

  return db;
}

function initializeStatements(database: Database.Database): void {
  stmtAddSubscriber = database.prepare(`
    INSERT INTO users (id, username, first_name, last_name, subscribed_at, unsubscribed_at)
    VALUES (?, ?, ?, ?, ?, NULL)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      subscribed_at = excluded.subscribed_at,
      unsubscribed_at = NULL
  `);

  stmtRemoveSubscriber = database.prepare(`
    UPDATE users
    SET unsubscribed_at = ?
    WHERE id = ? AND unsubscribed_at IS NULL
  `);

  stmtGetActiveSubscribers = database.prepare(`
    SELECT id, username, first_name, last_name, subscribed_at, unsubscribed_at
    FROM users
    WHERE unsubscribed_at IS NULL
  `);

  stmtIsSubscribed = database.prepare(`
    SELECT 1 FROM users
    WHERE id = ? AND unsubscribed_at IS NULL
    LIMIT 1
  `);

  stmtGetSubscriberCount = database.prepare(`
    SELECT COUNT(*) as count FROM users
    WHERE unsubscribed_at IS NULL
  `);
}

function initDatabaseTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      subscribed_at TEXT NOT NULL,
      unsubscribed_at TEXT
    )
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_id ON users(id)
  `);

  // Reset cached statements after table creation
  initializeStatements(database);
}

export function initDatabase(): void {
  const database = openDatabase();
  initDatabaseTables(database);
  logger.info('Database initialized successfully');
}

function handleCorruption(): void {
  if (!db) return;

  const dbPath = getDbPath();
  const backupPath = `${dbPath}.bak.${Date.now()}`;

  try {
    db.close();
    db = null;
    stmtAddSubscriber = null;
    stmtRemoveSubscriber = null;
    stmtGetActiveSubscribers = null;
    stmtIsSubscribed = null;
    stmtGetSubscriberCount = null;

    if (fs.existsSync(dbPath)) {
      fs.renameSync(dbPath, backupPath);
      logger.warn(`Database corrupted, backed up to ${backupPath}`);
    }

    // Re-open with fresh database, reinitialize tables
    const freshDb = openDatabase();
    initDatabaseTables(freshDb);
  } catch (error) {
    logger.error('Failed to handle database corruption:', error);
    throw error;
  }
}

export function addSubscriber(subscriber: Subscriber): void {
  if (!stmtAddSubscriber) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }

  try {
    stmtAddSubscriber.run(
      subscriber.id,
      subscriber.username ?? null,
      subscriber.firstName ?? null,
      subscriber.lastName ?? null,
      subscriber.subscribedAt
    );
    logger.debug(`Subscriber ${subscriber.id} added/updated`);
  } catch (error: unknown) {
    logger.error('Failed to add subscriber:', error);
    handleCorruption();
    throw error;
  }
}

export function removeSubscriber(chatId: number): boolean {
  if (!stmtRemoveSubscriber) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }

  try {
    const result = stmtRemoveSubscriber.run(new Date().toISOString(), chatId);

    if (result.changes > 0) {
      logger.debug(`Subscriber ${chatId} marked as unsubscribed`);
      return true;
    }
    return false;
  } catch (error: unknown) {
    logger.error('Failed to remove subscriber:', error);
    handleCorruption();
    throw error;
  }
}

export function getActiveSubscribers(): Subscriber[] {
  if (!stmtGetActiveSubscribers) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }

  try {
    const rows = stmtGetActiveSubscribers.all() as Array<{
      id: number;
      username: string | null;
      first_name: string | null;
      last_name: string | null;
      subscribed_at: string;
      unsubscribed_at: string | null;
    }>;

    return rows.map(row => ({
      id: row.id,
      username: row.username ?? undefined,
      firstName: row.first_name ?? undefined,
      lastName: row.last_name ?? undefined,
      subscribedAt: row.subscribed_at,
      unsubscribedAt: row.unsubscribed_at ?? undefined,
    }));
  } catch (error: unknown) {
    logger.error('Failed to get active subscribers:', error);
    handleCorruption();
    throw error;
  }
}

export function isSubscribed(chatId: number): boolean {
  if (!stmtIsSubscribed) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }

  try {
    const row = stmtIsSubscribed.get(chatId);
    return row !== undefined;
  } catch (error: unknown) {
    logger.error('Failed to check subscription:', error);
    handleCorruption();
    throw error;
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    stmtAddSubscriber = null;
    stmtRemoveSubscriber = null;
    stmtGetActiveSubscribers = null;
    stmtIsSubscribed = null;
    stmtGetSubscriberCount = null;
    logger.info('Database connection closed');
  }
}

export function getSubscriberCount(): number {
  if (!stmtGetSubscriberCount) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }

  try {
    const row = stmtGetSubscriberCount.get() as { count: number };
    return row.count;
  } catch (error: unknown) {
    logger.error('Failed to get subscriber count:', error);
    handleCorruption();
    throw error;
  }
}

export function getDatabase(): Database.Database | null {
  return db;
}

/**
 * Transaction wrapper for batch operations
 */
export function runInTransaction<T>(fn: () => T): T {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }

  return db.transaction(fn)();
}
