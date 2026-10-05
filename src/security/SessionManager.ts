/**
 * SessionManager.ts
 * Implements the approved 5-minute auto-lock security architecture.
 * - Tracks user touch interactions and activity timestamps
 * - Detects background / lock transitions via AppState
 * - Enforces PIN / biometric gate if background duration exceeds threshold
 */

import { AppState, AppStateStatus } from 'react-native';

type SessionLockListener = (isLocked: boolean) => void;

class SessionManager {
  private isLocked = false;
  private lastActiveTimestamp = Date.now();
  private backgroundedTimestamp: number | null = null;
  private autoLockMinutes = 5; // Default 5 minutes
  private listeners: Set<SessionLockListener> = new Set();
  private appStateSubscription: any = null;

  public init(autoLockMinutes = 5): void {
    this.autoLockMinutes = autoLockMinutes;
    this.lastActiveTimestamp = Date.now();

    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
    }

    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange.bind(this)
    );
  }

  public setAutoLockMinutes(minutes: number): void {
    this.autoLockMinutes = Math.max(1, minutes);
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

  public lock(): void {
    if (!this.isLocked) {
      this.isLocked = true;
      this.notifyListeners();
    }
  }

  public unlock(): void {
    this.isLocked = false;
    this.lastActiveTimestamp = Date.now();
    this.backgroundedTimestamp = null;
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
    this.listeners.forEach((listener) => listener(this.isLocked));
  }

  private handleAppStateChange(nextAppState: AppStateStatus): void {
    const now = Date.now();

    if (nextAppState === 'background' || nextAppState === 'inactive') {
      this.backgroundedTimestamp = now;
    } else if (nextAppState === 'active') {
      if (this.backgroundedTimestamp) {
        const elapsedMinutes = (now - this.backgroundedTimestamp) / (1000 * 60);
        if (elapsedMinutes >= this.autoLockMinutes) {
          this.lock();
        }
      }
      this.backgroundedTimestamp = null;
      this.recordUserActivity();
    }
  }

  public destroy(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
    }
    this.listeners.clear();
  }
}

export const sessionManager = new SessionManager();
