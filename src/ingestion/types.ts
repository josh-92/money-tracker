/**
 * types.ts
 * Ingestion Engine Type Definitions.
 * Defines the unified TransactionSource interface, raw candidate messages,
 * and normalized transaction output across all ingestion channels.
 */

import { ProviderKey, TransactionType } from '../types/database';

export type TransactionSourceType =
  | 'NOTIFICATION'
  | 'CLIPBOARD'
  | 'MANUAL_SMS'
  | 'HISTORICAL_IMPORT'
  | 'RECEIPT'
  | 'DIRECT_SMS';

export interface CandidateMessage {
  id: string;
  source: TransactionSourceType;
  rawText: string;
  timestamp: string; // ISO 8601
  senderHint?: string; // e.g. '127', 'CBE', 'Telebirr', 'Awash'
  packageName?: string; // e.g. 'cn.tydic.ethiopay', 'com.combanketh.mobilebanking'
  title?: string; // Notification title if available
}

export interface NormalizedCandidateTransaction {
  id: string;
  provider: ProviderKey | 'UNKNOWN';
  source: TransactionSourceType;
  type: TransactionType;
  amount: number;
  currency: string; // 'ETB'
  merchantName: string;
  cleanMerchant: string;
  sender?: string;
  recipient?: string;
  accountMask?: string;
  description?: string;
  timestamp: string; // ISO 8601
  refNumber?: string;
  transactionNumber?: string;
  balanceAfterTransaction?: number;
  rawSourceMessage: string;
  sourceTimestamp: string;
  parserVersion: string;
  templateId: string;
  confidenceScore: number; // 0.0 - 1.0
  aiOperationUsed?: string;
  matchedAccountId?: string;
  destinationAccountId?: string;
}

export interface IngestionResult {
  success: boolean;
  transactionId?: string;
  isDuplicate: boolean;
  status: 'CONFIRMED' | 'PENDING_REVIEW' | 'DUPLICATE_SKIPPED' | 'UNPARSED';
  normalizedTransaction?: NormalizedCandidateTransaction;
  duplicateReason?: string;
  errorMessage?: string;
}

export interface TransactionSource {
  readonly sourceType: TransactionSourceType;
  start(): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: (msg: CandidateMessage) => Promise<IngestionResult>): void;
}
