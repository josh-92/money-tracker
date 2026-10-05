/**
 * NotificationSource.ts
 * Ingestion Source for Android Native Notification capture.
 * 
 * Features:
 * - Bridges with Android NotificationListenerService via the local banking-notification Expo module.
 * - In Expo Go or test mode, provides event dispatcher and simulation hooks.
 * - Deep links to Android Notification Access settings.
 * - Filters incoming notifications with ProviderDetector before emitting.
 */

import { Platform, Linking } from 'react-native';
import { CandidateMessage, TransactionSource, IngestionResult } from '../types';
import { ProviderDetector } from '../ProviderDetector';
import {
  BankingNotificationModule,
  emitter,
  isNotificationPermissionGranted,
  isNotificationServiceConnected,
  openNotificationListenerSettings,
} from '../../../modules/banking-notification';

export class NotificationSource implements TransactionSource {
  public readonly sourceType = 'NOTIFICATION' as const;
  private isRunning = false;
  private messageHandler: ((msg: CandidateMessage) => Promise<IngestionResult>) | null = null;
  private nativeSubscription: any = null;

  public onMessage(handler: (msg: CandidateMessage) => Promise<IngestionResult>): void {
    this.messageHandler = handler;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Attach to native module event emitter if available (e.g. in development build)
    if (emitter && Platform.OS === 'android') {
      try {
        this.nativeSubscription = emitter.addListener(
          'onBankingNotificationReceived',
          this.handleNativeNotification
        );
      } catch (err) {
        console.warn('Native notification listener not initialized:', err);
      }
    }
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.nativeSubscription) {
      this.nativeSubscription.remove();
      this.nativeSubscription = null;
    }
  }

  /**
   * Internal handler for notifications received from the native service.
   */
  public handleNativeNotification = async (event: {
    rawText: string;
    packageName?: string;
    title?: string;
    timestamp?: string;
  }): Promise<void> => {
    if (!this.isRunning || !event || !event.rawText) return;

    const candidate: CandidateMessage = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      source: 'NOTIFICATION',
      rawText: event.rawText,
      packageName: event.packageName,
      title: event.title,
      timestamp: event.timestamp || new Date().toISOString(),
    };

    // Instant privacy gate: Discard if not a candidate banking notification
    const detection = ProviderDetector.detect(candidate);
    if (!detection.isCandidate) {
      return;
    }

    if (this.messageHandler) {
      await this.messageHandler(candidate);
    }
  };

  /**
   * Simulates an incoming banking notification for testing in Expo Go or developer preview.
   */
  public async simulateNotification(params: {
    rawText: string;
    senderHint?: string;
    packageName?: string;
    title?: string;
  }): Promise<IngestionResult | null> {
    const candidate: CandidateMessage = {
      id: `sim_notif_${Date.now()}`,
      source: 'NOTIFICATION',
      rawText: params.rawText,
      senderHint: params.senderHint,
      packageName: params.packageName,
      title: params.title,
      timestamp: new Date().toISOString(),
    };

    if (this.messageHandler) {
      return await this.messageHandler(candidate);
    }

    return null;
  }

  /**
   * Directs the user to the Android Special App Access -> Notification Listener settings screen.
   */
  public async openNotificationAccessSettings(): Promise<void> {
    if (Platform.OS === 'android') {
      try {
        openNotificationListenerSettings();
        return;
      } catch {
        // Fallback to Linking intent
      }

      try {
        await Linking.sendIntent('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS');
        return;
      } catch {
        // Fallback to standard app settings
      }
    }
    await Linking.openSettings();
  }

  /**
   * Checks whether the user has granted Special Notification Access on Android.
   */
  public isPermissionGranted(): boolean {
    if (Platform.OS !== 'android') return false;
    return isNotificationPermissionGranted();
  }

  /**
   * Checks whether the Android NotificationListenerService is bound and connected.
   */
  public isServiceConnected(): boolean {
    if (Platform.OS !== 'android') return false;
    return isNotificationServiceConnected();
  }

  /**
   * Checks whether the current runtime is running in Expo Go or a standalone custom dev build.
   */
  public isNativeModuleAvailable(): boolean {
    return Boolean(BankingNotificationModule);
  }
}

export const notificationSource = new NotificationSource();
