/**
 * ManualSmsSource.ts
 * Ingestion Source for manually pasted or batch imported SMS statements.
 */

import { CandidateMessage, TransactionSource, IngestionResult } from '../types';
import { IngestionPipeline } from '../IngestionPipeline';

export class ManualSmsSource implements TransactionSource {
  public readonly sourceType = 'MANUAL_SMS' as const;
  private messageHandler: ((msg: CandidateMessage) => Promise<IngestionResult>) | null = null;

  public onMessage(handler: (msg: CandidateMessage) => Promise<IngestionResult>): void {
    this.messageHandler = handler;
  }

  public async start(): Promise<void> {
    // Stateless source, ready immediately
  }

  public async stop(): Promise<void> {
    // Stateless source
  }

  /**
   * Process a single manually pasted SMS.
   */
  public async ingestSms(rawText: string, senderHint?: string): Promise<IngestionResult | null> {
    const candidate: CandidateMessage = {
      id: `manual_${Date.now()}`,
      source: 'MANUAL_SMS',
      rawText: rawText.trim(),
      senderHint,
      timestamp: new Date().toISOString(),
    };

    if (this.messageHandler) {
      return await this.messageHandler(candidate);
    }

    const pipeline = IngestionPipeline.getInstance();
    return await pipeline.processCandidate(candidate);
  }

  /**
   * Process a batch of historical SMS messages.
   */
  public async ingestBatchText(rawBatch: string): Promise<{
    total: number;
    pendingReview: number;
    duplicatesSkipped: number;
    unparsed: number;
    results: IngestionResult[];
  }> {
    const candidates = IngestionPipeline.splitBatchSms(rawBatch, 'HISTORICAL_IMPORT');
    const pipeline = IngestionPipeline.getInstance();
    return await pipeline.ingestBatch(candidates);
  }
}

export const manualSmsSource = new ManualSmsSource();
