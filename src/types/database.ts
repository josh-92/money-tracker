/**
 * Strict TypeScript Data Models for Local SQLite Vault
 * Enforces the approved v2.0.0 Architecture Blueprint with full audit trail.
 */

export type ProviderKey = 'CBE' | 'TELEBIRR' | 'AWASH' | 'CASH' | 'CUSTOM';

export type TransactionType =
  | 'EXPENSE'
  | 'INCOME'
  | 'TRANSFER'
  | 'OPENING_BALANCE'
  | 'RECONCILIATION';

export type TransactionSource =
  | 'NOTIFICATION'
  | 'SMS'
  | 'CLIPBOARD'
  | 'RECEIPT'
  | 'MANUAL';

export type TransactionStatus =
  | 'CONFIRMED'
  | 'PENDING_REVIEW'
  | 'IGNORED';

export type AiOperationType =
  | 'RECEIPT'
  | 'SMS_FALLBACK'
  | 'MERCHANT'
  | 'CATEGORY'
  | 'MONTHLY_ANALYSIS';

export type MatchConfidence =
  | 'EXACT_REFERENCE'
  | 'HIGH_METADATA'
  | 'PROXIMITY_AMOUNT'
  | 'NONE';

export interface MatchResult {
  matchFound: boolean;
  transaction: Transaction | null;
  confidence: MatchConfidence;
  matchReason: string;
}

export interface DuplicateMatchQuery {
  amount: number;
  timestamp: string;
  refNumber?: string | null;
  transactionNumber?: string | null;
  accountId?: string | null;
  cleanMerchant?: string | null;
  toleranceMinutes?: number;
}

export interface VaultProfile {
  id: string;
  fullName: string;
  email: string;
  phoneNumber?: string | null;
  passwordHash: string;
  salt: string;
  passcodeHash?: string | null;
  biometricEnabled: boolean;
  autoLockMinutes: number; // default 5
  themePreference: 'dark' | 'light' | 'system';
  hideBalancesByDefault?: boolean;
  createdAt: string;
}

export interface Account {
  id: string;
  name: string;
  providerKey: ProviderKey;
  accountMask: string; // e.g. "**** 7852"
  currency: string; // "ETB"
  colorHex: string;
  iconName: string;
  isActive: boolean;
  displayOrder: number;
  openingBalance: number;
  calculatedBalance?: number;
}

export interface OpeningBalance {
  id: string;
  accountId: string;
  amount: number;
  effectiveDate: string;
  createdAt: string;
}

/**
 * Transaction Data Model preserving the 3-stage audit trail:
 * 1. Original Source Data (Immutable)
 * 2. Parsed / Inferred Interpretation
 * 3. User Edits & Active State
 */
export interface Transaction {
  // Primary Keys & Relationships
  id: string;
  accountId: string;
  destinationAccountId?: string | null; // Set when type === 'TRANSFER'

  // --- Current Active State (User-editable or active interpretation) ---
  categoryId?: string | null;
  amount: number;
  type: TransactionType;
  merchantName: string;
  cleanMerchant?: string | null;
  notes?: string | null;
  status: TransactionStatus;
  timestamp: string; // ISO 8601
  isDeleted: boolean;

  // --- Immutable Original / Source Data ---
  source: TransactionSource;
  rawSourceMessage?: string | null; // Original untouched bank notification / receipt payload
  sourceTimestamp?: string | null;
  refNumber?: string | null; // Provider Reference (e.g. CBE FT26277, Awash AW9876)
  transactionNumber?: string | null; // Provider sequence / txn ID (e.g. Telebirr CR12345)
  sender?: string | null; // Counterparty sender (for incoming transfer or credit)
  recipient?: string | null; // Counterparty recipient (for P2P transfer or merchant payment)
  balanceAfterTransaction?: number | null; // Balance reported by provider immediately after txn

  // --- Parser & Ingestion Audit Metadata ---
  parserVersion?: string | null; // e.g. 'cbe_regex_v1', 'telebirr_p2p_v1'
  templateId?: string | null; // Template ID matched (e.g. 'telebirr_payment_amharic')
  confidenceScore?: number | null; // 0.0 to 1.0 confidence score
  aiOperationUsed?: AiOperationType | null; // AI operation applied, if any

  // --- User Edit Audit Trail (Preserves original parsed state if modified) ---
  originalAmount?: number | null;
  originalMerchantName?: string | null;
  originalCategoryId?: string | null;
  userEditedAt?: string | null;

  // System Timestamps
  createdAt: string;
  updatedAt: string;

  // Joined fields for display
  accountName?: string;
  categoryName?: string;
  categoryColor?: string;
  categoryIcon?: string;
}

export interface Category {
  id: string;
  name: string;
  iconName: string;
  colorHex: string;
  displayOrder: number;
  isDefault: boolean;
}

export interface Budget {
  id: string;
  categoryId: string;
  monthlyLimit: number;
  month: number; // 1-12
  year: number; // e.g. 2026
}

export interface SavingsGoal {
  id: string;
  title: string;
  targetAmount: number;
  savedAmount: number;
  targetDate: string;
  iconName: string;
  colorHex: string;
  isCompleted: boolean;
}

export interface Receipt {
  id: string;
  transactionId?: string | null;
  localImagePath: string;
  extractedTotal: number;
  extractedTax: number;
  rawJson?: string | null;
  createdAt: string;
  items?: ReceiptItem[];
}

export interface ReceiptItem {
  id: string;
  receiptId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface AiUsageLog {
  id: string;
  timestamp: string;
  operationType: AiOperationType;
  modelId: string;
  promptTokensRecorded?: number | null;
  responseTokensRecorded?: number | null;
  estimatedCategory?: 'LIGHT' | 'MEDIUM' | 'HEAVY' | null;
  latencyMs: number;
  status: 'SUCCESS' | 'FAILED' | 'TIMEOUT';
}

export interface MonthlyFinancialReport {
  id: string;
  month: number;
  year: number;
  summaryHeadline: string;
  contentJson: string; // Structured JSON with highlights, anomalies, suggestions
  createdAt: string;
}
