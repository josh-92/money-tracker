/**
 * RegexParser.ts
 * Tier 1 Deterministic Regular Expression Parser for Ethiopian Banks and Wallets.
 * - 100% offline, ~1-2ms execution time, zero token usage.
 * - Extracts amount, merchant/counterparty, balance, reference number, account mask, and date.
 * - Comprehensive support for:
 *   1. Commercial Bank of Ethiopia (CBE) [English & Amharic]
 *   2. Telebirr [English & Amharic]
 *   3. Awash Bank [English & Amharic]
 * - Formats output into NormalizedCandidateTransaction-compatible structures.
 */

import { ProviderKey, TransactionType } from '../types/database';

export interface ParsedBankNotification {
  provider: ProviderKey;
  type: TransactionType;
  amount: number;
  currency: string;
  merchantName: string;
  cleanMerchant: string;
  sender?: string;
  recipient?: string;
  accountMask?: string;
  balanceAfterTransaction?: number;
  balance?: number; // Alias for backward compatibility
  refNumber?: string;
  transactionNumber?: string;
  timestamp?: string; // ISO 8601 if extractable
  rawSourceMessage: string;
  confidenceScore: number; // 0.0 - 1.0
  templateId: string;
  parserVersion: string;
}

export class RegexParser {
  private static readonly PARSER_VERSION = 'regex_v2.0_et';

  /**
   * Main parsing dispatcher for incoming text.
   */
  public static parse(rawText: string, senderHint?: string): ParsedBankNotification | null {
    if (!rawText || !rawText.trim()) return null;
    const text = rawText.trim();
    const hint = (senderHint || '').toUpperCase();

    // 1. Awash Check (by hint or explicit Awash marker / shortcode / ref)
    if (
      hint.includes('AWASH') ||
      hint === '8900' ||
      hint.includes('8900') ||
      hint.includes('አዋሽ') ||
      /\b(?:AW\d+|Awash|AwashBirr|8900|አዋሽ)\b/i.test(text)
    ) {
      const awash = this.parseAwash(text);
      if (awash) return awash;
    }

    // 2. Telebirr Check
    if (
      hint.includes('TELEBIRR') ||
      hint === '127' ||
      hint.includes('ETYDIC') ||
      /\b(?:telebirr|127|ቴሌብር)\b/i.test(text)
    ) {
      const tb = this.parseTelebirr(text);
      if (tb) return tb;
    }

    // 3. CBE Check
    if (
      hint.includes('CBE') ||
      hint.includes('COMMERCIAL') ||
      hint === '951' ||
      /\b(?:CBE|CBEBirr|951)\b/i.test(text)
    ) {
      const cbe = this.parseCBE(text);
      if (cbe) return cbe;
    }

    // 4. Fallback: Try all in order
    return this.parseTelebirr(text) || this.parseCBE(text) || this.parseAwash(text);
  }

  // =========================================================================
  // TELEBIRR PARSER (English & Amharic)
  // =========================================================================

