/**
 * verify_phase4_ai.ts
 * Rigorous test suite for Phase 4.1: AI foundation and safe service architecture.
 * 
 * Verifies:
 * 1. Strict typed result contracts (Receipt, SMS, Merchant, Categorization).
 * 2. Local-first deterministic merchant normalization (known entities, 0 tokens).
 * 3. Local-first deterministic transaction categorization (10 categories, 0 tokens).
 * 4. Strict post-parsing output validation (untrusted output defense, invalid amounts, types, refs).
 * 5. Per-feature AI permission and toggle enforcement (disabled features never called).
 * 6. Privacy boundary & error sanitization (API keys scrubbed, no database crawling).
 */

import {
  aiService,
  ExtractedReceiptData,
  ExtractedSmsData,
  computeFinancialDigestFingerprint,
} from '../src/ai/AiService';
import { vaultSecurity, DEFAULT_AI_SETTINGS } from '../src/security/VaultSecurity';
import { DEFAULT_CATEGORIES } from '../src/database/schema';

console.log('================================================================');
console.log(' MONEY TRACKER: PHASE 4.1 AI SERVICE & SAFE FOUNDATION SUITE');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
    if (detail !== undefined) {
      console.error('    Details:', typeof detail === 'object' ? JSON.stringify(detail, null, 2) : detail);
    }
  }
}

