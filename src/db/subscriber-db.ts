import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

interface Subscriber {
  id: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  subscribedAt: string;
  unsubscribedAt?: string;
}

let db: Database.Database | null = null;

function getDbPath(): string {
  return path.join(process.cwd(), 'data', 'subscribers.db');
}

function openDatabase(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  return db;
}

export function initDatabase(): void {
  const database = openDatabase();

  database.exec(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      subscribed_at TEXT NOT NULL,
      unsubscribed_at TEXT
    )
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_subscribers_id ON subscribers(id);
  `);

  logger.info('Database initialized successfully');
}

function handleCorruption(): void {
  if (!db) return;

  const dbPath = getDbPath();
  const backupPath = `${dbPath}.bak`;

  try {
    db.close();
    db = null;

    if (fs.existsSync(dbPath)) {
      fs.renameSync(dbPath, backupPath);
      logger.warn(`Database corrupted, backed up to ${backupPath}`);
    }

    initDatabase();
  } catch (error) {
    logger.error('Failed to handle database corruption:', error);
    throw error;
  }
}

export function addSubscriber(subscriber: Subscriber): void {
  try {
    const database = openDatabase();

    const stmt = database.prepare(`
      INSERT INTO subscribers (id, username, first_name, last_name, subscribed_at, unsubscribed_at)
      VALUES (?, ?, ?, ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        subscribed_at = excluded.subscribed_at,
        unsubscribed_at = NULL
    `);

    stmt.run(
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
  try {
    const database = openDatabase();

    const stmt = database.prepare(`
      UPDATE subscribers
      SET unsubscribed_at = ?
      WHERE id = ? AND unsubscribed_at IS NULL
    `);

    const result = stmt.run(new Date().toISOString(), chatId);

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
  try {
    const database = openDatabase();

    const stmt = database.prepare(`
      SELECT id, username, first_name, last_name, subscribed_at, unsubscribed_at
      FROM subscribers
      WHERE unsubscribed_at IS NULL
    `);

    const rows = stmt.all() as Array<{
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
    return [];
  }
}

export function isSubscribed(chatId: number): boolean {
  try {
    const database = openDatabase();

    const stmt = database.prepare(`
      SELECT 1 FROM subscribers
      WHERE id = ? AND unsubscribed_at IS NULL
      LIMIT 1
    `);

    const row = stmt.get(chatId);
    return row !== undefined;
  } catch (error: unknown) {
    logger.error('Failed to check subscription:', error);
    handleCorruption();
    return false;
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

export function getSubscriberCount(): number {
  try {
    const database = openDatabase();

    const stmt = database.prepare(`
      SELECT COUNT(*) as count FROM subscribers
      WHERE unsubscribed_at IS NULL
    `);

    const row = stmt.get() as { count: number };
    return row.count;
  } catch (error: unknown) {
    logger.error('Failed to get subscriber count:', error);
    handleCorruption();
    return 0;
  }
}