  public static parseTelebirr(text: string): ParsedBankNotification | null {
    // -------------------------------------------------------------
    // Pattern TB-1: Airtime Purchase (English)
    // "You have bought ETB 50.00 airtime for 0911223344 on 2026-10-04. Txn number: AT4321. Current balance is ETB 2700.00."
    // -------------------------------------------------------------
    const tbAirtime = /bought\s+ETB\s+([\d,]+(?:\.\d{1,2})?)\s+airtime\s+for\s+([0-9+]+)/i;
    const mTbAirtime = text.match(tbAirtime);
    if (mTbAirtime) {
      const amount = this.parseAmount(mTbAirtime[1]);
      const phone = mTbAirtime[2];
      const ref = this.extractRegex(text, /(?:Txn number|Transaction number|Txn ID)[:\s]+([A-Z0-9]+)/i);
      const balance = this.extractBalance(text);

      return {
        provider: 'TELEBIRR',
        type: 'EXPENSE',
        amount,
        currency: 'ETB',
        merchantName: `Ethio Telecom Airtime (${phone})`,
        cleanMerchant: 'Ethio Telecom Airtime',
        recipient: phone,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        rawSourceMessage: text,
        confidenceScore: 0.99,
        templateId: 'telebirr_airtime_en',
        parserVersion: this.PARSER_VERSION,
      };
    }

    // -------------------------------------------------------------
    // Pattern TB-2: Merchant Payment (English)
    // "You have paid ETB 350.00 to Kaldi's Coffee (251911223344) on 2026-10-04 14:30:00. Transaction number: CR12345. Your current balance is ETB 2750.00."
    // Also matches push notification without inline date: "You have paid ETB 250.00 to Kaldis Coffee. Transaction number: CR998877. Your balance is ETB 1450.00."
    // -------------------------------------------------------------
    const tbPay = /paid\s+ETB\s+([\d,]+(?:\.\d{1,2})?)\s+to\s+(.+?)(?:\s+\([0-9+]+\))?(?:\s+on\s+([\d\-:\s\/]+))?\.\s*(?:Transaction number|Txn ID|Txn number)[:\s]+([A-Z0-9]+)/i;
    const mTbPay = text.match(tbPay);
    if (mTbPay) {
      const amount = this.parseAmount(mTbPay[1]);
      const merchant = mTbPay[2].trim();
      const dateStr = mTbPay[3]?.trim();
      const ref = mTbPay[4].trim();
      const balance = this.extractBalance(text);

      return {
        provider: 'TELEBIRR',
        type: 'EXPENSE',
        amount,
        currency: 'ETB',
        merchantName: merchant,
        cleanMerchant: this.normalizeMerchant(merchant),
        recipient: merchant,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        timestamp: this.normalizeDate(dateStr),
        rawSourceMessage: text,
        confidenceScore: 0.98,
        templateId: 'telebirr_pay_en',
        parserVersion: this.PARSER_VERSION,
      };
    }

    // -------------------------------------------------------------
    // -------------------------------------------------------------
    // Pattern TB-3: P2P Transfer Out / Send Money (English)
    // "You have transferred ETB 500.00 to Abebe Bikila (0911000000) on 2026-10-04. Txn number: TR9988. Current balance is ETB 1500.00."
    // "You have transferred ETB 500.00 to Abebe Bikila (0911000000). Txn number: TR9988. Current balance is ETB 1500.00."
    // -------------------------------------------------------------
    const tbTransfer = /(?:transferred|sent)\s+ETB\s+([\d,]+(?:\.\d{1,2})?)\s+to\s+(.+?)(?:\s+\([0-9+]+\))?(?:\s+on\s+[\d\-:\s\/]+)?(?:\.|\s+(?:Txn|Transaction|Current|Balance|Your|successfully|$))/i;
    const mTbTransfer = text.match(tbTransfer);
    if (mTbTransfer) {
      const amount = this.parseAmount(mTbTransfer[1]);
      let recipient = mTbTransfer[2].replace(/\s+successfully\b/i, '').trim();
      const ref = this.extractRegex(text, /(?:Txn number|Transaction number|Txn ID|Txn No|Ref)[:\s]+([A-Z0-9]+)/i);
      const balance = this.extractBalance(text);

      return {
        provider: 'TELEBIRR',
        type: 'TRANSFER',
        amount,
        currency: 'ETB',
        merchantName: recipient,
        cleanMerchant: recipient,
        recipient,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        rawSourceMessage: text,
        confidenceScore: 0.96,
        templateId: 'telebirr_transfer_en',
        parserVersion: this.PARSER_VERSION,
      };
    }

    // -------------------------------------------------------------
    // Pattern TB-4: Received Money / Inflow (English)
    // "You have received ETB 1,200.00 from Kebede on 2026-10-04. Txn number: RC4567. Your current balance is ETB 3950.00."
    // "You have received ETB 1,200.00 from Kebede. Txn number: RC4567. Your current balance is ETB 3950.00."
    // -------------------------------------------------------------
    const tbReceive = /received\s+ETB\s+([\d,]+(?:\.\d{1,2})?)\s+from\s+(.+?)(?:\s+\([0-9+]+\))?(?:\s+on\s+[\d\-:\s\/]+)?(?:\.|\s+(?:Txn|Transaction|Current|Balance|Your|$))/i;
    const mTbReceive = text.match(tbReceive);
    if (mTbReceive) {
      const amount = this.parseAmount(mTbReceive[1]);
      const sender = mTbReceive[2].replace(/\s+\([0-9+]+\)/, '').trim();
      const ref = this.extractRegex(text, /(?:Txn number|Transaction number|Txn ID|Txn No|Ref)[:\s]+([A-Z0-9]+)/i);
      const balance = this.extractBalance(text);

      return {
        provider: 'TELEBIRR',
        type: 'INCOME',
        amount,
        currency: 'ETB',
        merchantName: sender,
        cleanMerchant: sender,
        sender,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        rawSourceMessage: text,
        confidenceScore: 0.96,
        templateId: 'telebirr_receive_en',
        parserVersion: this.PARSER_VERSION,
      };
    }

    // -------------------------------------------------------------
    // Pattern TB-5: Deposit / Cash-In (English)
    // "You have deposited ETB 2,000.00 from CBE account. Txn number: CI1234. Your current balance is ETB 5,950.00."
    // -------------------------------------------------------------
    const tbDeposit = /deposited\s+ETB\s+([\d,]+(?:\.\d{1,2})?)\s+from\s+(.+?)(?:\.|$)/i;
    const mTbDeposit = text.match(tbDeposit);
    if (mTbDeposit) {
      const amount = this.parseAmount(mTbDeposit[1]);
      const sourceDesc = mTbDeposit[2].trim();
      const ref = this.extractRegex(text, /(?:Txn number|Transaction number|Txn ID)[:\s]+([A-Z0-9]+)/i);
      const balance = this.extractBalance(text);

      return {
        provider: 'TELEBIRR',
        type: 'INCOME',
        amount,
        currency: 'ETB',
        merchantName: `Deposit from ${sourceDesc}`,
        cleanMerchant: `Deposit from ${sourceDesc}`,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        rawSourceMessage: text,
        confidenceScore: 0.95,
        templateId: 'telebirr_deposit_en',
        parserVersion: this.PARSER_VERSION,
      };
    }

    // -------------------------------------------------------------
    // Pattern TB-6: Airtime Purchase (Amharic)
    // "የ 50.00 ብር የአየር ሰዓት ለ 0911223344 ገዝተዋል። የግብይት ቁጥር: AT4321። ቀሪ ሂሳብ: 2700.00 ብር"
    // -------------------------------------------------------------
    const tbAmAirtime = /የ\s+([\d,]+(?:\.\d{1,2})?)\s*ብር\s*የአየር\s*ሰዓት\s*ለ\s*([0-9+]+)/;
    const mTbAmAirtime = text.match(tbAmAirtime);
    if (mTbAmAirtime) {
      const amount = this.parseAmount(mTbAmAirtime[1]);
      const phone = mTbAmAirtime[2];
      const ref = this.extractRegex(text, /የግብይት\s*ቁጥር[:\s]+([A-Z0-9]+)/i);
      const balance = this.extractBalance(text);

      return {
        provider: 'TELEBIRR',
        type: 'EXPENSE',
        amount,
        currency: 'ETB',
        merchantName: `Ethio Telecom Airtime (${phone})`,
        cleanMerchant: 'Ethio Telecom Airtime',
        recipient: phone,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        rawSourceMessage: text,
        confidenceScore: 0.98,
        templateId: 'telebirr_airtime_am',
        parserVersion: this.PARSER_VERSION,
      };
    }

    // -------------------------------------------------------------
    // Pattern TB-7: Merchant Payment (Amharic)
    // "ለ Kaldi's Coffee የ 350.00 ብር ክፍያ ፈጽመዋል። የግብይት ቁጥር: CR12345። ቀሪ ሂሳብዎ 2,750.00 ብር ነው።"
    // -------------------------------------------------------------
    const tbAmPay = /ለ\s+(.+?)\s+የ\s+([\d,]+(?:\.\d{1,2})?)\s*ብር\s*ክፍያ\s*ፈጽመዋል/;
    const mTbAmPay = text.match(tbAmPay);
    if (mTbAmPay) {
      const merchant = mTbAmPay[1].trim();
      const amount = this.parseAmount(mTbAmPay[2]);
      const ref = this.extractRegex(text, /የግብይት\s*ቁጥር[:\s]+([A-Z0-9]+)/i);
      const balance = this.extractBalance(text);

      return {
        provider: 'TELEBIRR',
        type: 'EXPENSE',
        amount,
        currency: 'ETB',
        merchantName: merchant,
        cleanMerchant: this.normalizeMerchant(merchant),
        recipient: merchant,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        rawSourceMessage: text,
        confidenceScore: 0.96,
        templateId: 'telebirr_pay_am',
        parserVersion: this.PARSER_VERSION,
      };
    }

    // -------------------------------------------------------------
    // Pattern TB-8: Transfer Out (Amharic)
    // "ለ Abebe Bikila (0911000000) የ 500.00 ብር አስተላልፈዋል። የግብይት ቁጥር: TR9988። ቀሪ ሂሳብ: 1500.00 ብር"
    // -------------------------------------------------------------
    const tbAmTransfer = /(?:ለ|ወደ)\s+(.+?)(?:\s+\([0-9+]+\))?\s+የ\s*([\d,]+(?:\.\d{1,2})?)\s*ብር\s*አስተላልፈዋል|የ\s*([\d,]+(?:\.\d{1,2})?)\s*ብር\s*(?:ለ|ወደ)\s+(.+?)(?:\s+\([0-9+]+\))?\s*አስተላልፈዋል/;
    const mTbAmTransfer = text.match(tbAmTransfer);
    if (mTbAmTransfer) {
      const recipient = (mTbAmTransfer[1] || mTbAmTransfer[4] || 'Telebirr Recipient').trim();
      const amount = this.parseAmount(mTbAmTransfer[2] || mTbAmTransfer[3]);
      const ref = this.extractRegex(text, /የግብይት\s*ቁጥር[:\s]+([A-Z0-9]+)/i);
      const balance = this.extractBalance(text);

      return {
        provider: 'TELEBIRR',
        type: 'TRANSFER',
        amount,
        currency: 'ETB',
        merchantName: recipient,
        cleanMerchant: recipient,
        recipient,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        rawSourceMessage: text,
        confidenceScore: 0.96,
        templateId: 'telebirr_transfer_am',
        parserVersion: this.PARSER_VERSION,
      };
    }

    // -------------------------------------------------------------
    // Pattern TB-9: Receive Money (Amharic)
    // "ከ Kebede የ 1,200.00 ብር ገቢ ተደርጎልዎታል። የግብይት ቁጥር: RC4567። ቀሪ ሂሳብዎ 3,950.00 ብር ነው።"
    // -------------------------------------------------------------
    const tbAmReceive = /ከ\s+(.+?)\s+የ\s+([\d,]+(?:\.\d{1,2})?)\s*ብር\s*ገቢ\s*ተደርጎልዎታ/;
    const mTbAmReceive = text.match(tbAmReceive);
    if (mTbAmReceive) {
      const sender = mTbAmReceive[1].trim();
      const amount = this.parseAmount(mTbAmReceive[2]);
      const ref = this.extractRegex(text, /የግብይት\s*ቁጥር[:\s]+([A-Z0-9]+)/i);
      const balance = this.extractBalance(text);

      return {
        provider: 'TELEBIRR',
        type: 'INCOME',
        amount,
        currency: 'ETB',
        merchantName: sender,
        cleanMerchant: sender,
        sender,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        rawSourceMessage: text,
        confidenceScore: 0.96,
        templateId: 'telebirr_receive_am',
        parserVersion: this.PARSER_VERSION,
      };
    }

    return null;
  }

