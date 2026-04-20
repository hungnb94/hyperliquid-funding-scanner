/**
 * Unit tests for database.ts
 * Uses :memory: SQLite database for isolation.
 * The database module is a singleton - we reset it between tests via closeDatabase().
 */

import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

// MUST use string literal directly in factory (vi.mock is hoisted, can't reference outer vars)
vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>();
  return {
    ...actual,
    APP_DB_PATH: ':memory:',
  };
});

// Import after mock is set up
import {
  initDatabase,
  addSubscriber,
  removeSubscriber,
  getActiveSubscribers,
  isSubscribed,
  getSubscriberCount,
  closeDatabase,
  getDatabase,
} from './database';

describe('database.ts', () => {
  // Reset singleton before each test
  beforeEach(() => {
    closeDatabase(); // Reset singleton state
  });

  afterEach(() => {
    closeDatabase(); // Clean up after each test
  });

  describe('initDatabase()', () => {
    it('creates users table on first init', () => {
      initDatabase();
      const db = getDatabase();
      expect(db).not.toBeNull();

      const table = db!.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
      expect(table).toBeDefined();
    });

    it('is idempotent - calling twice does not throw', () => {
      initDatabase();
      expect(() => initDatabase()).not.toThrow();
    });

    it('creates idx_users_id index', () => {
      initDatabase();
      const db = getDatabase();
      const index = db!.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_users_id'").get();
      expect(index).toBeDefined();
    });
  });

  describe('addSubscriber()', () => {
    beforeEach(() => initDatabase());

    it('inserts a new subscriber', () => {
      addSubscriber({
        id: 12345,
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        subscribedAt: '2024-01-01T00:00:00.000Z',
      });

      const subscribers = getActiveSubscribers();
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]!.id).toBe(12345);
      expect(subscribers[0]!.username).toBe('testuser');
    });

    it('upserts on conflict - updates existing subscriber', () => {
      // Add first time
      addSubscriber({
        id: 99999,
        username: 'oldname',
        subscribedAt: '2024-01-01T00:00:00.000Z',
      });

      // Add again with different username - should update
      addSubscriber({
        id: 99999,
        username: 'newname',
        subscribedAt: '2024-01-02T00:00:00.000Z',
      });

      const subscribers = getActiveSubscribers();
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]!.username).toBe('newname');
    });

    it('handles optional fields (username, firstName, lastName)', () => {
      addSubscriber({
        id: 11111,
        subscribedAt: '2024-01-01T00:00:00.000Z',
      });

      const subscribers = getActiveSubscribers();
      expect(subscribers[0]!.username).toBeUndefined();
      expect(subscribers[0]!.firstName).toBeUndefined();
      expect(subscribers[0]!.lastName).toBeUndefined();
    });
  });

  describe('removeSubscriber()', () => {
    beforeEach(() => initDatabase());

    it('soft deletes by setting unsubscribed_at', () => {
      addSubscriber({
        id: 22222,
        username: 'todelete',
        subscribedAt: '2024-01-01T00:00:00.000Z',
      });

      const removed = removeSubscriber(22222);
      expect(removed).toBe(true);

      // Should not appear in active subscribers
      const active = getActiveSubscribers();
      expect(active).toHaveLength(0);
    });

    it('returns false if subscriber not found', () => {
      const removed = removeSubscriber(999999);
      expect(removed).toBe(false);
    });

    it('returns false if already unsubscribed', () => {
      addSubscriber({
        id: 33333,
        subscribedAt: '2024-01-01T00:00:00.000Z',
      });

      removeSubscriber(33333);
      const removed2 = removeSubscriber(33333);
      expect(removed2).toBe(false);
    });
  });

  describe('getActiveSubscribers()', () => {
    beforeEach(() => initDatabase());

    it('returns only active (non-unsubscribed) subscribers', () => {
      addSubscriber({ id: 1, subscribedAt: '2024-01-01T00:00:00.000Z' });
      addSubscriber({ id: 2, subscribedAt: '2024-01-01T00:00:00.000Z' });
      addSubscriber({ id: 3, subscribedAt: '2024-01-01T00:00:00.000Z' });

      removeSubscriber(2);

      const active = getActiveSubscribers();
      expect(active).toHaveLength(2);
      expect(active.map(s => s.id)).toContain(1);
      expect(active.map(s => s.id)).toContain(3);
    });

    it('returns empty array when no subscribers', () => {
      const active = getActiveSubscribers();
      expect(active).toHaveLength(0);
    });
  });

  describe('isSubscribed()', () => {
    beforeEach(() => initDatabase());

    it('returns true for active subscriber', () => {
      addSubscriber({ id: 44444, subscribedAt: '2024-01-01T00:00:00.000Z' });
      expect(isSubscribed(44444)).toBe(true);
    });

    it('returns false for unsubscribed user', () => {
      addSubscriber({ id: 55555, subscribedAt: '2024-01-01T00:00:00.000Z' });
      removeSubscriber(55555);
      expect(isSubscribed(55555)).toBe(false);
    });

    it('returns false for non-existent user', () => {
      expect(isSubscribed(999999)).toBe(false);
    });
  });

  describe('getSubscriberCount()', () => {
    beforeEach(() => initDatabase());

    it('returns 0 when no subscribers', () => {
      expect(getSubscriberCount()).toBe(0);
    });

    it('returns correct count of active subscribers', () => {
      addSubscriber({ id: 1, subscribedAt: '2024-01-01T00:00:00.000Z' });
      addSubscriber({ id: 2, subscribedAt: '2024-01-01T00:00:00.000Z' });
      addSubscriber({ id: 3, subscribedAt: '2024-01-01T00:00:00.000Z' });

      expect(getSubscriberCount()).toBe(3);

      removeSubscriber(2);
      expect(getSubscriberCount()).toBe(2);
    });
  });

  describe('closeDatabase()', () => {
    it('can be called safely when database is not initialized', () => {
      expect(() => closeDatabase()).not.toThrow();
    });

    it('resets singleton - can reinit after close', () => {
      initDatabase();
      expect(getDatabase()).not.toBeNull();

      closeDatabase();
      // After close, initDatabase should work again
      initDatabase();
      expect(getDatabase()).not.toBeNull();
    });
  });

  describe('error handling', () => {
    it('throws if addSubscriber called before initDatabase', () => {
      expect(() => addSubscriber({ id: 1, subscribedAt: '2024-01-01T00:00:00.000Z' })).toThrow('Database not initialized');
    });

    it('throws if getActiveSubscribers called before initDatabase', () => {
      expect(() => getActiveSubscribers()).toThrow('Database not initialized');
    });

    it('throws if isSubscribed called before initDatabase', () => {
      expect(() => isSubscribed(1)).toThrow('Database not initialized');
    });

    it('throws if getSubscriberCount called before initDatabase', () => {
      expect(() => getSubscriberCount()).toThrow('Database not initialized');
    });

    it('throws if removeSubscriber called before initDatabase', () => {
      expect(() => removeSubscriber(1)).toThrow('Database not initialized');
    });
  });
});
