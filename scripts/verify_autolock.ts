/**
 * verify_autolock.ts
 * Comprehensive automated test suite for Android Auto-Lock lifecycle architecture:
 * 1. Default 5-minute timeout & custom user timeout configuration (1m, 2m, 10m, 15m, 30m).
 * 2. Backgrounding & return before timeout (< timeout) -> remains UNLOCKED.
 * 3. Backgrounding & return at or after timeout (>= timeout) -> immediately LOCKS.
 * 4. Android AppState rapid transition bounce protection ('active' -> 'inactive' -> 'background' -> 'inactive' -> 'active').
 * 5. Immediate manual lock enforcement ('lock()').
 * 6. Successful unlock resets lifecycle state and clears background timestamp.
 * 7. Cold boot / process relaunch restoration from secure storage.
 * 8. Real-time subscriber listener notification guarantees.
 */

import {
  SessionManager,
  ISessionStorage,
  IAppStateAdapter,
  SESSION_AUTOLOCK_MINUTES_KEY,
  SESSION_BACKGROUND_TIMESTAMP_KEY,
  SESSION_LOCK_STATE_KEY,
} from '../src/security/SessionManager';
import type { AppStateStatus } from 'react-native';

console.log('================================================================');
console.log(' MONEY TRACKER: AUTO-LOCK LIFECYCLE & PERSISTENCE TEST SUITE');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
    if (detail !== undefined) {
      console.error('    Details:', typeof detail === 'object' ? JSON.stringify(detail, null, 2) : detail);
    }
  }
}

// In-Memory SecureStore mock
class MockSecureStorage implements ISessionStorage {
  private store: Map<string, string> = new Map();