  // =========================================================================
  // COMMERCIAL BANK OF ETHIOPIA (CBE) PARSER (English & Amharic)
  // =========================================================================

  public static parseCBE(text: string): ParsedBankNotification | null {
    // -------------------------------------------------------------
    // Pattern CBE-1: Debit Alert (English)
    // "Dear Tanya, your Acc. ***7852 has been debited with ETB 450.00 on 04/10/2026 14:15 for Shoa Supermarket. Balance: ETB 6,800.00. Ref: FT26277."
    // "Dear Customer, your Account 100012345678 has been debited with ETB 1,500.00 on 04-10-2026. Reason: ATM Withdrawal. Balance: ETB 5,300.00. Txn: FT998877."
    // -------------------------------------------------------------
    const cbeDebit = /Acc\.?\s*([*xX\d]+)\s+has\s+been\s+debited\s+with\s+ETB\s+([\d,]+(?:\.\d{1,2})?)(?:\s+on\s+([\d\/\-:\s]+))?\s+(?:for|Reason:)\s+(.+?)\.\s*Balance/i;
    const mCbeDebit = text.match(cbeDebit);
    if (mCbeDebit) {
      const accountMask = this.normalizeAccountMask(mCbeDebit[1]);
      const amount = this.parseAmount(mCbeDebit[2]);
      const dateStr = mCbeDebit[3]?.trim();
      const merchant = mCbeDebit[4].trim();
      const balance = this.extractBalance(text);
      const ref = this.extractRegex(text, /(?:Ref|Txn|Reference)[:\s]+([A-Z0-9]+)/i);

      return {
        provider: 'CBE',
        type: 'EXPENSE',
        amount,
        currency: 'ETB',
        merchantName: merchant,
        cleanMerchant: this.normalizeMerchant(merchant),
        recipient: merchant,
        accountMask,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        timestamp: this.normalizeDate(dateStr),
        rawSourceMessage: text,
        confidenceScore: 0.98,
        templateId: 'cbe_debit_en',
        parserVersion: this.PARSER_VERSION,
      };
    }

    // -------------------------------------------------------------
    // Pattern CBE-2: Transfer Out (English)
    // "Dear Customer, you have transferred ETB 2,000.00 from Acc. ***7852 to Acc. ***9999 (Dawit Tsige). Balance: ETB 29,800.00. Ref: FT556677."
    // -------------------------------------------------------------
    const cbeTransfer = /transferred\s+ETB\s+([\d,]+(?:\.\d{1,2})?)\s+from\s+Acc\.?\s*([*xX\d]+)\s+to\s+Acc\.?\s*([*xX\d]+)?(?:\s*\((.+?)\))?/i;
    const mCbeTransfer = text.match(cbeTransfer);
    if (mCbeTransfer) {
      const amount = this.parseAmount(mCbeTransfer[1]);
      const fromMask = this.normalizeAccountMask(mCbeTransfer[2]);
      const recipient = (mCbeTransfer[4] || mCbeTransfer[3] || 'Transfer Recipient').trim();
      const balance = this.extractBalance(text);
      const ref = this.extractRegex(text, /(?:Ref|Txn|Reference)[:\s]+([A-Z0-9]+)/i);

      return {
        provider: 'CBE',
        type: 'TRANSFER',
        amount,
        currency: 'ETB',
        merchantName: recipient,
        cleanMerchant: recipient,
        recipient,
        accountMask: fromMask,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        rawSourceMessage: text,
        confidenceScore: 0.98,
        templateId: 'cbe_transfer_en',
        parserVersion: this.PARSER_VERSION,
      };
    }

    // -------------------------------------------------------------
    // Pattern CBE-3: Credit Alert / Inflow (English)
    // "Dear Tanya, your Acc. ***7852 has been credited with ETB 25,000.00 on 04/10/2026 by TECH PLC. Balance: ETB 31,800.00. Ref: FT889900."
    // -------------------------------------------------------------
    const cbeCredit = /Acc\.?\s*([*xX\d]+)\s+has\s+been\s+credited\s+with\s+ETB\s+([\d,]+(?:\.\d{1,2})?)(?:\s+on\s+([\d\/\-:\s]+))?\s+(?:by|from)\s+(.+?)\.\s*Balance/i;
    const mCbeCredit = text.match(cbeCredit);
    if (mCbeCredit) {
      const accountMask = this.normalizeAccountMask(mCbeCredit[1]);
      const amount = this.parseAmount(mCbeCredit[2]);
      const dateStr = mCbeCredit[3]?.trim();
      const sender = mCbeCredit[4].trim();
      const balance = this.extractBalance(text);
      const ref = this.extractRegex(text, /(?:Ref|Txn|Reference)[:\s]+([A-Z0-9]+)/i);

      return {
        provider: 'CBE',
        type: 'INCOME',
        amount,
        currency: 'ETB',
        merchantName: sender,
        cleanMerchant: sender,
        sender,
        accountMask,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        timestamp: this.normalizeDate(dateStr),
        rawSourceMessage: text,
        confidenceScore: 0.98,
        templateId: 'cbe_credit_en',
        parserVersion: this.PARSER_VERSION,
      };
    }

    // -------------------------------------------------------------
    // Pattern CBE-4: Debit Alert (Amharic)
    // "ውድ ደንበኛችን፤ የሂሳብ ቁጥር ***7852 በ 04/10/2026 የ 450.00 ብር ወጪ ተደርጓል (Shoa Supermarket)። ቀሪ ሂሳብዎ 6,800.00 ብር። የማጣቀሻ ቁጥር: FT26277"
    // -------------------------------------------------------------
    const cbeAmDebit = /የሂሳብ\s*ቁጥር\s*([*xX\d]+).*(?:የ\s*([\d,]+(?:\.\d{1,2})?)\s*ብር\s*ወጪ\s*ተደርጓል|ወጪ\s*ተደርጓል\s*የ\s*([\d,]+(?:\.\d{1,2})?)\s*ብር)(?:\s*\((.+?)\)|\s*ለ\s*(.+?)(?:።|$))/;
    const mCbeAmDebit = text.match(cbeAmDebit);
    if (mCbeAmDebit) {
      const accountMask = this.normalizeAccountMask(mCbeAmDebit[1]);
      const amount = this.parseAmount(mCbeAmDebit[2] || mCbeAmDebit[3]);
      const merchant = (mCbeAmDebit[4] || mCbeAmDebit[5] || 'CBE Debit').trim();
      const balance = this.extractBalance(text);
      const ref = this.extractRegex(text, /(?:የማጣቀሻ\s*ቁጥር|መለያ\s*ቁጥር)[:\s]+([A-Z0-9]+)/i);

      return {
        provider: 'CBE',
        type: 'EXPENSE',
        amount,
        currency: 'ETB',
        merchantName: merchant,
        cleanMerchant: this.normalizeMerchant(merchant),
        recipient: merchant,
        accountMask,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        rawSourceMessage: text,
        confidenceScore: 0.97,
        templateId: 'cbe_debit_am',
        parserVersion: this.PARSER_VERSION,
      };
    }

    // -------------------------------------------------------------
    // Pattern CBE-5: Credit Alert (Amharic)
    // "ውድ ደንበኛችን፤ በሂሳብ ቁጥር ***7852 ላይ በ 04/10/2026 የ 25,000.00 ብር ገቢ ተደርጓል (ከ TECH PLC)። ቀሪ ሂሳብ: 31,800.00 ብር። የማጣቀሻ ቁጥር: FT889900"
    // -------------------------------------------------------------
    const cbeAmCredit = /በሂሳብ\s*ቁጥር\s*([*xX\d]+).*(?:የ\s*([\d,]+(?:\.\d{1,2})?)\s*ብር\s*ገቢ\s*ተደርጓል)(?:\s*\((?:ከ\s*)?(.+?)\)|\s*ከ\s*(.+?)(?:።|$))/;
    const mCbeAmCredit = text.match(cbeAmCredit);
    if (mCbeAmCredit) {
      const accountMask = this.normalizeAccountMask(mCbeAmCredit[1]);
      const amount = this.parseAmount(mCbeAmCredit[2]);
      const sender = (mCbeAmCredit[3] || mCbeAmCredit[4] || 'CBE Credit').trim();
      const balance = this.extractBalance(text);
      const ref = this.extractRegex(text, /(?:የማጣቀሻ\s*ቁጥር|መለያ\s*ቁጥር)[:\s]+([A-Z0-9]+)/i);

      return {
        provider: 'CBE',
        type: 'INCOME',
        amount,
        currency: 'ETB',
        merchantName: sender,
        cleanMerchant: sender,
        sender,
        accountMask,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        rawSourceMessage: text,
        confidenceScore: 0.97,
        templateId: 'cbe_credit_am',
        parserVersion: this.PARSER_VERSION,
      };
    }

    // -------------------------------------------------------------
    // Pattern CBE-6: Transfer Out (Amharic)
    // "ውድ ደንበኛችን፤ ከሂሳብ ቁጥር ***7852 ወደ ***9999 (Dawit Tsige) የ 2,000.00 ብር አስተላልፈዋል። ቀሪ ሂሳብ: 29,800.00 ብር። የማጣቀሻ ቁጥር: FT556677"
    // -------------------------------------------------------------
    const cbeAmTransfer = /ከሂሳብ\s*ቁጥር\s*([*xX\d]+)\s+ወደ\s+([*xX\d]+)(?:\s*\((.+?)\))?\s+የ\s*([\d,]+(?:\.\d{1,2})?)\s*ብር\s*አስተላልፈዋል/;
    const mCbeAmTransfer = text.match(cbeAmTransfer);
    if (mCbeAmTransfer) {
      const fromMask = this.normalizeAccountMask(mCbeAmTransfer[1]);
      const recipient = (mCbeAmTransfer[3] || mCbeAmTransfer[2] || 'Transfer Recipient').trim();
      const amount = this.parseAmount(mCbeAmTransfer[4]);
      const balance = this.extractBalance(text);
      const ref = this.extractRegex(text, /(?:የማጣቀሻ\s*ቁጥር|መለያ\s*ቁጥር)[:\s]+([A-Z0-9]+)/i);

      return {
        provider: 'CBE',
        type: 'TRANSFER',
        amount,
        currency: 'ETB',
        merchantName: recipient,
        cleanMerchant: recipient,
        recipient,
        accountMask: fromMask,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        rawSourceMessage: text,
        confidenceScore: 0.97,
        templateId: 'cbe_transfer_am',
        parserVersion: this.PARSER_VERSION,
      };
    }

    return null;
  }

