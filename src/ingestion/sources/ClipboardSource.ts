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
  private clipboardListenerSubscription: any = null;

  public onMessage(handler: (msg: CandidateMessage) => Promise<IngestionResult>): void {
    this.messageHandler = handler;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Run an initial check on startup
    await this.checkClipboard();

    // 1. Check whenever app transitions from background to active/foreground
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);

    // 2. Attach live clipboard change listener if supported by platform
    try {
      if (typeof Clipboard.addClipboardListener === 'function') {
        this.clipboardListenerSubscription = Clipboard.addClipboardListener(() => {
          if (this.isRunning && AppState.currentState === 'active') {
            this.checkClipboard();
          }
        });
      }
    } catch (err) {
      console.warn('Live clipboard listener not supported:', err);
    }
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    if (this.clipboardListenerSubscription) {
      this.clipboardListenerSubscription.remove();
      this.clipboardListenerSubscription = null;
    }
  }

  private handleAppStateChange = async (nextAppState: AppStateStatus): Promise<void> => {
    console.log(`[CLIPBOARD:JS] appStateChange: nextAppState=${nextAppState}, isRunning=${this.isRunning}`);
    if (nextAppState === 'active' && this.isRunning) {
      // Delay 250ms to allow Android window focus to settle
      setTimeout(() => {
        this.checkClipboard().catch((err) => {
          console.warn('[CLIPBOARD:JS] Error in checkClipboard timeout:', err);
        });
      }, 250);
    }
  };

  private activeCheckPromise: Promise<CandidateMessage | null> | null = null;

  /**
   * Reads clipboard content and returns candidate message if it passes banking filter.
   * Concurrency-safe: Serializes overlapping checks so only one read/pipeline operation runs at once.
   */
  public async checkClipboard(): Promise<CandidateMessage | null> {
    if (this.activeCheckPromise) {
      console.log('[CLIPBOARD:JS] checkClipboard already in progress; reusing active promise.');
      return this.activeCheckPromise;
    }

    this.activeCheckPromise = this.performCheckClipboard().finally(() => {
      this.activeCheckPromise = null;
    });

    return this.activeCheckPromise;
  }

  private async performCheckClipboard(): Promise<CandidateMessage | null> {
    try {
      console.log(`[CLIPBOARD:JS] checkClipboard invoked (currentState=${AppState.currentState})`);

      let hasString = false;
      try {
        hasString = await Clipboard.hasStringAsync();
      } catch (err) {
        console.warn('[CLIPBOARD:JS] hasStringAsync error:', err);
      }
      console.log(`[CLIPBOARD:JS] hasStringAsync=${hasString}`);

      let text = '';
      try {
        text = await Clipboard.getStringAsync();
      } catch (err) {
        console.warn('[CLIPBOARD:JS] getStringAsync error:', err);
      }

      // If empty on first attempt right after resume, retry once after 250ms to handle Android window focus latency
      if (!text || !text.trim()) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        try {
          text = await Clipboard.getStringAsync();
        } catch {}
      }

      if (!text || !text.trim()) {
        console.log('[CLIPBOARD:JS] Clipboard contains no text.');
        return null;
      }

      const trimmed = text.trim();
      console.log(`[CLIPBOARD:JS] Read clipboard text: length=${trimmed.length}, preview="${trimmed.substring(0, 40)}..."`);

      // Don't re-process identical clipboard content that was already processed in this session
      if (trimmed === this.lastProcessedContent) {
        console.log('[CLIPBOARD:JS] Identical clipboard content already processed in this session.');
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
      console.log(`[CLIPBOARD:JS] ProviderDetector: isCandidate=${detection.isCandidate}, provider=${detection.provider}, reason=${detection.reason || 'OK'}`);

      if (!detection.isCandidate) {
        console.log(`[CLIPBOARD:JS] Discarded non-banking candidate: ${detection.reason || 'Not a banking message'}`);
        return null;
      }

      if (this.messageHandler) {
        console.log(`[CLIPBOARD:JS] Forwarding clipboard candidate (${candidate.id}) to IngestionPipeline`);
        const result = await this.messageHandler(candidate);
        // Only mark as processed if pipeline accepted and evaluated it (including duplicate detection)
        if (result && result.success && result.status !== 'UNPARSED') {
          this.lastProcessedContent = trimmed;
        }
      }

      return candidate;
    } catch (err) {
      console.warn('[CLIPBOARD:JS] Failed to read clipboard:', err);
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