  async getItemAsync(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async setItemAsync(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async deleteItemAsync(key: string): Promise<void> {
    this.store.delete(key);
  }

  dump() {
    return Object.fromEntries(this.store);
  }

  clear() {
    this.store.clear();
  }
}

// Mock AppState adapter
class MockAppStateAdapter implements IAppStateAdapter {
  public currentState: AppStateStatus = 'active';
  private listeners: Set<(state: AppStateStatus) => void> = new Set();

  addEventListener(type: string, listener: (state: AppStateStatus) => void) {
    this.listeners.add(listener);
    return {
      remove: () => {
        this.listeners.delete(listener);
      },
    };
  }

  emit(nextState: AppStateStatus) {
    this.currentState = nextState;
    this.listeners.forEach((l) => l(nextState));
  }
}

async function runAutoLockTests() {
  // -------------------------------------------------------------
  // Test 1: Default configuration & initialization
  // -------------------------------------------------------------
  console.log('--- 1. Default Timeout & Initialization ---');
  const storage1 = new MockSecureStorage();
  const appState1 = new MockAppStateAdapter();
  const sm1 = new SessionManager(storage1, appState1);

  await sm1.init();
  assert(sm1.getAutoLockMinutes() === 5, 'Default auto-lock timeout is 5 minutes');
  assert(sm1.getIsLocked() === false, 'Freshly initialized session begins unlocked');
  assert(sm1.getBackgroundedTimestamp() === null, 'No background timestamp set on cold start');

  // -------------------------------------------------------------
  // Test 2: Custom Timeout Configuration
  // -------------------------------------------------------------
  console.log('\n--- 2. Custom Timeout Configuration ---');
  sm1.setAutoLockMinutes(10);
  assert(sm1.getAutoLockMinutes() === 10, 'Configured timeout to 10 minutes');
  assert(
    (await storage1.getItemAsync(SESSION_AUTOLOCK_MINUTES_KEY)) === '10',
    'Custom timeout persisted to storage'
  );

  sm1.setAutoLockMinutes(1);
  assert(sm1.getAutoLockMinutes() === 1, 'Configured timeout to 1 minute');

  // Negative / 0 protection
  sm1.setAutoLockMinutes(0);
  assert(sm1.getAutoLockMinutes() === 1, 'Auto-lock timeout enforces minimum 1 minute');

  // -------------------------------------------------------------
  // Test 3: Backgrounding -> Return before timeout (< timeout)
  // -------------------------------------------------------------
  console.log('\n--- 3. Elapsed Time < Timeout: Remains Unlocked ---');
  const storage3 = new MockSecureStorage();
  const appState3 = new MockAppStateAdapter();
  const sm3 = new SessionManager(storage3, appState3);
  await sm3.init(5); // 5 min timeout = 300,000 ms

  const t0 = 1700000000000;
  // App transitions to background
  sm3.handleAppStateChange('background');
  assert(sm3.getBackgroundedTimestamp() !== null, 'Background timestamp recorded when moving to background');

  // Simulate user returning 4 minutes later (240,000 ms elapsed < 300,000 ms)
  const tReturnBefore = sm3.getBackgroundedTimestamp()! + 4 * 60 * 1000;
  const lockedBefore = sm3.checkAndApplyAutoLock(tReturnBefore);

  assert(lockedBefore === false, 'checkAndApplyAutoLock returned false when elapsed < timeout');
  assert(sm3.getIsLocked() === false, 'Session remains unlocked');
  assert(sm3.getBackgroundedTimestamp() === null, 'Background timestamp cleared on successful return');

  // -------------------------------------------------------------
  // Test 4: Backgrounding -> Return at or after timeout (>= timeout)
  // -------------------------------------------------------------
  console.log('\n--- 4. Elapsed Time >= Timeout: Locks Immediately ---');
  const storage4 = new MockSecureStorage();
  const appState4 = new MockAppStateAdapter();
  const sm4 = new SessionManager(storage4, appState4);
  await sm4.init(5); // 5 min timeout

  sm4.handleAppStateChange('background');
  const bgTime4 = sm4.getBackgroundedTimestamp()!;

  // Simulate user returning 5 minutes and 1 second later
  const tReturnAfter = bgTime4 + (5 * 60 + 1) * 1000;
  const lockedAfter = sm4.checkAndApplyAutoLock(tReturnAfter);

  assert(lockedAfter === true, 'checkAndApplyAutoLock returned true when elapsed >= timeout');
  assert(sm4.getIsLocked() === true, 'Session is now locked');
  assert(
    (await storage4.getItemAsync(SESSION_LOCK_STATE_KEY)) === 'true',
    'Lock state persisted to storage'
  );

  // -------------------------------------------------------------
  // Test 5: Exact boundary test (5m 0s)
  // -------------------------------------------------------------
  console.log('\n--- 5. Exact Boundary Test (exactly 5 minutes) ---');
  const storage5 = new MockSecureStorage();
  const appState5 = new MockAppStateAdapter();
  const sm5 = new SessionManager(storage5, appState5);
  await sm5.init(5);

  sm5.handleAppStateChange('background');
  const bgTime5 = sm5.getBackgroundedTimestamp()!;
  const lockedExact = sm5.checkAndApplyAutoLock(bgTime5 + 5 * 60 * 1000);
  assert(lockedExact === true, 'Session locks at exact boundary (>= 5 minutes)');
  assert(sm5.getIsLocked() === true, 'Session locked at exact boundary');

  // -------------------------------------------------------------
  // Test 6: Android AppState Bounce Protection
  // -------------------------------------------------------------
  console.log('\n--- 6. Android AppState Bounce Protection ---');
  // On Android: active -> inactive -> background -> inactive -> active
  const storage6 = new MockSecureStorage();
  const appState6 = new MockAppStateAdapter();
  const sm6 = new SessionManager(storage6, appState6);
  await sm6.init(5);

  // User exits app: active -> inactive
  sm6.handleAppStateChange('inactive');
  const recordedInitialBg = sm6.getBackgroundedTimestamp();
  assert(recordedInitialBg !== null, 'Timestamp recorded upon transitioning out of active');

  // Android then delivers 'background' while already inactive
  sm6.handleAppStateChange('background');
  assert(
    sm6.getBackgroundedTimestamp() === recordedInitialBg,
    'Timestamp NOT overwritten by secondary transition to background'
  );

  // Later user brings app to foreground: background -> inactive -> active
  // Suppose elapsed time is 10 minutes
  const returnTime6 = recordedInitialBg! + 10 * 60 * 1000;
  // First bounce: inactive
  sm6.handleAppStateChange('inactive');
  assert(
    sm6.getBackgroundedTimestamp() === recordedInitialBg,
    'Timestamp NOT overwritten during return inactive bounce'
  );

  // Second bounce: active
  // Mock Date.now for the active trigger
  const originalNow = Date.now;
  try {
    Date.now = () => returnTime6;
    sm6.handleAppStateChange('active');
    assert(sm6.getIsLocked() === true, 'Auto-lock triggered correctly despite Android bounce');
  } finally {
    Date.now = originalNow;
  }

  // -------------------------------------------------------------
  // Test 7: Manual Lockdown
  // -------------------------------------------------------------
  console.log('\n--- 7. Manual Lockdown Enforcement ---');
  const storage7 = new MockSecureStorage();
  const appState7 = new MockAppStateAdapter();
  const sm7 = new SessionManager(storage7, appState7);
  await sm7.init(5);

  assert(sm7.getIsLocked() === false, 'Session initially unlocked');
  sm7.lock();
  assert(sm7.getIsLocked() === true, 'Manual lock immediately sets isLocked = true');
  assert(
    (await storage7.getItemAsync(SESSION_LOCK_STATE_KEY)) === 'true',
    'Manual lock state persisted to storage'
  );

  // -------------------------------------------------------------
  // Test 8: Unlock resets lifecycle state
  // -------------------------------------------------------------
  console.log('\n--- 8. Successful Unlock Reset ---');
  sm7.unlock();
  assert(sm7.getIsLocked() === false, 'Session unlocked after unlock()');
  assert(sm7.getBackgroundedTimestamp() === null, 'Background timestamp reset to null');
  assert(
    (await storage7.getItemAsync(SESSION_LOCK_STATE_KEY)) === null,
    'Lock state key removed from storage'
  );
  assert(
    (await storage7.getItemAsync(SESSION_BACKGROUND_TIMESTAMP_KEY)) === null,
    'Background timestamp key removed from storage'
  );

  // -------------------------------------------------------------
  // Test 9: Cold Boot & App Relaunch Restoration
  // -------------------------------------------------------------
  console.log('\n--- 9. Cold Boot / Process Relaunch Restoration ---');
  const storage9 = new MockSecureStorage();
  // Simulate previous session: was backgrounded 15 minutes ago with 5 min timeout
  const pastTime = Date.now() - 15 * 60 * 1000;
  await storage9.setItemAsync(SESSION_AUTOLOCK_MINUTES_KEY, '5');
  await storage9.setItemAsync(SESSION_BACKGROUND_TIMESTAMP_KEY, String(pastTime));

  const appState9 = new MockAppStateAdapter();
  const sm9 = new SessionManager(storage9, appState9);
  await sm9.init();

  assert(sm9.getAutoLockMinutes() === 5, 'Restored autoLockMinutes from storage on cold start');
  assert(sm9.getIsLocked() === true, 'Cold boot detects elapsed time >= timeout and starts locked');

  // -------------------------------------------------------------
  // Test 10: Listener Notifications
  // -------------------------------------------------------------
  console.log('\n--- 10. Real-time Subscriber Notifications ---');
  const storage10 = new MockSecureStorage();
  const appState10 = new MockAppStateAdapter();
  const sm10 = new SessionManager(storage10, appState10);
  await sm10.init(5);

  const notifications: boolean[] = [];
  const unsubscribe = sm10.subscribe((locked) => {
    notifications.push(locked);
  });

  // Listener called immediately on subscription with current state
  assert(notifications.length === 1 && notifications[0] === false, 'Listener receives initial unlocked state');

  sm10.lock();
  assert(notifications.length === 2 && notifications[1] === true, 'Listener notified when locked');

  sm10.unlock();
  assert(notifications.length === 3 && notifications[2] === false, 'Listener notified when unlocked');

  unsubscribe();
  sm10.lock();
  assert(notifications.length === 3, 'Unsubscribed listener receives no further notifications');

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log(` AUTO-LOCK TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAutoLockTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