  // =========================================================================
  // AWASH BANK PARSER (English & Amharic)
  // =========================================================================

  public static parseAwash(text: string): ParsedBankNotification | null {
    // -------------------------------------------------------------
    // Pattern AW-1: Debit Alert (English)
    // "Your account ***3901 has been debited by ETB 800.00 at Total Bole on 04/10/2026. Available Balance: ETB 1,300.00. Reference: AW9876."
    // "Dear Customer, Acc ***3901 is debited with ETB 1,200.00 for POS Purchase. Available Bal: ETB 100.00. Ref: AW123456."
    // "Your account 0132*** was debited with ETB 450.00. Available Bal: ETB 2,500.00. Ref: 12345."
    // "Your account ***3901 was debited ETB 450.00. Available Bal: ETB 2,500.00. Ref: 12345."
    // -------------------------------------------------------------
    const awashDebit = /(?:account|Acc\.?)\s*([*xX\d]+)\s+(?:has\s+been|is|was)?\s*debited\s*(?:by|with)?\s*ETB\s*([\d,]+(?:\.\d{1,2})?)(?:\s+(?:at|for)\s+(.+?))?(?:\s+on\s+[\d\/\-:\s]+)?(?:\.|\s+(?:Available|Balance|Ref|Reference|$))/i;
    const mAwashDebit = text.match(awashDebit);
    if (mAwashDebit) {
      const accountMask = this.normalizeAccountMask(mAwashDebit[1]);
      const amount = this.parseAmount(mAwashDebit[2]);
      const merchant = (mAwashDebit[3] || 'Awash Debit').trim();
      const balance = this.extractBalance(text);
      const ref = this.extractRegex(text, /(?:Reference|Ref)[:\s]+([A-Z0-9]+)/i);

      return {
        provider: 'AWASH',
        type: 'EXPENSE',
        amount,
        currency: 'ETB',
        merchantName: merchant,
        cleanMerchant: this.normalizeMerchant(merchant),
        recipient: merchant,
        accountMask,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        rawSourceMessage: text,
        confidenceScore: 0.98,
        templateId: 'awash_debit_en',
        parserVersion: this.PARSER_VERSION,
      };
    }

    // -------------------------------------------------------------
    // Pattern AW-2: Credit Alert (English)
    // "Your account ***3901 has been credited with ETB 5,000.00 on 04/10/2026 by Payroll. Available Balance: ETB 6,300.00. Reference: AW5432."
    // "Your account ***3901 has been credited with ETB 5,000.00 on 04/10/2026. Available Balance: ETB 6,300.00. Reference: AW5432."
    // "Your account ***3901 has been credited ETB 5,000.00 on 04/10/2026. Available Balance: ETB 6,300.00. Reference: AW5432."
    // "Acc 0132*** is credited with ETB 2,500.00 from Abebe Bikila. Ref: 98765."
    // -------------------------------------------------------------
    const awashCredit = /(?:account|Acc\.?)\s*([*xX\d]+)\s+(?:has\s+been|is|was)?\s*credited\s*(?:with|by)?\s*ETB\s*([\d,]+(?:\.\d{1,2})?)(?:\s+on\s+[\d\/\-:\s]+)?(?:\s+(?:by|from)\s+(.+?))?(?:\.|\s+(?:Available|Balance|Ref|Reference|$))/i;
    const mAwashCredit = text.match(awashCredit);
    if (mAwashCredit) {
      const accountMask = this.normalizeAccountMask(mAwashCredit[1]);
      const amount = this.parseAmount(mAwashCredit[2]);
      const sender = (mAwashCredit[3] || 'Awash Credit').trim();
      const balance = this.extractBalance(text);
      const ref = this.extractRegex(text, /(?:Reference|Ref)[:\s]+([A-Z0-9]+)/i);

      return {
        provider: 'AWASH',
        type: 'INCOME',
        amount,
        currency: 'ETB',
        merchantName: sender,
        cleanMerchant: sender,
        sender,
        accountMask,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        rawSourceMessage: text,
        confidenceScore: 0.98,
        templateId: 'awash_credit_en',
        parserVersion: this.PARSER_VERSION,
      };
    }

    // -------------------------------------------------------------
    // Pattern AW-3: Transfer Out (English)
    // "Your account ***3901 transferred ETB 1,500.00 to Selamawit on 04/10/2026. Ref: AW7788. Available Balance: ETB 4,800.00."
    // -------------------------------------------------------------
    const awashTransfer = /(?:account|Acc\.?)\s*([*xX\d]+)\s+transferred\s+ETB\s+([\d,]+(?:\.\d{1,2})?)\s+to\s+(.+?)(?:\s+on|\.|\s+(?:Available|Balance|Ref|Reference|$))/i;
    const mAwashTransfer = text.match(awashTransfer);
    if (mAwashTransfer) {
      const accountMask = this.normalizeAccountMask(mAwashTransfer[1]);
      const amount = this.parseAmount(mAwashTransfer[2]);
      const recipient = mAwashTransfer[3].trim();
      const balance = this.extractBalance(text);
      const ref = this.extractRegex(text, /(?:Reference|Ref)[:\s]+([A-Z0-9]+)/i);

      return {
        provider: 'AWASH',
        type: 'TRANSFER',
        amount,
        currency: 'ETB',
        merchantName: recipient,
        cleanMerchant: recipient,
        recipient,
        accountMask,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        rawSourceMessage: text,
        confidenceScore: 0.97,
        templateId: 'awash_transfer_en',
        parserVersion: this.PARSER_VERSION,
      };
    }

    // -------------------------------------------------------------
    // Pattern AW-4: Debit Alert (Amharic)
    // "የሂሳብ ቁጥር ***3901 በ ETB 800.00 ወጪ ተደርጓል (Total Bole)። ቀሪ ሂሳብ: ETB 1,300.00። መለያ ቁጥር: AW9876"
    // "ከሂሳብ ቁጥር ***3901 የ 800.00 ብር ወጪ ተደርጓል። ቀሪ ሂሳብ: 1,300.00 ብር"
    // -------------------------------------------------------------
    const awashAmDebit = /(?:የሂሳብ|ከሂሳብ)\s*ቁጥር\s*([*xX\d]+)\s+(?:በ|የ)?\s*(?:ETB\s*)?([\d,]+(?:\.\d{1,2})?)\s*(?:ብር|ETB)?\s*ወጪ\s*ተደርጓል(?:\s*\((.+?)\)|\s*ለ\s*(.+?)(?:።|$))/;
    const mAwashAmDebit = text.match(awashAmDebit);
    if (mAwashAmDebit) {
      const accountMask = this.normalizeAccountMask(mAwashAmDebit[1]);
      const amount = this.parseAmount(mAwashAmDebit[2]);
      const merchant = (mAwashAmDebit[3] || mAwashAmDebit[4] || 'Awash Debit').trim();
      const balance = this.extractBalance(text);
      const ref = this.extractRegex(text, /(?:መለያ\s*ቁጥር|የማጣቀሻ\s*ቁጥር)[:\s]+([A-Z0-9]+)/i);

      return {
        provider: 'AWASH',
        type: 'EXPENSE',
        amount,
        currency: 'ETB',
        merchantName: merchant,
        cleanMerchant: this.normalizeMerchant(merchant),
        recipient: merchant,
        accountMask,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        rawSourceMessage: text,
        confidenceScore: 0.97,
        templateId: 'awash_debit_am',
        parserVersion: this.PARSER_VERSION,
      };
    }

    // -------------------------------------------------------------
    // Pattern AW-5: Credit Alert (Amharic)
    // "በሂሳብ ቁጥር ***3901 ላይ የ 5,000.00 ብር ገቢ ተደርጓል (ከ Payroll)። ቀሪ ሂሳብ: ETB 6,300.00። መለያ ቁጥር: AW5432"
    // "የሂሳብ ቁጥር ***3901 የ 5,000.00 ብር ገቢ ተደርጓል። ቀሪ ሂሳብ: 6,300.00 ብር"
    // -------------------------------------------------------------
    const awashAmCredit = /(?:በሂሳብ|የሂሳብ)\s*ቁጥር\s*([*xX\d]+)\s*(?:ላይ)?\s*የ\s*([\d,]+(?:\.\d{1,2})?)\s*(?:ብር|ETB)?\s*ገቢ\s*ተደርጓል(?:\s*\((.+?)\)|\s*ከ\s*(.+?)(?:።|$))/;
    const mAwashAmCredit = text.match(awashAmCredit);
    if (mAwashAmCredit) {
      const accountMask = this.normalizeAccountMask(mAwashAmCredit[1]);
      const amount = this.parseAmount(mAwashAmCredit[2]);
      const sender = (mAwashAmCredit[3] || mAwashAmCredit[4] || 'Awash Credit').trim();
      const balance = this.extractBalance(text);
      const ref = this.extractRegex(text, /(?:መለያ\s*ቁጥር|የማጣቀሻ\s*ቁጥር)[:\s]+([A-Z0-9]+)/i);

      return {
        provider: 'AWASH',
        type: 'INCOME',
        amount,
        currency: 'ETB',
        merchantName: sender,
        cleanMerchant: sender,
        sender,
        accountMask,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        rawSourceMessage: text,
        confidenceScore: 0.97,
        templateId: 'awash_credit_am',
        parserVersion: this.PARSER_VERSION,
      };
    }

    // -------------------------------------------------------------
    // Pattern AW-6: Awash Birr Wallet Inflow (English)
    // "You have received ETB 1,000.00 from Abebe Bikila (0911223344) on 04/10/2026. Txn ID: AW1234. Your balance is ETB 2,500.00."
    // -------------------------------------------------------------
    const awashBirrReceive = /(?:You have received|Received)\s+ETB\s+([\d,]+(?:\.\d{1,2})?)\s+from\s+(.+?)(?:\s+\([0-9+]+\))?(?:\s+on\s+[\d\/\-:\s]+)?(?:\.|\s+(?:Txn|Ref|Available|Balance|Your|$))/i;
    const mAwashBirrRec = text.match(awashBirrReceive);
    if (mAwashBirrRec && (text.toLowerCase().includes('awash') || text.includes('8900') || /AW\d+/i.test(text))) {
      const amount = this.parseAmount(mAwashBirrRec[1]);
      const sender = mAwashBirrRec[2].trim();
      const balance = this.extractBalance(text);
      const ref = this.extractRegex(text, /(?:Reference|Ref|Txn ID|Txn)[:\s]+([A-Z0-9]+)/i);

      return {
        provider: 'AWASH',
        type: 'INCOME',
        amount,
        currency: 'ETB',
        merchantName: sender,
        cleanMerchant: sender,
        sender,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        rawSourceMessage: text,
        confidenceScore: 0.95,
        templateId: 'awash_birr_receive_en',
        parserVersion: this.PARSER_VERSION,
      };
    }

    // -------------------------------------------------------------
    // Pattern AW-7: Awash Birr Wallet Outflow (English)
    // "You have transferred ETB 500.00 to Selamawit. Txn ID: AW9988. Available balance is ETB 2,000.00."
    // -------------------------------------------------------------
    const awashBirrSend = /(?:You have transferred|Transferred|You have paid|Paid)\s+ETB\s+([\d,]+(?:\.\d{1,2})?)\s+to\s+(.+?)(?:\s+\([0-9+]+\))?(?:\s+on\s+[\d\/\-:\s]+)?(?:\.|\s+(?:Txn|Ref|Available|Balance|Your|$))/i;
    const mAwashBirrSend = text.match(awashBirrSend);
    if (mAwashBirrSend && (text.toLowerCase().includes('awash') || text.includes('8900') || /AW\d+/i.test(text))) {
      const amount = this.parseAmount(mAwashBirrSend[1]);
      const recipient = mAwashBirrSend[2].trim();
      const balance = this.extractBalance(text);
      const ref = this.extractRegex(text, /(?:Reference|Ref|Txn ID|Txn)[:\s]+([A-Z0-9]+)/i);

      return {
        provider: 'AWASH',
        type: 'EXPENSE',
        amount,
        currency: 'ETB',
        merchantName: recipient,
        cleanMerchant: recipient,
        recipient,
        balanceAfterTransaction: balance,
        balance,
        refNumber: ref,
        transactionNumber: ref,
        rawSourceMessage: text,
        confidenceScore: 0.95,
        templateId: 'awash_birr_send_en',
        parserVersion: this.PARSER_VERSION,
      };
    }

    return null;
  }

