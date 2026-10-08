/**
 * types.ts
 * Strict typed contracts and schemas for Money Tracker's AI operations.
 * 
 * Rules:
 * 1. AI responses are untrusted and must pass strict validation before entering any transaction workflow.
 * 2. Every result contract explicitly distinguishes:
 *    - Status: SUCCESS, UNCERTAIN, INVALID, DISABLED, ERROR
 *    - Confidence: HIGH, MEDIUM, LOW, NONE
 *    - Source: LOCAL_DETERMINISTIC, GEMINI_AI, FALLBACK
 *    - Validation errors and missing fields
 * 3. Never send unnecessary data across the privacy boundary.
 */

import { TransactionType } from '../types/database';

export type AiResultStatus = 'SUCCESS' | 'UNCERTAIN' | 'INVALID' | 'DISABLED' | 'ERROR';
export type AiConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
export type AiResultSource = 'LOCAL_DETERMINISTIC' | 'GEMINI_AI' | 'FALLBACK';

export interface AiOperationResult<T> {
  status: AiResultStatus;
  confidence: AiConfidence;
  source: AiResultSource;
  data: T | null;
  validationErrors: string[];
  missingFields: string[];
  errorMessage?: string;
  latencyMs?: number;
}

// --- 1. Receipt Extraction Contracts ---

export interface ExtractedReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ExtractedReceiptData {
  merchantName: string;
  transactionDate: string; // ISO YYYY-MM-DD
  transactionTime?: string; // HH:MM
  currency: string;
  totalAmount: number;
  taxAmount: number;
  categoryHint?: string;
  items: ExtractedReceiptItem[];
  rawMerchantName?: string;
}

export type ReceiptParsingResult = AiOperationResult<ExtractedReceiptData>;

// --- 2. Unknown Message / SMS Extraction Contracts ---

export interface ExtractedSmsData {
  amount: number;
  currency: string;
  merchantName: string;
  cleanMerchant: string;
  type: TransactionType;
  sender?: string;
  recipient?: string;
  balance?: number;
  refNumber?: string;
  confidenceScore: number;
}

export type SmsParsingResult = AiOperationResult<ExtractedSmsData>;

// --- 3. Merchant Normalization Contracts ---

export interface NormalizedMerchantData {
  cleanMerchant: string;
  rawMerchant: string;
  knownEntity: boolean;
  categorySuggestion?: string;
}

export type MerchantNormalizationResult = AiOperationResult<NormalizedMerchantData>;

// --- 4. Transaction Categorization Contracts ---

export interface CategorizationData {
  categoryId: string; // e.g., 'cat_food'
  categoryName: string; // e.g., 'Food & Dining'
  reasoning?: string;
}

export type CategorizationResult = AiOperationResult<CategorizationData>;

// --- 5. Dashboard Summary & Insights Contracts ---

export interface DashboardSummaryDigest {
  monthName: string;
  year: number;
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  topSpendingCategory?: { id: string; name: string; amount: number; percentage: number };
  recentSpendingVelocity?: 'INCREASING' | 'STABLE' | 'DECREASING';
}

export interface DashboardInsightsResult {
  headline: string;
  keyInsights: string[];
  suggestedAction?: string;
}

// --- 6. Monthly Financial Analysis Contracts ---

export interface MonthlyAnalysisDigest {
  monthName: string;
  year: number;
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  topCategories: Array<{ name: string; amount: number; percentage: number }>;
  topMerchants: Array<{ merchant: string; amount: number }>;
}

export interface MonthlyAnalysisResult {
  summaryHeadline: string;
  keyHighlights: string[];
  anomalies: string[];
  actionableSavingsTips: string[];
}

// --- 7. Visual AI Financial Summary & Cockpit Insights ---

export type VisualInsightType =
  | 'SPENDING_CONCENTRATION'
  | 'UNCATEGORIZED'
  | 'CATEGORY_HIGHLIGHT'
  | 'MERCHANT_PATTERN'
  | 'ACCOUNT_USAGE'
  | 'TRANSACTION_ACTIVITY'
  | 'AVERAGE_EXPENSE'
  | 'LARGEST_EXPENSE'
  | 'CASH_FLOW'
  | 'MOM_CHANGE';

export interface VisualInsightCard {
  id: string;
  type: VisualInsightType;
  title: string; // e.g. "TOP SPENDING", "NEEDS ATTENTION", "MOST USED ACCOUNT", "SPENDING TREND"
  badgeText?: string; // e.g. "29% of expenses", "7 items", "12% lower"
  badgeVariant?: 'primary' | 'warning' | 'income' | 'expense' | 'neutral';
  primaryMetric: string; // e.g. "Food & Dining", "640 ETB", "Telebirr"
  secondaryMetric?: string; // e.g. "2,450 ETB spent", "4,280 ETB"
  supportingValue?: number; // numerical value strictly matching local fact
  explanation: string; // concise insight explanation
  categoryId?: string;
  accountId?: string;
  merchantName?: string;
}

export interface LocalFinancialDigest {
  month: number;
  monthName: string;
  year: number;
  // Cash Flow & Totals
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  // Month-Over-Month
  prevMonthExpense?: number;
  momExpenseChangePct?: number; // e.g. -12 for 12% decrease
  // Transaction Activity
  expenseCount: number;
  incomeCount: number;
  transferCount: number;
  averageExpenseAmount: number;
  // Largest Transaction
  largestExpense?: {
    merchant: string;
    amount: number;
    categoryName?: string;
  };
  // Categories
  topCategories: Array<{
    id: string;
    name: string;
    amount: number;
    percentage: number;
    color: string;
  }>;
  top2ConcentrationPct?: number; // e.g. 62
  // Uncategorized
  uncategorizedCount: number;
  uncategorizedTotalAmount: number;
  // Accounts
  accountBreakdown: Array<{
    id: string;
    name: string;
    providerKey: string;
    spentAmount: number;
    txCount: number;
  }>;
  // Top Merchants
  topMerchants: Array<{
    merchant: string;
    amount: number;
    count: number;
  }>;
}

export interface VisualFinancialSummaryResult {
  summaryHeadline: string;
  monthName: string;
  year: number;
  totalExpenseFormatted: string;
  momChangeText?: string;
  momChangeDirection?: 'UP' | 'DOWN' | 'FLAT';
  insightCards: VisualInsightCard[];
  observationSummary: string; // "💡 What stands out..."
  isAiGenerated: boolean;
  cachedAt?: string;
  dataFingerprint?: string; // Fingerprint of underlying SQLite data used to generate this analysis
  isStale?: boolean; // True if current database digest does not match dataFingerprint
}

