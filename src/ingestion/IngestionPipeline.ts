/**
 * IngestionPipeline.ts
 * Core Ingestion Engine for Money Tracker.
 * 
 * Pipeline Execution Order:
 * 1. Privacy Gatekeeper (ProviderDetector): Discards non-banking messages and OTPs in memory.
 * 2. Deterministic Local Parsing (RegexParser): Extracts financial entities in ~2ms.
 * 3. Account Resolution: Maps transaction to user's CBE, Telebirr, or Awash account by mask or provider.
 * 4. 4-Tier Deduplication (DatabaseService): Checks for duplicate transactions across references and proximity.
 * 5. Vault Ledger Persistence: Inserts new items as PENDING_REVIEW into SQLite with full audit fields.
 * 6. Reactive Broadcast: Notifies UI subscribers to update inbox badge and transaction lists.
 */

import {
  CandidateMessage,
  NormalizedCandidateTransaction,
  IngestionResult,
} from './types';
import { ProviderDetector } from './ProviderDetector';
import { RegexParser } from './RegexParser';
import { dbService, DatabaseService } from '../database/DatabaseService';
import { Account, TransactionSource as DbTransactionSource } from '../types/database';

type IngestionListener = (result: IngestionResult) => void;

export class IngestionPipeline {
  private static instance: IngestionPipeline;
  private listeners: Set<IngestionListener> = new Set();
  private dbOverride: any = null;

  public static getInstance(): IngestionPipeline {
    if (!IngestionPipeline.instance) {
      IngestionPipeline.instance = new IngestionPipeline();
    }
    return IngestionPipeline.instance;
  }

  public setDatabaseService(service: any): void {
    this.dbOverride = service;
  }

  private async getDb(): Promise<DatabaseService> {
    const service = this.dbOverride || dbService;
    if (typeof service.initialize === 'function') {
      await service.initialize();
    }
    return service;
  }