  // =========================================================================
  // UTILITY HELPERS
  // =========================================================================

  private static parseAmount(str: string): number {
    return parseFloat(str.replace(/,/g, ''));
  }

  private static extractBalance(text: string): number | undefined {
    // Matches: "balance is ETB 2,750.00", "Balance: ETB 6,800.00", "Available Balance: ETB 1,300.00", "ቀሪ ሂሳብዎ 2,750.00 ብር", "ቀሪ ሂሳብ: 1500.00"
    const mEn = text.match(/(?:current\s+balance|available\s+balance|balance|bal)[:\s]+(?:is\s+)?(?:ETB\s+)?([\d,]+(?:\.\d{1,2})?)/i);
    if (mEn) return this.parseAmount(mEn[1]);

    const mAm = text.match(/ቀሪ\s*ሂሳብ(?:ዎ)?[:\s]+(?:ETB\s+)?([\d,]+(?:\.\d{1,2})?)/i);
    if (mAm) return this.parseAmount(mAm[1]);

    return undefined;
  }

  private static extractRegex(text: string, regex: RegExp): string | undefined {
    const m = text.match(regex);
    return m ? m[1].trim() : undefined;
  }

  private static normalizeAccountMask(mask: string): string {
    const trimmed = mask.trim();
    if (trimmed.length > 4 && !trimmed.startsWith('***')) {
      return `***${trimmed.slice(-4)}`;
    }
    return trimmed;
  }