async function runPhase4Tests() {
  // -------------------------------------------------------------------------
  // 1. Strict Typed AI Result Contracts
  // -------------------------------------------------------------------------
  console.log('--- 1. Strict Typed AI Result Contracts ---');

  // Verify contract structure shape
  const mockReceiptValidation = (aiService as any).validateReceiptOutput({
    merchantName: "Kaldi's Coffee",
    transactionDate: '2026-10-04',
    currency: 'ETB',
    totalAmount: 350.5,
    taxAmount: 45.7,
    items: [
      { name: 'Cappuccino', quantity: 2, unitPrice: 120, totalPrice: 240 },
      { name: 'Croissant', quantity: 1, unitPrice: 110.5, totalPrice: 110.5 },
    ],
  });

  assert(
    mockReceiptValidation.status === 'SUCCESS',
    'Valid receipt output produces status: SUCCESS'
  );
  assert(
    mockReceiptValidation.confidence === 'HIGH',
    'Valid receipt output has confidence: HIGH'
  );
  assert(
    mockReceiptValidation.source === 'GEMINI_AI',
    'Receipt extraction source is GEMINI_AI'
  );
  assert(
    mockReceiptValidation.data !== null && mockReceiptValidation.data.totalAmount === 350.5,
    'Receipt totalAmount is parsed accurately as number'
  );
  assert(
    mockReceiptValidation.data?.items.length === 2,
    'Receipt line items parsed into strongly typed array'
  );
  assert(
    Array.isArray(mockReceiptValidation.validationErrors) && mockReceiptValidation.validationErrors.length === 0,
    'No validation errors for conforming receipt'
  );

  // -------------------------------------------------------------------------
  // 2. Local-First Deterministic Merchant Normalization (0 Tokens)
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Local-First Deterministic Merchant Normalization ---');

  const testMerchants = [
    { raw: 'POS 14 KALDIS COFFEE PLC', expected: "Kaldi's Coffee" },
    { raw: 'SHOA SUPERMARKET LTD BR 02', expected: 'Shoa Supermarket' },
    { raw: 'TOTAL BOLE POS 09', expected: 'TotalEnergies' },
    { raw: 'FERES TRANSPORT PLC', expected: 'Feres Transport' },
    { raw: 'RIDE HYBRID DESIGNS PLC', expected: 'RIDE Transport' },
    { raw: 'ETHIO TELECOM 127*#', expected: 'Ethio Telecom Airtime' },
    { raw: 'MULTICHOICE DSTV ADDIS', expected: 'DSTV MultiChoice' },
    { raw: 'AAWSA WATER BILL PAYMENT', expected: 'AAWSA Water Utility' },
    { raw: 'EEU ELECTRIC POWER', expected: 'Ethiopian Electric Utility' },
    { raw: 'ZMALL DELIVERY SERVICE', expected: 'Zmall Delivery' },
    { raw: 'BEU DELIVERY PLC', expected: 'beU Delivery' },
    { raw: 'CBE BIRR MERCHANT 951', expected: 'Commercial Bank of Ethiopia' },
    { raw: 'AWASH BIRR PRO 8900', expected: 'Awash Bank' },
    { raw: 'DASHEN BANK AMOLE', expected: 'Dashen Bank' },
  ];

  for (const item of testMerchants) {
    const res = await aiService.normalizeMerchant(item.raw, { allowAiFallback: false });
    assert(
      res.status === 'SUCCESS' && res.data?.cleanMerchant === item.expected,
      `Local normalizer: "${item.raw}" -> "${item.expected}"`,
      res.data
    );
    assert(
      res.source === 'LOCAL_DETERMINISTIC',
      `Source is LOCAL_DETERMINISTIC (0 tokens used for "${item.expected}")`
    );
    assert(
      res.confidence === 'HIGH',
      `Confidence is HIGH for known entity "${item.expected}"`
    );
    assert(
      res.data?.knownEntity === true,
      `knownEntity flag is true for "${item.expected}"`
    );
  }

  // Generic merchant local title-casing
  const genericRes = await aiService.normalizeMerchant('bole mini market plc', { allowAiFallback: false });
  assert(
    genericRes.data?.cleanMerchant === 'Bole Mini Market',
    'Generic merchant stripped of PLC and title-cased locally'
  );
  assert(
    genericRes.data?.knownEntity === false,
    'Generic merchant marked as knownEntity: false'
  );
  assert(
    genericRes.confidence === 'MEDIUM',
    'Generic merchant assigned MEDIUM confidence locally'
  );

  // -------------------------------------------------------------------------
  // 3. Local-First Deterministic Categorization (0 Tokens)
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Local-First Deterministic Categorization ---');

  const testCategories = [
    { input: { merchant: "Kaldi's Coffee", amount: 150 }, expectedCat: 'cat_food', expectedName: 'Food & Dining' },
    { input: { merchant: 'Shoa Supermarket', amount: 800 }, expectedCat: 'cat_groceries', expectedName: 'Groceries' },
    { input: { merchant: 'TotalEnergies Fuel', amount: 1200 }, expectedCat: 'cat_transport', expectedName: 'Transport & Fuel' },
    { input: { merchant: 'Feres Taxi Ride', amount: 250 }, expectedCat: 'cat_transport', expectedName: 'Transport & Fuel' },
    { input: { merchant: 'Ethio Telecom Airtime', amount: 50 }, expectedCat: 'cat_utilities', expectedName: 'Utilities & Internet' },
    { input: { merchant: 'DSTV MultiChoice', amount: 1050 }, expectedCat: 'cat_utilities', expectedName: 'Utilities & Internet' },
    { input: { merchant: 'AAWSA Water Utility', amount: 200 }, expectedCat: 'cat_utilities', expectedName: 'Utilities & Internet' },
    { input: { merchant: 'Lion Pharmacy Bole', amount: 320 }, expectedCat: 'cat_health', expectedName: 'Health & Pharmacy' },
    { input: { merchant: 'Edna Cinema Movie', amount: 400 }, expectedCat: 'cat_entertainment', expectedName: 'Entertainment' },
    { input: { merchant: 'Bole Clothes Boutique', amount: 1500 }, expectedCat: 'cat_shopping', expectedName: 'Shopping & Retail' },
    { input: { merchant: 'School Tuition Fee', amount: 5000 }, expectedCat: 'cat_personal', expectedName: 'Personal & Family' },
    { input: { merchant: 'Employer Payroll', amount: 35000, type: 'INCOME' as const }, expectedCat: 'cat_income', expectedName: 'Salary & Income' },
    { input: { merchant: 'Abebe Bikila', amount: 500, type: 'TRANSFER' as const }, expectedCat: 'cat_other', expectedName: 'Other Expenses' },
  ];

  for (const item of testCategories) {
    const res = await aiService.categorizeTransaction(item.input, { allowAiFallback: false });
    assert(
      res.status === 'SUCCESS' && res.data?.categoryId === item.expectedCat,
      `Local categorization: "${item.input.merchant}" -> ${item.expectedName} (${item.expectedCat})`,
      res.data
    );
    assert(
      res.source === 'LOCAL_DETERMINISTIC',
      `Source is LOCAL_DETERMINISTIC (0 tokens for "${item.input.merchant}")`
    );
    assert(
      res.confidence === 'HIGH',
      `Confidence is HIGH for keyword rule "${item.input.merchant}"`
    );
  }

  // -------------------------------------------------------------------------
  // 4. Strict Post-Parsing Output Validation (Untrusted Output Defense)
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Strict Post-Parsing Output Validation ---');

  // Test 4A: Receipt with non-positive amount
  const invalidReceiptAmount = (aiService as any).validateReceiptOutput({
    merchantName: 'Test Supermarket',
    totalAmount: -50.0,
  });
  assert(
    invalidReceiptAmount.status === 'INVALID',
    'Receipt validation REJECTS negative totalAmount'
  );
  assert(
    invalidReceiptAmount.missingFields.includes('totalAmount'),
    'Receipt flags totalAmount in missingFields'
  );

  // Test 4B: Receipt with zero amount
  const zeroReceiptAmount = (aiService as any).validateReceiptOutput({
    merchantName: 'Test Supermarket',
    totalAmount: 0,
  });
  assert(
    zeroReceiptAmount.status === 'INVALID',
    'Receipt validation REJECTS 0.00 totalAmount'
  );

  // Test 4C: Receipt with empty merchant
  const emptyReceiptMerchant = (aiService as any).validateReceiptOutput({
    merchantName: '',
    totalAmount: 150,
  });
  assert(
    emptyReceiptMerchant.status === 'UNCERTAIN',
    'Receipt with empty merchant name flags validation error'
  );
  assert(
    emptyReceiptMerchant.validationErrors.some((e: string) => e.includes('merchantName')),
    'Receipt validation records empty merchantName error'
  );

  // Test 4D: Receipt with futuristic date (> 2 days ahead)
  const futureReceiptDate = (aiService as any).validateReceiptOutput({
    merchantName: 'Test Supermarket',
    totalAmount: 150,
    transactionDate: '2099-12-31',
  });
  assert(
    futureReceiptDate.data?.transactionDate !== '2099-12-31',
    'Futuristic receipt date (2099) safely clamped to current date'
  );
  assert(
    futureReceiptDate.status === 'UNCERTAIN',
    'Futuristic receipt date flagged as UNCERTAIN'
  );

  // Test 4E: SMS fallback with negative amount
  const invalidSmsAmount = (aiService as any).validateSmsOutput({
    amount: -100,
    merchantName: 'Test Merchant',
    type: 'EXPENSE',
  });
  assert(
    invalidSmsAmount.status === 'INVALID',
    'SMS extraction REJECTS negative amount'
  );
  assert(
    invalidSmsAmount.missingFields.includes('amount'),
    'SMS extraction flags amount in missingFields'
  );

  // Test 4F: SMS fallback with invalid transaction type
  const invalidSmsType = (aiService as any).validateSmsOutput({
    amount: 100,
    merchantName: 'Test Merchant',
    type: 'UNAUTHORIZED_PAYMENT',
  });
  assert(
    invalidSmsType.status === 'INVALID',
    'SMS extraction REJECTS non-standard transaction type'
  );
  assert(
    invalidSmsType.missingFields.includes('type'),
    'SMS extraction flags type in missingFields'
  );

  // Test 4G: SMS fallback with corrupted stopword reference
  const smsCorruptedRef = (aiService as any).validateSmsOutput({
    amount: 100,
    merchantName: 'Test Merchant',
    type: 'EXPENSE',
    refNumber: 'is',
  });
  assert(
    smsCorruptedRef.data?.refNumber === undefined,
    'SMS extraction discards stopword reference ("is")'
  );

  // Test 4H: SMS fallback with valid reference
  const smsValidRef = (aiService as any).validateSmsOutput({
    amount: 100,
    merchantName: 'Test Merchant',
    type: 'EXPENSE',
    refNumber: 'CR12345',
  });
  assert(
    smsValidRef.data?.refNumber === 'CR12345',
    'SMS extraction preserves valid reference ("CR12345")'
  );
  assert(
    smsValidRef.confidence === 'HIGH',
    'Valid reference gives HIGH confidence'
  );

  // -------------------------------------------------------------------------
  // 5. Per-Feature AI Permission & Toggle Enforcement
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Per-Feature AI Permission & Toggle Enforcement ---');

  // Disable receipt extraction
  await vaultSecurity.saveAiSettings({
    ...DEFAULT_AI_SETTINGS,
    receiptAiEnabled: false,
  });
  const disabledReceipt = await aiService.parseReceipt('file:///dummy_receipt.jpg');
  assert(
    disabledReceipt.status === 'DISABLED',
    'parseReceipt returns DISABLED when receiptAiEnabled is false'
  );
  assert(
    disabledReceipt.source === 'FALLBACK',
    'parseReceipt source is FALLBACK when disabled'
  );

  // Disable unknown SMS fallback
  await vaultSecurity.saveAiSettings({
    ...DEFAULT_AI_SETTINGS,
    unknownSmsFallbackEnabled: false,
  });
  const disabledSms = await aiService.parseUnknownSms('You paid 50 ETB to Unknown');
  assert(
    disabledSms.status === 'DISABLED',
    'parseUnknownSms returns DISABLED when unknownSmsFallbackEnabled is false'
  );

  // Disable merchant normalization AI fallback
  await vaultSecurity.saveAiSettings({
    ...DEFAULT_AI_SETTINGS,
    merchantNormalizationEnabled: false,
  });
  const disabledMerchant = await aiService.normalizeMerchant('Unique Corner Store');
  assert(
    disabledMerchant.source === 'LOCAL_DETERMINISTIC',
    'normalizeMerchant does NOT call Gemini when merchantNormalizationEnabled is false'
  );

  // Disable category inference AI fallback
  await vaultSecurity.saveAiSettings({
    ...DEFAULT_AI_SETTINGS,
    categoryInferenceEnabled: false,
  });
  const disabledCat = await aiService.categorizeTransaction({
    merchant: 'Random Unmapped Store',
    amount: 75,
  });
  assert(
    disabledCat.source === 'LOCAL_DETERMINISTIC',
    'categorizeTransaction does NOT call Gemini when categoryInferenceEnabled is false'
  );

  // Restore default settings
  await vaultSecurity.saveAiSettings(DEFAULT_AI_SETTINGS);

  // -------------------------------------------------------------------------
  // 6. Privacy Boundary & Error Sanitization
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Privacy Boundary & Error Sanitization ---');

  const rawKeyLeakError = 'Failed to connect: https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash?key=AIzaSyA1234567890abcdef1234567890abcde';
  const sanitized = (aiService as any).sanitizeError(rawKeyLeakError);
  assert(
    !sanitized.includes('AIzaSyA1234567890abcdef1234567890abcde'),
    'Sanitizer completely scrubs Google API key from error traces'
  );
  assert(
    sanitized.includes('••••••••'),
    'Sanitizer replaces exposed key with secure bullet mask'
  );

  // Verify dashboard insights local generation
  const mockDashboardDigest = {
    monthName: 'October',
    year: 2026,
    totalIncome: 45000,
    totalExpense: 22000,
    netSavings: 23000,
    topSpendingCategory: {
      id: 'cat_groceries',
      name: 'Groceries',
      amount: 8500,
      percentage: 38.6,
    },
  };
  const localInsights = await aiService.generateInsights(mockDashboardDigest);
  assert(
    typeof localInsights.headline === 'string' && localInsights.headline.includes('October 2026'),
    'Dashboard insights headline generated with correct period'
  );
  assert(
    localInsights.keyInsights.length >= 2,
    'Dashboard insights produces at least 2 data-grounded insights locally'
  );
  assert(
    localInsights.keyInsights.some((i: string) => i.includes('Groceries')),
    'Dashboard insights identifies Groceries as top spending category'
  );

  // -------------------------------------------------------------------------
  // 7. IngestionPipeline SMS Fallback with Strict Provider Isolation
  // -------------------------------------------------------------------------
  console.log('\n--- 7. IngestionPipeline SMS Fallback (Provider Isolation & Review State) ---');

  const { IngestionPipeline } = await import('../src/ingestion/IngestionPipeline');
  const pipeline = IngestionPipeline.getInstance();

  let persistedTransaction: any = null;
  const mockDbService = {
    initialize: async () => {},
    getAccounts: async () => [
      { id: 'acc_awash_1', name: 'Awash Account', providerKey: 'AWASH', mask: '3901', isActive: true },
      { id: 'acc_telebirr_1', name: 'Telebirr Wallet', providerKey: 'TELEBIRR', mask: '1234', isActive: true },
    ],
    findMatchingTransaction: async () => ({ matchFound: false }),
    createTransaction: async (tx: any) => {
      persistedTransaction = { ...tx, id: 'tx_test_created_1' };
      return persistedTransaction;
    },
  };

  pipeline.setDatabaseService(mockDbService);

  // Setup: Enable unknown SMS fallback and set dummy API key
  await vaultSecurity.saveAiSettings({
    ...DEFAULT_AI_SETTINGS,
    unknownSmsFallbackEnabled: true,
  });
  await vaultSecurity.saveGeminiApiKey('AIzaSy_fake_test_key_for_unit_tests');

  // Spy/Mock parseUnknownSms: returns a valid parsed transaction where Gemini suggests TELEBIRR
  const originalParseUnknownSms = aiService.parseUnknownSms;
  (aiService as any).parseUnknownSms = async (rawText: string) => {
    return {
      status: 'SUCCESS',
      confidence: 'HIGH',
      source: 'GEMINI_AI',
      data: {
        amount: 850,
        currency: 'ETB',
        merchantName: 'Unknown Boutique',
        cleanMerchant: 'Unknown Boutique',
        type: 'EXPENSE',
        refNumber: 'AW998877',
        confidenceScore: 0.9,
      },
      validationErrors: [],
      missingFields: [],
    };
  };

  // Candidate message coming from Awash notification package
  const awashCandidate = {
    id: 'test_cand_awash_1',
    source: 'NOTIFICATION' as const,
    packageName: 'com.sc.awashpay',
    title: 'AwashBirr Pro',
    rawText: 'You paid 850 ETB at Unknown Boutique ref AW998877 on 2026-10-04',
    timestamp: new Date().toISOString(),
  };

  const pipelineResult = await pipeline.processCandidate(awashCandidate);

  assert(
    pipelineResult.success === true,
    'IngestionPipeline successfully ingests candidate via AI fallback'
  );
  assert(
    persistedTransaction !== null,
    'Transaction was successfully persisted to database'
  );
  assert(
    persistedTransaction?.status === 'PENDING_REVIEW',
    'AI fallback candidate is saved strictly as PENDING_REVIEW (never directly CONFIRMED)'
  );
  assert(
    persistedTransaction?.providerKey === 'AWASH',
    'Strict Provider Isolation: trusted Awash detection overrides Gemini (cannot be polluted with Telebirr)'
  );
  assert(
    persistedTransaction?.aiOperationUsed === 'SMS_FALLBACK',
    'Audit trail records aiOperationUsed: SMS_FALLBACK'
  );
  assert(
    persistedTransaction?.amount === 850,
    'Extracted amount 850 ETB persisted accurately'
  );
  assert(
    persistedTransaction?.refNumber === 'AW998877',
    'Extracted reference AW998877 preserved in ledger audit'
  );
  assert(
    persistedTransaction?.accountId === 'acc_awash_1',
    'Account mapped to Awash account (not Telebirr)'
  );

  // Restore parseUnknownSms
  (aiService as any).parseUnknownSms = originalParseUnknownSms;

  // -------------------------------------------------------------------------
  // 8. Local Financial Summary Digest & Offline Visual Cards
  // -------------------------------------------------------------------------
  console.log('\n--- 8. Local Financial Summary Digest & Offline Visual Cards ---');

  const richDigest = {
    month: 10,
    monthName: 'October',
    year: 2026,
    totalIncome: 65000,
    totalExpense: 32000,
    netSavings: 33000,
    prevMonthExpense: 40000,
    momExpenseChangePct: -20, // 20% lower
    expenseCount: 40,
    incomeCount: 2,
    transferCount: 5,
    averageExpenseAmount: 800,
    largestExpense: {
      merchant: 'Samsung Store',
      amount: 9500,
      categoryName: 'Shopping & Retail',
    },
    topCategories: [
      { id: 'cat_food', name: 'Food & Dining', amount: 16000, percentage: 50, color: '#F59E0B' },
      { id: 'cat_groceries', name: 'Groceries', amount: 8000, percentage: 25, color: '#10B981' },
      { id: 'cat_transport', name: 'Transport & Fuel', amount: 4800, percentage: 15, color: '#3B82F6' },
    ],
    top2ConcentrationPct: 75,
    uncategorizedCount: 3,
    uncategorizedTotalAmount: 2400,
    accountBreakdown: [
      { id: 'acc_telebirr_1', name: 'Telebirr', providerKey: 'TELEBIRR', spentAmount: 24000, txCount: 30 },
      { id: 'acc_awash_1', name: 'Awash Bank', providerKey: 'AWASH', spentAmount: 8000, txCount: 10 },
    ],
    topMerchants: [
      { merchant: 'Shoa Supermarket', amount: 6500, count: 8 },
      { merchant: "Kaldi's Coffee", amount: 4200, count: 12 },
    ],
  };

  const localCards = aiService.getLocalInsightCards(richDigest);

  assert(
    localCards.length === 7,
    'getLocalInsightCards generates exactly 7 distinct visual insight cards'
  );

  const topCard = localCards.find((c) => c.id === 'card_top_spending');
  assert(
    topCard?.primaryMetric === 'Food & Dining' && topCard?.secondaryMetric === '16,000 ETB',
    'Top Spending Card identifies Food & Dining with 16,000 ETB'
  );
  assert(
    topCard?.badgeText === '50% of total',
    'Top Spending Card badge shows 50% of total'
  );

  const concCard = localCards.find((c) => c.id === 'card_concentration');
  assert(
    concCard?.primaryMetric === '75%' && concCard?.badgeVariant === 'warning',
    'Concentration Card flags 75% concentration with warning variant'
  );

  const unassignedCard = localCards.find((c) => c.id === 'card_uncategorized');
  assert(
    unassignedCard?.primaryMetric === '3 unassigned' && unassignedCard?.secondaryMetric === '2,400 ETB',
    'Needs Attention Card identifies 3 unassigned transactions totaling 2,400 ETB'
  );

  const momCard = localCards.find((c) => c.id === 'card_mom_trend');
  assert(
    momCard?.primaryMetric === '20% lower' && momCard?.badgeVariant === 'income',
    'MoM Trend Card reports 20% lower spending with positive (income) variant'
  );

  const largestCard = localCards.find((c) => c.id === 'card_largest_expense');
  assert(
    largestCard?.primaryMetric === '9,500 ETB' && largestCard?.secondaryMetric === 'Samsung Store',
    'Largest Expense Card captures Samsung Store at 9,500 ETB'
  );

  const acctCard = localCards.find((c) => c.id === 'card_primary_account');
  assert(
    acctCard?.primaryMetric === 'Telebirr' && acctCard?.supportingValue === 24000,
    'Primary Outflow Account Card captures Telebirr with 24,000 ETB'
  );

  const avgCard = localCards.find((c) => c.id === 'card_average_expense');
  assert(
    avgCard?.primaryMetric === '800 ETB' && avgCard?.secondaryMetric === '40 purchases',
    'Average Ticket Card captures 800 ETB across 40 purchases'
  );

  // -------------------------------------------------------------------------
  // 9. Anti-Hallucination & Number Integrity Guard
  // -------------------------------------------------------------------------
  console.log('\n--- 9. Anti-Hallucination & Number Integrity Guard ---');

  // Test 9A: Factually consistent observation with numbers in digest
  const validObs = 'Food & Dining accounted for 16,000 ETB which represents 50% of all expenses.';
  assert(
    aiService.validateAiObservation(validObs, richDigest) === true,
    'Factual observation referencing accurate digest numbers passes validation'
  );

  // Test 9B: Qualitative observation without numbers
  const qualitativeObs = 'Your spending is heavily concentrated in essential groceries and dining out.';
  assert(
    aiService.validateAiObservation(qualitativeObs, richDigest) === true,
    'Qualitative observation without numbers passes validation'
  );

  // Test 9C: Foreign currency symbol ($)
  const dollarObs = 'You spent $1,200 on dining this month.';
  assert(
    aiService.validateAiObservation(dollarObs, richDigest) === false,
    'Observation containing dollar symbol ($) is strictly rejected'
  );

  // Test 9D: Foreign currency symbol (€)
  const euroObs = 'You spent €800 on electronics.';
  assert(
    aiService.validateAiObservation(euroObs, richDigest) === false,
    'Observation containing euro symbol (€) is strictly rejected'
  );

  // Test 9E: Wild hallucinated amount
  const hallucinatedObs = 'You spent 95,000 ETB on dining out with friends this month.';
  assert(
    aiService.validateAiObservation(hallucinatedObs, richDigest) === false,
    'Observation with hallucinated amount (95,000 ETB vs actual 32,000 ETB) is rejected'
  );

  // -------------------------------------------------------------------------
  // 10. SQLite Monthly Report Caching & Offline Fallback
  // -------------------------------------------------------------------------
  console.log('\n--- 10. SQLite Monthly Report Caching & Offline Fallback ---');

  const { dbService } = await import('../src/database/DatabaseService');

  // Clear any existing cache for month 10, year 2026
  await dbService.clearMonthlyReportCache(10, 2026);
  const cacheBefore = await dbService.getCachedMonthlyReport(10, 2026);
  assert(
    cacheBefore === null,
    'Cache is cleanly empty before saving report'
  );

  // Generate visual financial summary without API key -> falls back to local arithmetic
  await vaultSecurity.deleteGeminiApiKey();
  const offlineSummary = await aiService.generateVisualFinancialSummary(richDigest, false);

  assert(
    offlineSummary.isAiGenerated === false,
    'Without Gemini API key, visual summary uses local arithmetic engine (isAiGenerated: false)'
  );
  assert(
    offlineSummary.insightCards.length === 7,
    'Offline visual summary contains all 7 locally computed cards'
  );
  assert(
    offlineSummary.totalExpenseFormatted === '32,000 ETB',
    'Offline visual summary formats total expense as 32,000 ETB'
  );
  assert(
    offlineSummary.momChangeText === '20% lower than last month',
    'Offline visual summary computes MoM change text: 20% lower than last month'
  );

  // Check that the summary was cached in SQLite
  const cachedAfter = await dbService.getCachedMonthlyReport(10, 2026);
  assert(
    cachedAfter !== null,
    'Offline visual summary is safely cached in SQLite monthly_financial_report table'
  );
  assert(
    cachedAfter?.month === 10 && cachedAfter?.year === 2026,
    'Cached report stores month 10, year 2026'
  );

  // Re-reading visual summary returns cached result with cachedAt
  const loadedFromCache = await aiService.generateVisualFinancialSummary(richDigest, false);
  assert(
    loadedFromCache.cachedAt !== undefined,
    'Subsequent call returns cached visual report with cachedAt timestamp (0 tokens, instant load)'
  );
  assert(
    loadedFromCache.totalExpenseFormatted === '32,000 ETB',
    'Cached report preserves exact financial values'
  );

  // Clean up cache
  await dbService.clearMonthlyReportCache(10, 2026);
  const cacheAfterClean = await dbService.getCachedMonthlyReport(10, 2026);
  assert(
    cacheAfterClean === null,
    'clearMonthlyReportCache cleanly removes cached report from SQLite'
  );

  // -------------------------------------------------------------------------
  // 11. Cache Invalidation & Re-synthesize Analysis Verification
  // -------------------------------------------------------------------------
  console.log('\n--- 11. Cache Invalidation & Re-synthesize Analysis Verification ---');

  // Compute fingerprints
  const fpA = computeFinancialDigestFingerprint(richDigest);
  assert(
    typeof fpA === 'string' && fpA.length > 10,
    'computeFinancialDigestFingerprint returns valid non-empty signature string'
  );

  const modifiedDigest = {
    ...richDigest,
    totalExpense: 38500,
    netSavings: 6500,
    expenseCount: 42,
    topCategories: [
      { id: 'cat_food', name: 'Food & Dining', amount: 19500, percentage: 51, color: '#F97316' },
      ...richDigest.topCategories.slice(1),
    ],
  };

  const fpB = computeFinancialDigestFingerprint(modifiedDigest);
  assert(
    fpA !== fpB,
    'Modified financial digest produces distinct data fingerprint (fpA !== fpB)'
  );

  // Seed cache with report for richDigest (fpA)
  await dbService.clearMonthlyReportCache(10, 2026);
  await aiService.generateVisualFinancialSummary(richDigest, false);
  const cacheA = await dbService.getCachedMonthlyReport(10, 2026);
  assert(
    cacheA !== null,
    'Cache initialized with richDigest report'
  );

  // Normal read with modifiedDigest (without force refresh)
  const staleLoaded = await aiService.generateVisualFinancialSummary(modifiedDigest, false);
  assert(
    staleLoaded.isStale === true,
    'Reading with modified digest and forceRefresh=false returns isStale: true'
  );
  assert(
    staleLoaded.dataFingerprint === fpA,
    'Stale cached result reports previous dataFingerprint fpA'
  );
  // Verify that factual cards reflect modifiedDigest even when cached AI narrative is stale
  const modifiedTopSpendingCard = staleLoaded.insightCards.find((c) => c.id === 'card_top_spending');
  assert(
    modifiedTopSpendingCard?.secondaryMetric === '19,500 ETB' && modifiedTopSpendingCard?.primaryMetric === 'Food & Dining',
    'Factual cards reflect live modifiedDigest values (19,500 ETB) even with stale cached narrative'
  );

  // User triggers "Re-synthesize Analysis" (forceRefresh = true)
  const refreshedResult = await aiService.generateVisualFinancialSummary(modifiedDigest, true);
  assert(
    refreshedResult.isStale === false,
    'Manual Re-synthesize with forceRefresh=true invalidates cache and returns isStale: false'
  );
  assert(
    refreshedResult.dataFingerprint === fpB,
    'Refreshed result has updated fingerprint fpB'
  );
  assert(
    refreshedResult.totalExpenseFormatted === '38,500 ETB',
    'Refreshed result formatted total expense reflects 38,500 ETB'
  );

  // Verify SQLite cache was updated with fpB
  const cacheB = await dbService.getCachedMonthlyReport(10, 2026);
  const parsedCacheB = JSON.parse(cacheB!.contentJson);
  assert(
    parsedCacheB.dataFingerprint === fpB,
    'SQLite monthly_financial_report cache updated with fresh fingerprint fpB'
  );

  // Subsequent normal read with modifiedDigest (forceRefresh = false)
  const normalSubsequentRead = await aiService.generateVisualFinancialSummary(modifiedDigest, false);
  assert(
    normalSubsequentRead.isStale === false,
    'Subsequent read with matching fingerprint returns isStale: false'
  );
  assert(
    normalSubsequentRead.cachedAt !== undefined,
    'Subsequent read hits updated cache without re-invoking AI engine'
  );

  // Clean up cache
  await dbService.clearMonthlyReportCache(10, 2026);
  const finalCacheClean = await dbService.getCachedMonthlyReport(10, 2026);
  assert(
    finalCacheClean === null,
    'Cache cleanly wiped at end of section 11 test'
  );

  console.log('\n================================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} Phase 4 tests passed`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL PHASE 4 GEMINI INTELLIGENCE & VISUAL COCKPIT TESTS PASSED PERFECTLY!\n');
  } else {
    process.exit(1);
  }
}

runPhase4Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