  /**
   * Subscribe to new ingestion results for UI badge and list auto-updates.
   */
  public subscribe(listener: IngestionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(result: IngestionResult): void {
    this.listeners.forEach((l) => {
      try {
        l(result);
      } catch (err) {
        console.error('Error in ingestion listener:', err);
      }
    });
  }

  /**
   * Process a single candidate message from any transaction source.
   */
  public async processCandidate(candidate: CandidateMessage): Promise<IngestionResult> {
    try {
      // Step 1: Privacy Gatekeeper & Provider Detection
      const detection = ProviderDetector.detect(candidate);
      if (!detection.isCandidate) {
        return {
          success: false,
          isDuplicate: false,
          status: 'UNPARSED',
          errorMessage: detection.reason || 'Message rejected by privacy filter.',
        };
      }

      // Step 2: Deterministic Regex Parsing
      const parsed = RegexParser.parse(candidate.rawText, candidate.senderHint);
      console.log(`[PIPELINE:PARSER] parse: success=${!!parsed}, provider=${parsed?.provider || 'none'}, amount=${parsed?.amount || 0}, type=${parsed?.type || 'none'}`);
      if (!parsed) {
        console.warn(`[PIPELINE:PARSER] Failed to parse candidate rawText: "${candidate.rawText.substring(0, 60)}..."`);
        return {
          success: false,
          isDuplicate: false,
          status: 'UNPARSED',
          errorMessage: 'Unable to extract transaction details via regex template.',
        };
      }

      // Step 3: Account Resolution
      const db = await this.getDb();
      const accounts = await db.getAccounts();
      const matchedAccount = this.resolveAccount(accounts, parsed.provider, parsed.accountMask);
      const matchedAccountId = matchedAccount ? matchedAccount.id : null;

      // Build Normalized Candidate Transaction
      const timestamp = parsed.timestamp || candidate.timestamp || new Date().toISOString();
      const normalized: NormalizedCandidateTransaction = {
        id: `cand_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        provider: parsed.provider,
        source: candidate.source,
        type: parsed.type,
        amount: parsed.amount,
        currency: parsed.currency || 'ETB',
        merchantName: parsed.merchantName,
        cleanMerchant: parsed.cleanMerchant,
        sender: parsed.sender,
        recipient: parsed.recipient,
        accountMask: parsed.accountMask,
        balanceAfterTransaction: parsed.balanceAfterTransaction,
        refNumber: parsed.refNumber,
        transactionNumber: parsed.transactionNumber,
        timestamp,
        rawSourceMessage: candidate.rawText,
        sourceTimestamp: candidate.timestamp,
        parserVersion: parsed.parserVersion,
        templateId: parsed.templateId,
        confidenceScore: parsed.confidenceScore,
        matchedAccountId,
      };

      console.log(
        `[PIPELINE:CANDIDATE] Candidate parsed: provider=${normalized.provider}, type=${normalized.type}, amount=${normalized.amount}, ref=${normalized.refNumber ?? 'none'}, txn=${normalized.transactionNumber ?? 'none'}, matchedAccount=${matchedAccountId ?? 'none'}`
      );

      // Step 4: 4-Tier Deduplication Check
      const matchResult = await db.findMatchingTransaction({
        amount: normalized.amount,
        timestamp: normalized.timestamp,
        refNumber: normalized.refNumber,
        transactionNumber: normalized.transactionNumber,
        accountId: matchedAccountId,
        cleanMerchant: normalized.cleanMerchant,
        toleranceMinutes: 120,
      });

      if (matchResult.matchFound) {
        console.log(`[PIPELINE] Duplicate detected: ${matchResult.matchReason}`);
        const dupResult: IngestionResult = {
          success: true,
          isDuplicate: true,
          status: 'DUPLICATE_SKIPPED',
          duplicateReason: matchResult.matchReason,
          normalizedTransaction: normalized,
        };
        this.notify(dupResult);
        return dupResult;
      }

      // Step 5: Ledger Persistence as PENDING_REVIEW (unmatched accounts land as PENDING_REVIEW with accountId: null)
      const dbSource: DbTransactionSource =
        candidate.source === 'NOTIFICATION'
          ? 'NOTIFICATION'
          : candidate.source === 'CLIPBOARD'
          ? 'CLIPBOARD'
          : candidate.source === 'RECEIPT'
          ? 'RECEIPT'
          : 'SMS';

      const newTx = await db.createTransaction({
        accountId: matchedAccountId,
        destinationAccountId: null,
        categoryId: null, // User can assign or AI can auto-categorize in Phase 4
        amount: normalized.amount,
        type: normalized.type,
        merchantName: normalized.merchantName,
        cleanMerchant: normalized.cleanMerchant,
        notes: normalized.recipient ? `To: ${normalized.recipient}` : normalized.sender ? `From: ${normalized.sender}` : null,
        status: 'PENDING_REVIEW',
        timestamp: normalized.timestamp,
        source: dbSource,
        rawSourceMessage: normalized.rawSourceMessage,
        sourceTimestamp: normalized.sourceTimestamp,
        refNumber: normalized.refNumber,
        transactionNumber: normalized.transactionNumber,
        sender: normalized.sender,
        recipient: normalized.recipient,
        balanceAfterTransaction: normalized.balanceAfterTransaction,
        parserVersion: normalized.parserVersion,
        templateId: normalized.templateId,
        confidenceScore: normalized.confidenceScore,
        originalAmount: normalized.amount,
        originalMerchantName: normalized.merchantName,
      });

      console.log(`[PIPELINE] Transaction persisted to ledger as PENDING_REVIEW (id: ${newTx.id})`);

      const successResult: IngestionResult = {
        success: true,
        transactionId: newTx.id,
        isDuplicate: false,
        status: 'PENDING_REVIEW',
        normalizedTransaction: normalized,
      };

      this.notify(successResult);
      return successResult;
    } catch (err: any) {
      console.error('[PIPELINE] Ingestion Pipeline processing error:', err);
      return {
        success: false,
        isDuplicate: false,
        status: 'UNPARSED',
        errorMessage: err.message || 'Internal processing error.',
      };
    }
  }

  /**
   * Batch ingestion for historical SMS import or bulk clipboard paste.
   * If directToLedger is true, transactions are confirmed immediately upon ingestion.
   */
  public async ingestBatch(
    messages: CandidateMessage[],
    directToLedger = false
  ): Promise<{
    total: number;
    pendingReview: number;
    confirmed: number;
    duplicatesSkipped: number;
    unparsed: number;
    results: IngestionResult[];
  }> {
    let pendingReview = 0;
    let confirmed = 0;
    let duplicatesSkipped = 0;
    let unparsed = 0;
    const results: IngestionResult[] = [];
    const db = await this.getDb();

    for (const msg of messages) {
      const res = await this.processCandidate(msg);
      results.push(res);
      if (res.status === 'PENDING_REVIEW') {
        if (directToLedger && res.transactionId) {
          await db.confirmTransaction(res.transactionId);
          confirmed++;
        } else {
          pendingReview++;
        }
      } else if (res.status === 'DUPLICATE_SKIPPED') {
        duplicatesSkipped++;
      } else {
        unparsed++;
      }
    }

    return {
      total: messages.length,
      pendingReview,
      confirmed,
      duplicatesSkipped,
      unparsed,
      results,
    };
  }

  /**
   * Utility to split multi-SMS text pasted from SMS app or clipboard.
   * Recognizes standard message boundaries (e.g. "Dear Customer", "You have paid", timestamps).
   */
  public static splitBatchSms(rawBatch: string, defaultSource = 'HISTORICAL_IMPORT' as const): CandidateMessage[] {
    if (!rawBatch || !rawBatch.trim()) return [];

    // Split on common message delimiters like double newlines or bank start signatures
    const rawBlocks = rawBatch
      .split(/\n\s*\n|(?=Dear\s+(?:Customer|Tanya|Abebe)|You\s+have\s+(?:paid|transferred|received|deposited|bought)|Acc\.?\s*[*xX\d]+\s+has\s+been|Your\s+account\s+[*xX\d]+|ውድ\s+ደንበኛችን|የሂሳብ\s+ቁጥር|ለ\s+.+?\s+የ\s+[\d,]+\s*ብር)/g)
      .map((b) => b.trim())
      .filter((b) => b.length > 20);

    const now = new Date().toISOString();
    return rawBlocks.map((text, idx) => ({
      id: `batch_sms_${Date.now()}_${idx}`,
      source: defaultSource,
      rawText: text,
      timestamp: now,
    }));
  }

  /**
   * Resolves the most appropriate user account for the parsed transaction.
   */
  private resolveAccount(
    accounts: Account[],
    provider: string,
    accountMask?: string
  ): Account | null {
    if (!accounts || accounts.length === 0) return null;

    // 1. Try matching by 4-digit mask if present
    if (accountMask) {
      const lastDigits = accountMask.replace(/\D/g, '').slice(-4);
      if (lastDigits) {
        const maskMatch = accounts.find(
          (a) => a.isActive && a.accountMask.replace(/\D/g, '').includes(lastDigits)
        );
        if (maskMatch) return maskMatch;
      }
    }

    // 2. Try matching by provider key
    const providerMatch = accounts.find(
      (a) => a.isActive && a.providerKey.toUpperCase() === provider.toUpperCase()
    );
    if (providerMatch) return providerMatch;

    // 3. Fallback to first active account
    const active = accounts.find((a) => a.isActive);
    return active || accounts[0];
  }
}

export const ingestionPipeline = IngestionPipeline.getInstance();