  private static normalizeDate(dateStr?: string): string | undefined {
    if (!dateStr) return undefined;
    try {
      // Handles 04/10/2026, 2026-10-04, 04-10-2026
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          // Assume DD/MM/YYYY
          const d = parts[0].padStart(2, '0');
          const m = parts[1].padStart(2, '0');
          const y = parts[2].split(' ')[0];
          return `${y}-${m}-${d}T12:00:00.000Z`;
        }
      }
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    } catch {
      // ignore date formatting errors
    }
    return undefined;
  }

  /**
   * Deterministic local merchant normalizer.
   * Strips POS terminal clutter, branch codes, and common artifacts.
   */
  public static normalizeMerchant(rawName: string): string {
    const clean = rawName
      .replace(/\bPOS\s*\d+\b/gi, '')
      .replace(/\bBR\s*\d+\b/gi, '')
      .replace(/\bPLC\b/gi, '')
      .replace(/\bLTD\b/gi, '')
      .replace(/[*#_]+/g, ' ')
      .trim();

    const lower = clean.toLowerCase();
    if (lower.includes('kaldi')) return "Kaldi's Coffee";
    if (lower.includes('shoa') || lower.includes('showa')) return 'Shoa Supermarket';
    if (lower.includes('total')) return 'TotalEnergies';
    if (lower.includes('oil') || lower.includes('oilibya')) return 'Ola Energy';
    if (lower.includes('safari')) return 'Safari Mart';
    if (lower.includes('ride')) return 'RIDE Transport';
    if (lower.includes('feres')) return 'Feres Transport';
    if (lower.includes('ethio telecom') || lower.includes('airtime')) return 'Ethio Telecom Airtime';

    return clean || rawName;
  }
}
