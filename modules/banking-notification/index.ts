import { requireNativeModule, EventEmitter } from 'expo-modules-core';

let BankingNotificationModule: any = null;
let emitter: any = null;

try {
  BankingNotificationModule = requireNativeModule('BankingNotification');
  if (BankingNotificationModule) {
    emitter = new EventEmitter(BankingNotificationModule);
  }
} catch {
  // Graceful fallback when running in Expo Go or non-native environment
  BankingNotificationModule = null;
  emitter = null;
}

export { BankingNotificationModule, emitter };

export function isNotificationPermissionGranted(): boolean {
  try {
    return BankingNotificationModule?.isPermissionGranted() ?? false;
  } catch {
    return false;
  }
}

export function isNotificationServiceConnected(): boolean {
  try {
    return BankingNotificationModule?.isServiceConnected() ?? false;
  } catch {
    return false;
  }
}

export function openNotificationListenerSettings(): void {
  try {
    BankingNotificationModule?.openSettings();
  } catch {
    // Handled by Linking fallback in NotificationSource
  }
}
