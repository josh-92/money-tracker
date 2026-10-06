/**
 * SessionManager.ts
 * Implements the approved auto-lock security architecture across Android app lifecycle.
 * - Tracks user touch interactions and activity timestamps
 * - Detects background / lock transitions via AppState without relying on suspended JS timers
 * - Calculates elapsed time upon return to foreground against user-configured timeout
 * - Persists background timestamp and lock state for relaunch / process restart survival
 * - Enforces PIN / biometric gate if background duration exceeds threshold
 */

import type { AppStateStatus } from 'react-native';

export type SessionLockListener = (isLocked: boolean) => void;

export const SESSION_BACKGROUND_TIMESTAMP_KEY = 'money_tracker_session_bg_timestamp';
export const SESSION_LOCK_STATE_KEY = 'money_tracker_session_is_locked';
export const SESSION_AUTOLOCK_MINUTES_KEY = 'money_tracker_session_autolock_minutes';

export interface ISessionStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface IAppStateAdapter {
  currentState: AppStateStatus;
  addEventListener(type: string, listener: (state: AppStateStatus) => void): { remove: () => void };
}

let defaultStorage: ISessionStorage = {
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
};

let defaultAppState: IAppStateAdapter = {
  currentState: 'active',
  addEventListener: () => ({ remove: () => {} }),
};

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RN = require('react-native');
  if (RN && RN.AppState) {
    defaultAppState = RN.AppState;
  }
} catch {
  // Test/Node runner fallback
}

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ExpoSecureStore = require('expo-secure-store');
  if (ExpoSecureStore) {
    defaultStorage = ExpoSecureStore;
  }
} catch {
  // Test/Node runner fallback
}

export class SessionManager {
  private isLocked = false;
  private lastActiveTimestamp = Date.now();
  private backgroundedTimestamp: number | null = null;
  private autoLockMinutes = 5; // Default 5 minutes
  private previousAppState: AppStateStatus;
  private listeners: Set<SessionLockListener> = new Set();
  private appStateSubscription: any = null;
  private isInitialized = false;
  private storage: ISessionStorage;
  private appState: IAppStateAdapter;

  constructor(storage = defaultStorage, appState = defaultAppState) {
    this.storage = storage;
    this.appState = appState;
    this.previousAppState = appState.currentState || 'active';
  }

  /**
   * Initializes the SessionManager with configurable timeout.
   * Restores persisted state across cold boots and app restarts.
   */
  public async init(defaultMinutes = 5): Promise<void> {
    this.autoLockMinutes = defaultMinutes;
    this.lastActiveTimestamp = Date.now();
    this.previousAppState = this.appState.currentState || 'active';

    // Restore persisted settings and state asynchronously
    try {
      const [savedMinutes, savedBgTime, savedLocked] = await Promise.all([
        this.storage.getItemAsync(SESSION_AUTOLOCK_MINUTES_KEY).catch(() => null),
        this.storage.getItemAsync(SESSION_BACKGROUND_TIMESTAMP_KEY).catch(() => null),
        this.storage.getItemAsync(SESSION_LOCK_STATE_KEY).catch(() => null),
      ]);

      if (savedMinutes) {
        const parsedMins = parseInt(savedMinutes, 10);
        if (!isNaN(parsedMins) && parsedMins > 0) {
          this.autoLockMinutes = parsedMins;
        }
      }

      if (savedLocked === 'true') {
        this.isLocked = true;
      }

      if (savedBgTime) {
        const bgTime = parseInt(savedBgTime, 10);
        if (!isNaN(bgTime) && bgTime > 0) {
          this.backgroundedTimestamp = bgTime;
          // Check if elapsed time while suspended/closed exceeded timeout
          const elapsedMs = Date.now() - bgTime;
          const timeoutMs = this.autoLockMinutes * 60 * 1000;
          if (elapsedMs >= timeoutMs) {
            this.isLocked = true;
          }
        }
      }
    } catch {
      // Storage may fail in test environments, fallback to memory
    }

    // Attach AppState listener only once
    if (!this.appStateSubscription) {
      this.appStateSubscription = this.appState.addEventListener(
        'change',
        this.handleAppStateChange.bind(this)
      );
    }

    this.isInitialized = true;
    this.notifyListeners();
  }

