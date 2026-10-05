/**
 * ClipboardSource.ts
 * Ingestion Source reading candidate banking text from the system clipboard.
 * 
 * Features:
 * - Listens for app foreground transitions or explicit manual triggers.
 * - Deduplicates clipboard checks so the exact same text is never processed twice.
 * - Uses ProviderDetector to quickly ignore non-banking text without alerting the user.
 * - Dispatches valid candidate messages to IngestionPipeline.
 */

import * as Clipboard from 'expo-clipboard';
import { AppState, AppStateStatus } from 'react-native';
import { CandidateMessage, TransactionSource, IngestionResult } from '../types';
import { ProviderDetector } from '../ProviderDetector';

export class ClipboardSource implements TransactionSource {
  public readonly sourceType = 'CLIPBOARD' as const;
  private isRunning = false;
  private messageHandler: ((msg: CandidateMessage) => Promise<IngestionResult>) | null = null;
  private lastProcessedContent: string = '';
  private appStateSubscription: any = null;

  public onMessage(handler: (msg: CandidateMessage) => Promise<IngestionResult>): void {
    this.messageHandler = handler;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Run an initial check
    await this.checkClipboard();

    // Check whenever app returns to active/foreground
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  private handleAppStateChange = async (nextAppState: AppStateStatus): Promise<void> => {
    if (nextAppState === 'active' && this.isRunning) {
      await this.checkClipboard();
    }
  };

  /**
   * Reads clipboard content and returns candidate message if it passes banking filter.
   */
  public async checkClipboard(): Promise<CandidateMessage | null> {
    try {
      const hasString = await Clipboard.hasStringAsync();
      if (!hasString) return null;

      const text = await Clipboard.getStringAsync();
      if (!text || !text.trim()) return null;

      const trimmed = text.trim();

      // Don't re-process identical clipboard content
      if (trimmed === this.lastProcessedContent) {
        return null;
      }

      // Check if it's an eligible banking message
      const candidate: CandidateMessage = {
        id: `clip_${Date.now()}`,
        source: 'CLIPBOARD',
        rawText: trimmed,
        timestamp: new Date().toISOString(),
      };

      const detection = ProviderDetector.detect(candidate);
      if (!detection.isCandidate) {
        // Not a bank notification, update last processed so we don't evaluate it again
        this.lastProcessedContent = trimmed;
        return null;
      }

      // Mark as processed
      this.lastProcessedContent = trimmed;

      if (this.messageHandler) {
        await this.messageHandler(candidate);
      }

      return candidate;
    } catch (err) {
      console.warn('Failed to read clipboard:', err);
      return null;
    }
  }

  /**
   * Resets the cached clipboard text so the same text can be re-evaluated if desired.
   */
  public resetCache(): void {
    this.lastProcessedContent = '';
  }
}

export const clipboardSource = new ClipboardSource();