  public setAutoLockMinutes(minutes: number): void {
    this.autoLockMinutes = Math.max(1, minutes);
    this.storage.setItemAsync(SESSION_AUTOLOCK_MINUTES_KEY, String(this.autoLockMinutes)).catch(() => {});
  }

  public getAutoLockMinutes(): number {
    return this.autoLockMinutes;
  }

  public getBackgroundedTimestamp(): number | null {
    return this.backgroundedTimestamp;
  }

  public getLastActiveTimestamp(): number {
    return this.lastActiveTimestamp;
  }

  /**
   * Resets the active timer on user interaction (touch, scroll, navigation).
   */
  public recordUserActivity(): void {
    if (!this.isLocked) {
      this.lastActiveTimestamp = Date.now();
    }
  }

  public getIsLocked(): boolean {
    return this.isLocked;
  }

  /**
   * Immediately locks the app and persists lock state.
   */
  public lock(): void {
    if (!this.isLocked) {
      this.isLocked = true;
      this.storage.setItemAsync(SESSION_LOCK_STATE_KEY, 'true').catch(() => {});
      this.notifyListeners();
    }
  }

  /**
   * Unlocks the app and resets the auto-lock lifecycle state.
   */
  public unlock(): void {
    this.isLocked = false;
    this.lastActiveTimestamp = Date.now();
    this.backgroundedTimestamp = null;
    this.storage.deleteItemAsync(SESSION_LOCK_STATE_KEY).catch(() => {});
    this.storage.deleteItemAsync(SESSION_BACKGROUND_TIMESTAMP_KEY).catch(() => {});
    this.notifyListeners();
  }

  public subscribe(listener: SessionLockListener): () => void {
    this.listeners.add(listener);
    listener(this.isLocked);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.isLocked);
      } catch (err) {
        console.error('Session lock listener error:', err);
      }
    });
  }

  /**
   * Handles React Native AppState lifecycle transitions safely.
   * Guards against Android's rapid 'background' -> 'inactive' -> 'active' bounce.
   */
  public handleAppStateChange(nextAppState: AppStateStatus): void {
    const now = Date.now();
    const wasActive = this.previousAppState === 'active';
    const isNowInactiveOrBackground = nextAppState === 'background' || nextAppState === 'inactive';

    // 1. Leaving foreground: Record timestamp ONLY when transitioning out of 'active'
    if (wasActive && isNowInactiveOrBackground) {
      this.backgroundedTimestamp = now;
      this.storage.setItemAsync(SESSION_BACKGROUND_TIMESTAMP_KEY, String(now)).catch(() => {});
    }

    // 2. Returning to foreground: Calculate elapsed time and evaluate auto-lock
    const wasInactiveOrBackground =
      this.previousAppState === 'background' || this.previousAppState === 'inactive';
    if (wasInactiveOrBackground && nextAppState === 'active') {
      this.checkAndApplyAutoLock(now);
    }

    this.previousAppState = nextAppState;
  }

  /**
   * Deterministic evaluation of auto-lock elapsed time upon returning to active.
   * Can be invoked with simulated 'now' timestamps for rigorous automated testing.
   */
  public checkAndApplyAutoLock(now = Date.now()): boolean {
    if (this.backgroundedTimestamp !== null) {
      const elapsedMs = now - this.backgroundedTimestamp;
      const timeoutMs = this.autoLockMinutes * 60 * 1000;

      if (elapsedMs >= timeoutMs) {
        this.lock();
        return true;
      } else {
        // Returned before timeout: remain unlocked and clear background timestamp
        this.backgroundedTimestamp = null;
        this.storage.deleteItemAsync(SESSION_BACKGROUND_TIMESTAMP_KEY).catch(() => {});
        this.recordUserActivity();
        return false;
      }
    } else {
      this.recordUserActivity();
      return false;
    }
  }

  /**
   * Sets manual background timestamp (used by unit tests and lifecycle simulators).
   */
  public setBackgroundedTimestampForTesting(ts: number | null): void {
    this.backgroundedTimestamp = ts;
  }

  public setPreviousAppStateForTesting(state: AppStateStatus): void {
    this.previousAppState = state;
  }

  public destroy(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    this.listeners.clear();
    this.isInitialized = false;
  }
}

export const sessionManager = new SessionManager();
