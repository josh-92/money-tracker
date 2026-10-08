/**
 * AiService.ts
 * Unified application-level AI service backed by Google's official Gemini API.
 * 
 * Core Architectural Principles:
 * 1. Local deterministic logic first (0ms latency, zero tokens, 100% offline).
 * 2. Gemini fallback only when needed and explicitly permitted in user settings.
 * 3. Strict schema validation on all AI outputs — Gemini output is untrusted until verified.
 * 4. Strict privacy boundary: callers provide only minimal necessary fields; no database crawling.
 * 5. Gemini NEVER directly creates or modifies ledger transactions.
 * 6. Honest usage audit logging in local SQLite.
 * 7. Hardened request layer: header-based auth, URL sanitization, timeouts, transient retries.
 */

import * as ImageManipulator from 'expo-image-manipulator';
import { vaultSecurity } from '../security/VaultSecurity';
import { dbService } from '../database/DatabaseService';
import { DEFAULT_CATEGORIES } from '../database/schema';
import { RegexParser } from '../ingestion/RegexParser';
import { TransactionType } from '../types/database';
import {
  ExtractedReceiptData,
  ExtractedReceiptItem,
  ReceiptParsingResult,
  ExtractedSmsData,
  SmsParsingResult,
  NormalizedMerchantData,
  MerchantNormalizationResult,
  CategorizationData,
  CategorizationResult,
  DashboardSummaryDigest,
  DashboardInsightsResult,
  MonthlyAnalysisDigest,
  MonthlyAnalysisResult,
  VisualInsightCard,
  LocalFinancialDigest,
  VisualFinancialSummaryResult,
} from './types';

export * from './types';

// Standard 10 Category Definitions for Local Categorization
interface LocalCategoryRule {
  id: string;
  name: string;
  keywords: string[];
}

const LOCAL_CATEGORY_RULES: LocalCategoryRule[] = [
  {
    id: 'cat_food',
    name: 'Food & Dining',
    keywords: [
      'kaldi', 'cafe', 'coffee', 'restaurant', 'burger', 'pizza', 'kitchen',
      'bakery', 'pastry', 'bar', 'lounge', 'bistro', 'lunch', 'dinner',
      'breakfast', 'food', 'grill', 'roast', 'diner', 'chicken', 'sandwich',
    ],
  },
  {
    id: 'cat_groceries',
    name: 'Groceries',
    keywords: [
      'shoa', 'supermarket', 'grocery', 'market', 'mart', 'fresh corner',
      'hypermarket', 'butchery', 'fruit', 'vegetable', 'meat', 'dairy',
      'bazaar', 'store', 'minimarket', 'safari mart',
    ],
  },
  {
    id: 'cat_transport',
    name: 'Transport & Fuel',
    keywords: [
      'feres', 'ride', 'taxi', 'transport', 'fuel', 'totalenergies', 'ola energy',
      'oil', 'petrol', 'gas', 'parking', 'airport', 'bus', 'ticket', 'aviation',
      'railway', 'train', 'trip', 'driver',
    ],
  },
  {
    id: 'cat_utilities',
    name: 'Utilities & Internet',
    keywords: [
      'ethio telecom', 'airtime', 'internet', 'telecom', 'dstv', 'aawsa',
      'water', 'eeu', 'electric', 'utility', 'power', 'bill', 'solar', 'sewer',
    ],
  },
  {
    id: 'cat_shopping',
    name: 'Shopping & Retail',
    keywords: [
      'boutique', 'clothes', 'shoes', 'fashion', 'electronics', 'hardware',
      'furniture', 'mall', 'retail', 'tailor', 'apparel', 'gadget', 'cosmetics',
    ],
  },
  {
    id: 'cat_health',
    name: 'Health & Pharmacy',
    keywords: [
      'pharmacy', 'drugstore', 'hospital', 'clinic', 'dental', 'doctor',
      'medicine', 'laboratory', 'optical', 'health', 'medicare', 'pharma',
    ],
  },
  {
    id: 'cat_entertainment',
    name: 'Entertainment',
    keywords: [
      'cinema', 'movie', 'theater', 'amusement', 'club', 'concert', 'stadium',
      'bowling', 'game', 'gaming', 'resort', 'event', 'ticketpro',
    ],
  },
  {
    id: 'cat_personal',
    name: 'Personal & Family',
    keywords: [
      'school', 'academy', 'college', 'university', 'education', 'tuition',
      'barber', 'salon', 'spa', 'gift', 'church', 'donation', 'mosque',
      'charity', 'laundry', 'cleaners',
    ],
  },
  {
    id: 'cat_income',
    name: 'Salary & Income',
    keywords: [
      'salary', 'payroll', 'allowance', 'dividend', 'bonus', 'pension',
      'interest', 'refund', 'reimbursement', 'wages',
    ],
  },
  {
    id: 'cat_other',
    name: 'Other Expenses',
    keywords: [],
  },
];

// Dictionary of known Ethiopian corporate and retail entities
const KNOWN_ETHIOPIAN_MERCHANTS: Record<string, { cleanName: string; categoryId: string }> = {
  kaldi: { cleanName: "Kaldi's Coffee", categoryId: 'cat_food' },
  kaldis: { cleanName: "Kaldi's Coffee", categoryId: 'cat_food' },
  shoa: { cleanName: 'Shoa Supermarket', categoryId: 'cat_groceries' },
  showa: { cleanName: 'Shoa Supermarket', categoryId: 'cat_groceries' },
  total: { cleanName: 'TotalEnergies', categoryId: 'cat_transport' },
  totalenergies: { cleanName: 'TotalEnergies', categoryId: 'cat_transport' },
  ola: { cleanName: 'Ola Energy', categoryId: 'cat_transport' },
  oilibya: { cleanName: 'Ola Energy', categoryId: 'cat_transport' },
  safari: { cleanName: 'Safari Mart', categoryId: 'cat_groceries' },
  ride: { cleanName: 'RIDE Transport', categoryId: 'cat_transport' },
  feres: { cleanName: 'Feres Transport', categoryId: 'cat_transport' },
  ethio: { cleanName: 'Ethio Telecom Airtime', categoryId: 'cat_utilities' },
  telebirr: { cleanName: 'Ethio Telecom Airtime', categoryId: 'cat_utilities' },
  dstv: { cleanName: 'DSTV MultiChoice', categoryId: 'cat_utilities' },
  multichoice: { cleanName: 'DSTV MultiChoice', categoryId: 'cat_utilities' },
  aawsa: { cleanName: 'AAWSA Water Utility', categoryId: 'cat_utilities' },
  water: { cleanName: 'AAWSA Water Utility', categoryId: 'cat_utilities' },
  eeu: { cleanName: 'Ethiopian Electric Utility', categoryId: 'cat_utilities' },
  electric: { cleanName: 'Ethiopian Electric Utility', categoryId: 'cat_utilities' },
  zmall: { cleanName: 'Zmall Delivery', categoryId: 'cat_food' },
  beu: { cleanName: 'beU Delivery', categoryId: 'cat_food' },
  enat: { cleanName: 'Enat Bank', categoryId: 'cat_other' },
  awash: { cleanName: 'Awash Bank', categoryId: 'cat_other' },
  cbe: { cleanName: 'Commercial Bank of Ethiopia', categoryId: 'cat_other' },
  dashen: { cleanName: 'Dashen Bank', categoryId: 'cat_other' },
  abyssinia: { cleanName: 'Bank of Abyssinia', categoryId: 'cat_other' },
  zemen: { cleanName: 'Zemen Bank', categoryId: 'cat_other' },
};

interface RequestOptions {
  timeoutMs?: number;
  operationType: 'RECEIPT' | 'SMS_FALLBACK' | 'MERCHANT' | 'CATEGORY' | 'MONTHLY_ANALYSIS';
  estimatedCategory?: 'LIGHT' | 'MEDIUM' | 'HEAVY';
}

class AiService {
  /**
   * Safe credentials resolver.
   */
  private async getApiKeyAndModel(): Promise<{ apiKey: string; modelId: string }> {
    const apiKey = await vaultSecurity.getGeminiApiKey();
    if (!apiKey) {
      throw new Error('Gemini API Key is not configured. Please add your key in Settings.');
    }
    const modelId = await vaultSecurity.getConfiguredModel();
    return { apiKey, modelId };
  }

  /**
   * Strips API keys or credentials from any string to prevent log leakage.
   */
  private sanitizeError(err: any): string {
    const raw = String(err?.message || err || 'Unknown error');
    return raw
      .replace(/key=[A-Za-z0-9_-]+/gi, 'key=••••••••')
      .replace(/x-goog-api-key:\s*[A-Za-z0-9_-]+/gi, 'x-goog-api-key: ••••••••')
      .replace(/AIza[0-9A-Za-z-_]{35}/g, '••••••••');
  }

  /**
   * Preprocesses receipt photos on-device before uploading to Gemini.
   * Scales to max 1024px dimension, compresses to JPEG 80%, converts to base64.
   */
  public async preprocessReceiptImage(uri: string): Promise<{ base64: string; mimeType: string }> {
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1024 } }],
      {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );

    if (!manipulated.base64) {
      throw new Error('Failed to encode image to base64');
    }

    return {
      base64: manipulated.base64,
      mimeType: 'image/jpeg',
    };
  }

  /**
   * Hardened Gemini API request executor.
   * - Transmits key via header 'x-goog-api-key' (not query string URL)
   * - Strips keys from error traces
   * - Enforces AbortController timeout
   * - Performs single retry on transient 503 or network abort
   * - Extracts JSON from markdown fences
   * - Records honest audit log in local SQLite
   */
  private async executeGeminiRequest<T>(
    requestBody: any,
    options: RequestOptions
  ): Promise<{ data: T; latencyMs: number }> {
    const { apiKey, modelId } = await this.getApiKeyAndModel();
    const timeoutMs = options.timeoutMs || 15000;
    const startTime = Date.now();

    // Safe sanitized URL without API key in query parameters
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;

    let attempt = 0;
    const maxAttempts = 2;

    while (attempt < maxAttempts) {
      attempt++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timer);
        const latencyMs = Date.now() - startTime;

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          const errMsg = errJson.error?.message || `HTTP ${response.status}`;

          // If rate limit (429) or transient server error (503), retry once with delay
          if ((response.status === 429 || response.status === 503) && attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          }

          await dbService.logAiUsage({
            operationType: options.operationType,
            modelId,
            latencyMs,
            status: 'FAILED',
            estimatedCategory: options.estimatedCategory || 'LIGHT',
          });

          if (response.status === 401 || response.status === 403) {
            throw new Error('Invalid or unauthorized Gemini API key. Please check your key in Settings.');
          }
          if (response.status === 429) {
            throw new Error('Gemini API quota or rate limit exceeded. Please try again shortly.');
          }
          throw new Error(`Gemini API returned error: ${this.sanitizeError(errMsg)}`);
        }

        const jsonResponse = await response.json();
        const rawText = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) {
          throw new Error('Gemini returned an empty response.');
        }

        // Clean any markdown code blocks that Gemini may produce
        const cleanedText = rawText
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```$/g, '')
          .trim();

        const parsedJson = JSON.parse(cleanedText) as T;
        const usage = jsonResponse.usageMetadata;

        await dbService.logAiUsage({
          operationType: options.operationType,
          modelId,
          promptTokensRecorded: usage?.promptTokenCount,
          responseTokensRecorded: usage?.candidatesTokenCount,
          estimatedCategory: options.estimatedCategory || 'LIGHT',
          latencyMs,
          status: 'SUCCESS',
        });

        return { data: parsedJson, latencyMs };
      } catch (err: any) {
        clearTimeout(timer);
        const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');

        if (isAbort) {
          const latencyMs = Date.now() - startTime;
          await dbService.logAiUsage({
            operationType: options.operationType,
            modelId,
            latencyMs,
            status: 'TIMEOUT',
            estimatedCategory: options.estimatedCategory || 'LIGHT',
          });
          throw new Error(`Gemini request timed out after ${timeoutMs / 1000} seconds.`);
        }

        // Network error retry once
        if (attempt < maxAttempts && !err.message?.includes('Settings')) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          continue;
        }

        const latencyMs = Date.now() - startTime;
        await dbService.logAiUsage({
          operationType: options.operationType,
          modelId,
          latencyMs,
          status: 'FAILED',
          estimatedCategory: options.estimatedCategory || 'LIGHT',
        });
        throw new Error(this.sanitizeError(err));
      }
    }

    throw new Error('Gemini request failed after maximum retry attempts.');
  }

  /**
   * Tests API key validity and returns latency in milliseconds.
   */
  public async testConnection(
    apiKey: string,
    modelId: string
  ): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();
    try {
      // Safe sanitized request
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-goog-api-key': apiKey,
        },
      });
      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        return {
          success: false,
          latencyMs,
          error: this.sanitizeError(errJson.error?.message || `HTTP ${response.status}: Failed to connect`),
        };
      }

      return { success: true, latencyMs };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        error: this.sanitizeError(err.message || 'Network connection failed'),
      };
    }
  }

  // =========================================================================
  // 1. RECEIPT PARSER (Multimodal Gemini Extraction with Strict Validation)
  // =========================================================================

  public async parseReceipt(imageUri: string): Promise<ReceiptParsingResult> {
    const settings = await vaultSecurity.getAiSettings();
    if (!settings.receiptAiEnabled) {
      return {
        status: 'DISABLED',
        confidence: 'NONE',
        source: 'FALLBACK',
        data: null,
        validationErrors: ['Receipt AI extraction is disabled in settings.'],
        missingFields: [],
        errorMessage: 'Receipt AI extraction is disabled in settings.',
      };
    }

    try {
      const { base64, mimeType } = await this.preprocessReceiptImage(imageUri);

      const prompt = `Analyze this paper receipt or invoice from Ethiopia.
Extract:
1. merchantName (string, store or business name)
2. transactionDate (YYYY-MM-DD, e.g. 2026-10-04)
3. transactionTime (HH:MM if printed)
4. currency (usually ETB)
5. totalAmount (positive number, final total paid)
6. taxAmount (number, VAT or TOT amount if printed, else 0)
7. categoryHint (suggested expense category)
8. items (array of line items with name, quantity, unitPrice, totalPrice)

Return strictly valid JSON conforming to the schema.`;

      const requestBody = {
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: base64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              merchantName: { type: 'STRING' },
              transactionDate: { type: 'STRING' },
              transactionTime: { type: 'STRING' },
              currency: { type: 'STRING' },
              totalAmount: { type: 'NUMBER' },
              taxAmount: { type: 'NUMBER' },
              categoryHint: { type: 'STRING' },
              items: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    name: { type: 'STRING' },
                    quantity: { type: 'NUMBER' },
                    unitPrice: { type: 'NUMBER' },
                    totalPrice: { type: 'NUMBER' },
                  },
                  required: ['name', 'unitPrice', 'totalPrice'],
                },
              },
            },
            required: ['merchantName', 'totalAmount'],
          },
        },
      };

      const result = await this.executeGeminiRequest<any>(requestBody, {
        operationType: 'RECEIPT',
        timeoutMs: 25000,
        estimatedCategory: 'HEAVY',
      });

      // Strict post-extraction validation
      const validation = this.validateReceiptOutput(result.data);
      return {
        ...validation,
        latencyMs: result.latencyMs,
      };
    } catch (err: any) {
      return {
        status: 'ERROR',
        confidence: 'NONE',
        source: 'FALLBACK',
        data: null,
        validationErrors: [this.sanitizeError(err)],
        missingFields: [],
        errorMessage: this.sanitizeError(err),
      };
    }
  }

  /**
   * Strict validation for receipt data returned by Gemini.
   */
  private validateReceiptOutput(raw: any): ReceiptParsingResult {
    const validationErrors: string[] = [];
    const missingFields: string[] = [];

    if (!raw || typeof raw !== 'object') {
      return {
        status: 'INVALID',
        confidence: 'NONE',
        source: 'GEMINI_AI',
        data: null,
        validationErrors: ['Gemini response is not a valid JSON object.'],
        missingFields: ['totalAmount', 'merchantName'],
      };
    }

    const totalAmount = Number(raw.totalAmount);
    if (isNaN(totalAmount) || totalAmount <= 0) {
      validationErrors.push('Extracted totalAmount is missing or non-positive.');
      missingFields.push('totalAmount');
    }

    const rawMerchant = String(raw.merchantName || '').trim();
    if (!rawMerchant) {
      validationErrors.push('Extracted merchantName is empty.');
      missingFields.push('merchantName');
    }

    // Validate and normalize transaction date
    let transactionDate = String(raw.transactionDate || '').trim();
    const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(transactionDate);
    if (!isIsoDate) {
      transactionDate = new Date().toISOString().split('T')[0];
    } else {
      const parsedDate = new Date(transactionDate);
      const now = new Date();
      // Guard against future dates beyond 2 days ahead
      if (parsedDate.getTime() > now.getTime() + 2 * 86400000) {
        validationErrors.push('Receipt date appears to be set in the future.');
        transactionDate = now.toISOString().split('T')[0];
      }
    }

    const taxAmount = Number(raw.taxAmount) >= 0 ? Number(raw.taxAmount) : 0;
    const currency = String(raw.currency || 'ETB').trim().toUpperCase();

    // Validate line items
    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    const validatedItems: ExtractedReceiptItem[] = [];

    for (const item of rawItems) {
      if (!item || typeof item !== 'object') continue;
      const name = String(item.name || '').trim();
      const unitPrice = Number(item.unitPrice) >= 0 ? Number(item.unitPrice) : 0;
      const totalPrice = Number(item.totalPrice) >= 0 ? Number(item.totalPrice) : unitPrice;
      const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1;

      if (name) {
        validatedItems.push({
          name,
          quantity,
          unitPrice,
          totalPrice,
        });
      }
    }

    // Determine status & confidence
    if (isNaN(totalAmount) || totalAmount <= 0) {
      return {
        status: 'INVALID',
        confidence: 'NONE',
        source: 'GEMINI_AI',
        data: null,
        validationErrors,
        missingFields,
        errorMessage: validationErrors.join('; '),
      };
    }

    const isUncertain = validationErrors.length > 0 || !isIsoDate;
    const cleanMerchant = this.normalizeMerchantLocal(rawMerchant).cleanMerchant;

    const data: ExtractedReceiptData = {
      merchantName: cleanMerchant,
      rawMerchantName: rawMerchant,
      transactionDate,
      transactionTime: raw.transactionTime ? String(raw.transactionTime).trim() : undefined,
      currency,
      totalAmount,
      taxAmount,
      categoryHint: raw.categoryHint ? String(raw.categoryHint).trim() : undefined,
      items: validatedItems,
    };

    return {
      status: isUncertain ? 'UNCERTAIN' : 'SUCCESS',
      confidence: isUncertain ? 'MEDIUM' : 'HIGH',
      source: 'GEMINI_AI',
      data,
      validationErrors,
      missingFields,
    };
  }

  // =========================================================================
  // 2. UNKNOWN MESSAGE / SMS PARSER (Fallback Parsing with Strict Validation)
  // =========================================================================

  public async parseUnknownSms(smsText: string): Promise<SmsParsingResult> {
    const settings = await vaultSecurity.getAiSettings();
    if (!settings.unknownSmsFallbackEnabled) {
      return {
        status: 'DISABLED',
        confidence: 'NONE',
        source: 'FALLBACK',
        data: null,
        validationErrors: ['Unknown SMS fallback is disabled in settings.'],
        missingFields: [],
        errorMessage: 'Unknown SMS fallback is disabled in settings.',
      };
    }

    if (!smsText || !smsText.trim()) {
      return {
        status: 'INVALID',
        confidence: 'NONE',
        source: 'FALLBACK',
        data: null,
        validationErrors: ['Input message text is empty.'],
        missingFields: ['amount', 'merchantName', 'type'],
      };
    }

    try {
      // Guard against excessive payload sizes
      const sanitizedSnippet = smsText.trim().substring(0, 1500);

      const prompt = `You are a financial SMS parser for Ethiopian bank alerts (CBE, Telebirr, Awash, Dashen, etc.).
Extract:
1. amount (number, positive transaction amount)
2. currency (string, usually ETB)
3. merchantName (string, merchant, shop, or counterparty)
4. type (strictly one of: EXPENSE, INCOME, TRANSFER)
5. balance (number, remaining balance after transaction if stated)
6. refNumber (string, unique reference or transaction code)
7. sender (counterparty if sender is explicitly named)
8. recipient (counterparty if recipient is explicitly named)

Notification text:
"""
${sanitizedSnippet}
"""
Respond strictly in JSON matching the schema.`;

      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              amount: { type: 'NUMBER' },
              currency: { type: 'STRING' },
              merchantName: { type: 'STRING' },
              type: { type: 'STRING', enum: ['EXPENSE', 'INCOME', 'TRANSFER'] },
              balance: { type: 'NUMBER' },
              refNumber: { type: 'STRING' },
              sender: { type: 'STRING' },
              recipient: { type: 'STRING' },
            },
            required: ['amount', 'merchantName', 'type'],
          },
        },
      };

      const result = await this.executeGeminiRequest<any>(requestBody, {
        operationType: 'SMS_FALLBACK',
        timeoutMs: 12000,
        estimatedCategory: 'LIGHT',
      });

      const validation = this.validateSmsOutput(result.data);
      return {
        ...validation,
        latencyMs: result.latencyMs,
      };
    } catch (err: any) {
      return {
        status: 'ERROR',
        confidence: 'NONE',
        source: 'FALLBACK',
        data: null,
        validationErrors: [this.sanitizeError(err)],
        missingFields: [],
        errorMessage: this.sanitizeError(err),
      };
    }
  }

  /**
   * Strict validation for Gemini SMS fallback extraction.
   */
  private validateSmsOutput(raw: any): SmsParsingResult {
    const validationErrors: string[] = [];
    const missingFields: string[] = [];

    if (!raw || typeof raw !== 'object') {
      return {
        status: 'INVALID',
        confidence: 'NONE',
        source: 'GEMINI_AI',
        data: null,
        validationErrors: ['Gemini response is not a valid JSON object.'],
        missingFields: ['amount', 'merchantName', 'type'],
      };
    }

    const amount = Number(raw.amount);
    if (isNaN(amount) || amount <= 0) {
      validationErrors.push('Extracted amount is missing or non-positive.');
      missingFields.push('amount');
    }

    const rawMerchant = String(raw.merchantName || '').trim();
    if (!rawMerchant) {
      validationErrors.push('Extracted merchantName is empty.');
      missingFields.push('merchantName');
    }

    const rawType = String(raw.type || '').trim().toUpperCase();
    let type: TransactionType = 'EXPENSE';
    if (rawType === 'INCOME' || rawType === 'TRANSFER' || rawType === 'EXPENSE') {
      type = rawType as TransactionType;
    } else {
      validationErrors.push(`Invalid transaction type: "${rawType}". Must be EXPENSE, INCOME, or TRANSFER.`);
      missingFields.push('type');
    }

    if (validationErrors.length > 0) {
      return {
        status: 'INVALID',
        confidence: 'NONE',
        source: 'GEMINI_AI',
        data: null,
        validationErrors,
        missingFields,
        errorMessage: validationErrors.join('; '),
      };
    }

    // Reference validation
    let refNumber: string | undefined = undefined;
    if (raw.refNumber) {
      const candidateRef = String(raw.refNumber).trim();
      if (RegexParser.isValidReference(candidateRef)) {
        refNumber = candidateRef;
      }
    }

    const balance = !isNaN(Number(raw.balance)) && Number(raw.balance) >= 0 ? Number(raw.balance) : undefined;
    const cleanMerchant = this.normalizeMerchantLocal(rawMerchant).cleanMerchant;

    const data: ExtractedSmsData = {
      amount,
      currency: String(raw.currency || 'ETB').trim().toUpperCase(),
      merchantName: rawMerchant,
      cleanMerchant,
      type,
      balance,
      refNumber,
      sender: raw.sender ? String(raw.sender).trim() : undefined,
      recipient: raw.recipient ? String(raw.recipient).trim() : undefined,
      confidenceScore: refNumber ? 0.9 : 0.75,
    };

    return {
      status: 'SUCCESS',
      confidence: refNumber ? 'HIGH' : 'MEDIUM',
      source: 'GEMINI_AI',
      data,
      validationErrors: [],
      missingFields: [],
    };
  }

  // =========================================================================
  // 3. MERCHANT NORMALIZATION (Local Deterministic First, Gemini Fallback)
  // =========================================================================

  /**
   * Normalizes raw counterparty/merchant strings.
   * Execution Order:
   * 1. Local deterministic dictionary & cleaning patterns (0ms, 0 tokens)
   * 2. If already recognized or clean, returns immediately with HIGH/MEDIUM confidence
   * 3. Gemini fallback only when permitted by settings and ambiguous
   */
  public async normalizeMerchant(
    rawMerchant: string,
    options?: { allowAiFallback?: boolean }
  ): Promise<MerchantNormalizationResult> {
    if (!rawMerchant || !rawMerchant.trim()) {
      return {
        status: 'INVALID',
        confidence: 'NONE',
        source: 'LOCAL_DETERMINISTIC',
        data: {
          cleanMerchant: 'Unknown Merchant',
          rawMerchant: '',
          knownEntity: false,
        },
        validationErrors: ['Raw merchant name is empty.'],
        missingFields: ['merchantName'],
      };
    }

    // Step 1: Local Deterministic Normalization First (0 tokens)
    const local = this.normalizeMerchantLocal(rawMerchant);
    if (local.knownEntity) {
      return {
        status: 'SUCCESS',
        confidence: 'HIGH',
        source: 'LOCAL_DETERMINISTIC',
        data: local,
        validationErrors: [],
        missingFields: [],
      };
    }

    // Step 2: Check permissions and settings for AI fallback
    const settings = await vaultSecurity.getAiSettings();
    const canUseAi = (options?.allowAiFallback !== false) && settings.merchantNormalizationEnabled;

    if (!canUseAi) {
      return {
        status: 'SUCCESS',
        confidence: 'MEDIUM',
        source: 'LOCAL_DETERMINISTIC',
        data: local,
        validationErrors: [],
        missingFields: [],
      };
    }

    const apiKey = await vaultSecurity.getGeminiApiKey();
    if (!apiKey) {
      return {
        status: 'SUCCESS',
        confidence: 'MEDIUM',
        source: 'LOCAL_DETERMINISTIC',
        data: local,
        validationErrors: [],
        missingFields: [],
      };
    }

    // Step 3: Minimal Gemini Fallback (Minimum Privacy Payload)
    try {
      const prompt = `Normalize this raw merchant or counterparty name from an Ethiopian receipt or SMS into a clean, canonical business or brand name.
Remove branch numbers, POS terminal IDs, teller codes, and legal suffixes (PLC, LTD, Share Company).
Raw text: "${local.cleanMerchant}"

Respond strictly in JSON matching the schema.`;

      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              cleanMerchant: { type: 'STRING' },
              categorySuggestion: { type: 'STRING' },
            },
            required: ['cleanMerchant'],
          },
        },
      };

      const result = await this.executeGeminiRequest<any>(requestBody, {
        operationType: 'MERCHANT',
        timeoutMs: 8000,
        estimatedCategory: 'LIGHT',
      });

      const geminiClean = String(result.data?.cleanMerchant || '').trim();
      if (geminiClean && geminiClean.length >= 2 && geminiClean.length <= 80) {
        return {
          status: 'SUCCESS',
          confidence: 'HIGH',
          source: 'GEMINI_AI',
          data: {
            cleanMerchant: geminiClean,
            rawMerchant,
            knownEntity: true,
            categorySuggestion: result.data.categorySuggestion,
          },
          validationErrors: [],
          missingFields: [],
          latencyMs: result.latencyMs,
        };
      }
    } catch {
      // Fallback seamlessly to local normalized result if AI fails
    }

    return {
      status: 'SUCCESS',
      confidence: 'MEDIUM',
      source: 'LOCAL_DETERMINISTIC',
      data: local,
      validationErrors: [],
      missingFields: [],
    };
  }

  /**
   * Fast, 100% offline local merchant normalizer.
   */
  public normalizeMerchantLocal(rawName: string): NormalizedMerchantData {
    const raw = rawName.trim();
    const clean = raw
      .replace(/\bPOS\s*\d+\b/gi, '')
      .replace(/\bBR\s*\d+\b/gi, '')
      .replace(/\bBRANCH\s*\d+\b/gi, '')
      .replace(/\bPLC\b/gi, '')
      .replace(/\bP\.L\.C\.?\b/gi, '')
      .replace(/\bLTD\b/gi, '')
      .replace(/\bSHARE\s*COMPANY\b/gi, '')
      .replace(/[*#_+]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const lower = clean.toLowerCase();

    for (const [key, entity] of Object.entries(KNOWN_ETHIOPIAN_MERCHANTS)) {
      if (lower.includes(key)) {
        return {
          cleanMerchant: entity.cleanName,
          rawMerchant: raw,
          knownEntity: true,
        };
      }
    }

    // Title case the cleaned string
    const titleCased = clean
      .split(' ')
      .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
      .join(' ')
      .trim();

    return {
      cleanMerchant: titleCased || raw,
      rawMerchant: raw,
      knownEntity: false,
    };
  }

  // =========================================================================
  // 4. TRANSACTION CATEGORIZATION (Local Keyword Rules First, Gemini Fallback)
  // =========================================================================

  /**
   * Categorizes a transaction into one of the 10 standard categories.
   * Execution Order:
   * 1. Local keyword matching against standard categories (0ms, 0 tokens)
   * 2. If matched confidently, returns immediately
   * 3. Gemini fallback only when unmapped and enabled in settings
   */
  public async categorizeTransaction(
    input: {
      merchant: string;
      amount: number;
      type?: TransactionType;
      notes?: string;
    },
    options?: { allowAiFallback?: boolean }
  ): Promise<CategorizationResult> {
    const { merchant, amount, type = 'EXPENSE', notes } = input;

    // Step 1: Local Deterministic Rule Evaluation (0 tokens)
    const localMatch = this.categorizeTransactionLocal({ merchant, type, notes });
    if (localMatch) {
      return {
        status: 'SUCCESS',
        confidence: 'HIGH',
        source: 'LOCAL_DETERMINISTIC',
        data: localMatch,
        validationErrors: [],
        missingFields: [],
      };
    }

    // If transfer, default locally to Other Expenses with high confidence
    if (type === 'TRANSFER') {
      return {
        status: 'SUCCESS',
        confidence: 'HIGH',
        source: 'LOCAL_DETERMINISTIC',
        data: {
          categoryId: 'cat_other',
          categoryName: 'Other Expenses',
          reasoning: 'P2P transfers default to Other Expenses',
        },
        validationErrors: [],
        missingFields: [],
      };
    }

    // Step 2: Check permissions and settings for AI fallback
    const settings = await vaultSecurity.getAiSettings();
    const canUseAi = (options?.allowAiFallback !== false) && settings.categoryInferenceEnabled;

    if (!canUseAi) {
      return {
        status: 'UNCERTAIN',
        confidence: 'LOW',
        source: 'LOCAL_DETERMINISTIC',
        data: {
          categoryId: 'cat_other',
          categoryName: 'Other Expenses',
          reasoning: 'Local keyword fallback',
        },
        validationErrors: [],
        missingFields: [],
      };
    }

    const apiKey = await vaultSecurity.getGeminiApiKey();
    if (!apiKey) {
      return {
        status: 'UNCERTAIN',
        confidence: 'LOW',
        source: 'LOCAL_DETERMINISTIC',
        data: {
          categoryId: 'cat_other',
          categoryName: 'Other Expenses',
          reasoning: 'No Gemini API key configured',
        },
        validationErrors: [],
        missingFields: [],
      };
    }

    // Step 3: Minimal Gemini Categorization Request (Strictly Constrained Enum)
    try {
      const allowedCategories = DEFAULT_CATEGORIES.map((c) => ({ id: c.id, name: c.name }));
      const prompt = `Categorize this transaction into exactly ONE of the following standard categories:
${JSON.stringify(allowedCategories)}

Transaction Details:
- Merchant: "${merchant}"
- Amount: ${amount} ETB
- Type: ${type}
${notes ? `- Notes: "${notes}"` : ''}

Respond strictly in JSON matching the schema.`;

      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              categoryId: {
                type: 'STRING',
                enum: DEFAULT_CATEGORIES.map((c) => c.id),
              },
              reasoning: { type: 'STRING' },
            },
            required: ['categoryId'],
          },
        },
      };

      const result = await this.executeGeminiRequest<any>(requestBody, {
        operationType: 'CATEGORY',
        timeoutMs: 8000,
        estimatedCategory: 'LIGHT',
      });

      const selectedId = String(result.data?.categoryId || '').trim();
      const matchedCategory = DEFAULT_CATEGORIES.find((c) => c.id === selectedId);

      if (matchedCategory) {
        return {
          status: 'SUCCESS',
          confidence: 'HIGH',
          source: 'GEMINI_AI',
          data: {
            categoryId: matchedCategory.id,
            categoryName: matchedCategory.name,
            reasoning: result.data.reasoning,
          },
          validationErrors: [],
          missingFields: [],
          latencyMs: result.latencyMs,
        };
      }
    } catch {
      // Gracefully fall back to local default
    }

    return {
      status: 'UNCERTAIN',
      confidence: 'LOW',
      source: 'LOCAL_DETERMINISTIC',
      data: {
        categoryId: 'cat_other',
        categoryName: 'Other Expenses',
        reasoning: 'AI categorization failed; fell back to default category',
      },
      validationErrors: [],
      missingFields: [],
    };
  }

  /**
   * Fast, 100% offline local category resolver based on keywords.
   */
  public categorizeTransactionLocal(input: {
    merchant: string;
    type?: TransactionType;
    notes?: string;
  }): CategorizationData | null {
    const combined = `${input.merchant} ${input.notes || ''}`.toLowerCase();

    // Check if Income
    if (input.type === 'INCOME') {
      const incomeRule = LOCAL_CATEGORY_RULES.find((r) => r.id === 'cat_income');
      if (incomeRule && incomeRule.keywords.some((kw) => combined.includes(kw))) {
        return {
          categoryId: incomeRule.id,
          categoryName: incomeRule.name,
          reasoning: 'Matched salary or income keyword',
        };
      }
    }

    // Check known Ethiopian merchant dictionary first
    for (const [key, entity] of Object.entries(KNOWN_ETHIOPIAN_MERCHANTS)) {
      if (combined.includes(key)) {
        const cat = DEFAULT_CATEGORIES.find((c) => c.id === entity.categoryId);
        if (cat) {
          return {
            categoryId: cat.id,
            categoryName: cat.name,
            reasoning: `Matched known entity "${entity.cleanName}"`,
          };
        }
      }
    }

    // Check general category keywords
    for (const rule of LOCAL_CATEGORY_RULES) {
      if (rule.id === 'cat_other' || rule.id === 'cat_income') continue;
      for (const kw of rule.keywords) {
        if (combined.includes(kw)) {
          return {
            categoryId: rule.id,
            categoryName: rule.name,
            reasoning: `Matched keyword "${kw}"`,
          };
        }
      }
    }

    return null;
  }

  // =========================================================================
  // 5. DASHBOARD INSIGHTS GENERATOR (Local Rules First, Gemini Fallback)
  // =========================================================================

  public async generateInsights(
    summary: DashboardSummaryDigest
  ): Promise<DashboardInsightsResult> {
    const settings = await vaultSecurity.getAiSettings();
    const canUseAi = settings.dashboardInsightsEnabled;

    // Fast local heuristic insights
    const localHeadline = `${summary.monthName} ${summary.year}: Net Savings ${summary.netSavings.toLocaleString()} ETB`;
    const localInsights: string[] = [];

    if (summary.topSpendingCategory) {
      localInsights.push(
        `${summary.topSpendingCategory.name} was your largest expense (${summary.topSpendingCategory.amount.toLocaleString()} ETB, ${Math.round(summary.topSpendingCategory.percentage)}% of total).`
      );
    }
    if (summary.totalIncome > 0) {
      const savingsRate = Math.round((summary.netSavings / summary.totalIncome) * 100);
      localInsights.push(`Your net savings rate for the period was ${savingsRate}%.`);
    }

    if (!canUseAi) {
      return {
        headline: localHeadline,
        keyInsights: localInsights,
        suggestedAction: 'Review spending in your top categories to increase savings.',
      };
    }

    const apiKey = await vaultSecurity.getGeminiApiKey();
    if (!apiKey) {
      return {
        headline: localHeadline,
        keyInsights: localInsights,
        suggestedAction: 'Configure your Gemini API key in Settings for AI insights.',
      };
    }

    try {
      const prompt = `You are a personal finance assistant. Generate 2 brief, encouraging, data-grounded insights for this financial digest:
- Period: ${summary.monthName} ${summary.year}
- Income: ${summary.totalIncome} ETB
- Expenses: ${summary.totalExpense} ETB
- Net Savings: ${summary.netSavings} ETB
${summary.topSpendingCategory ? `- Top Category: ${summary.topSpendingCategory.name} (${summary.topSpendingCategory.amount} ETB)` : ''}

Respond strictly in JSON matching the schema.`;

      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              headline: { type: 'STRING' },
              keyInsights: {
                type: 'ARRAY',
                items: { type: 'STRING' },
              },
              suggestedAction: { type: 'STRING' },
            },
            required: ['headline', 'keyInsights'],
          },
        },
      };

      const result = await this.executeGeminiRequest<any>(requestBody, {
        operationType: 'CATEGORY',
        timeoutMs: 10000,
        estimatedCategory: 'LIGHT',
      });

      return {
        headline: result.data.headline || localHeadline,
        keyInsights: Array.isArray(result.data.keyInsights) && result.data.keyInsights.length > 0 ? result.data.keyInsights : localInsights,
        suggestedAction: result.data.suggestedAction || 'Keep tracking daily expenses.',
      };
    } catch {
      return {
        headline: localHeadline,
        keyInsights: localInsights,
        suggestedAction: 'Review spending in your top categories to increase savings.',
      };
    }
  }

  // =========================================================================
  // 6. MONTHLY FINANCIAL ANALYSIS (Pre-Aggregated Numbers Only)
  // =========================================================================

  public async generateMonthlyAnalysis(
    digest: MonthlyAnalysisDigest
  ): Promise<MonthlyAnalysisResult> {
    const settings = await vaultSecurity.getAiSettings();
    if (!settings.monthlyAnalysisEnabled) {
      throw new Error('Monthly AI analysis is disabled in settings.');
    }

    const prompt = `You are a personal financial advisor. Review this aggregated monthly financial summary for ${digest.monthName} ${digest.year}:
- Total Inflow: ${digest.totalIncome.toLocaleString()} ETB
- Total Outflow: ${digest.totalExpense.toLocaleString()} ETB
- Net Savings: ${digest.netSavings.toLocaleString()} ETB
- Top Spending Categories: ${JSON.stringify(digest.topCategories)}
- Top Recurring Merchants: ${JSON.stringify(digest.topMerchants)}

Generate a helpful, realistic, data-grounded financial analysis report.
Do not invent facts or numbers. Produce:
1. A concise headline summary.
2. 3 bullet highlights on where the money went.
3. 1-2 anomaly observations.
4. 2 practical, encouraging suggestions to save money in an Ethiopian economic context.
Return strictly valid JSON conforming to the schema.`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            summaryHeadline: { type: 'STRING' },
            keyHighlights: {
              type: 'ARRAY',
              items: { type: 'STRING' },
            },
            anomalies: {
              type: 'ARRAY',
              items: { type: 'STRING' },
            },
            actionableSavingsTips: {
              type: 'ARRAY',
              items: { type: 'STRING' },
            },
          },
          required: ['summaryHeadline', 'keyHighlights', 'actionableSavingsTips'],
        },
      },
    };

    const result = await this.executeGeminiRequest<MonthlyAnalysisResult>(requestBody, {
      operationType: 'MONTHLY_ANALYSIS',
      timeoutMs: 20000,
      estimatedCategory: 'MEDIUM',
    });

    return result.data;
  }

  // =========================================================================
  // 7. VISUAL FINANCIAL SUMMARY & COCKPIT INSIGHTS (Local First & Cached)
  // =========================================================================

  /**
   * Generates dynamic, factual visual insight cards 100% offline from local SQLite digest.
   * Zero latency, zero tokens, zero API dependence.
   */
  public getLocalInsightCards(digest: LocalFinancialDigest): VisualInsightCard[] {
    const cards: VisualInsightCard[] = [];

    // 1. Top Spending Category Card
    if (digest.topCategories.length > 0 && digest.topCategories[0].amount > 0) {
      const top = digest.topCategories[0];
      cards.push({
        id: 'card_top_spending',
        type: 'CATEGORY_HIGHLIGHT',
        title: 'TOP SPENDING',
        primaryMetric: top.name,
        secondaryMetric: `${top.amount.toLocaleString()} ETB`,
        badgeText: `${top.percentage}% of total`,
        badgeVariant: 'expense',
        supportingValue: top.amount,
        explanation: `${top.name} was your largest expense category this month, accounting for ${top.percentage}% of all outflows.`,
        categoryId: top.id,
      });
    }

    // 2. Spending Concentration Card (Top 2 categories share)
    if (digest.top2ConcentrationPct !== undefined && digest.topCategories.length >= 2) {
      const isHigh = digest.top2ConcentrationPct >= 60;
      cards.push({
        id: 'card_concentration',
        type: 'SPENDING_CONCENTRATION',
        title: 'SPENDING CONCENTRATION',
        primaryMetric: `${digest.top2ConcentrationPct}%`,
        secondaryMetric: 'Top 2 categories',
        badgeText: isHigh ? 'High Concentration' : 'Balanced',
        badgeVariant: isHigh ? 'warning' : 'neutral',
        supportingValue: digest.top2ConcentrationPct,
        explanation: `${digest.top2ConcentrationPct}% of your expenses are concentrated in ${digest.topCategories[0].name} and ${digest.topCategories[1].name}.`,
      });
    }

    // 3. Needs Attention / Uncategorized Card
    if (digest.uncategorizedCount > 0) {
      const unassignedPct = digest.totalExpense > 0
        ? Math.round((digest.uncategorizedTotalAmount / digest.totalExpense) * 100)
        : 0;
      cards.push({
        id: 'card_uncategorized',
        type: 'UNCATEGORIZED',
        title: 'NEEDS ATTENTION',
        primaryMetric: `${digest.uncategorizedCount} unassigned`,
        secondaryMetric: `${digest.uncategorizedTotalAmount.toLocaleString()} ETB`,
        badgeText: `${unassignedPct}% of spend`,
        badgeVariant: 'warning',
        supportingValue: digest.uncategorizedTotalAmount,
        explanation: `${digest.uncategorizedCount} transaction${digest.uncategorizedCount > 1 ? 's lack' : ' lacks'} categories. Assigning categories refines your financial reporting.`,
      });
    }

    // 4. Month-over-Month Spending Trend
    if (digest.momExpenseChangePct !== undefined) {
      const isDecrease = digest.momExpenseChangePct <= 0;
      const absPct = Math.abs(digest.momExpenseChangePct);
      cards.push({
        id: 'card_mom_trend',
        type: 'MOM_CHANGE',
        title: 'SPENDING TREND',
        primaryMetric: `${absPct}% ${isDecrease ? 'lower' : 'higher'}`,
        secondaryMetric: 'vs previous month',
        badgeText: isDecrease ? 'Reduced Spend' : 'Increased Spend',
        badgeVariant: isDecrease ? 'income' : 'expense',
        supportingValue: digest.momExpenseChangePct,
        explanation: isDecrease
          ? `Your total spending decreased by ${absPct}% compared to last month.`
          : `Your total spending increased by ${absPct}% compared to last month.`,
      });
    }

    // 5. Largest Single Expense
    if (digest.largestExpense && digest.largestExpense.amount > 0) {
      cards.push({
        id: 'card_largest_expense',
        type: 'LARGEST_EXPENSE',
        title: 'LARGEST EXPENSE',
        primaryMetric: `${digest.largestExpense.amount.toLocaleString()} ETB`,
        secondaryMetric: digest.largestExpense.merchant,
        badgeText: digest.largestExpense.categoryName || 'Single Purchase',
        badgeVariant: 'neutral',
        supportingValue: digest.largestExpense.amount,
        explanation: `${digest.largestExpense.merchant} was your single highest transaction this month at ${digest.largestExpense.amount.toLocaleString()} ETB.`,
        merchantName: digest.largestExpense.merchant,
      });
    }

    // 6. Primary Outflow Account
    if (digest.accountBreakdown.length > 0 && digest.accountBreakdown[0].spentAmount > 0) {
      const topAccount = digest.accountBreakdown[0];
      const acctPct = digest.totalExpense > 0
        ? Math.round((topAccount.spentAmount / digest.totalExpense) * 100)
        : 0;
      cards.push({
        id: 'card_primary_account',
        type: 'ACCOUNT_USAGE',
        title: 'PRIMARY ACCOUNT',
        primaryMetric: topAccount.name,
        secondaryMetric: `${topAccount.spentAmount.toLocaleString()} ETB`,
        badgeText: `${acctPct}% of outflows`,
        badgeVariant: 'primary',
        supportingValue: topAccount.spentAmount,
        explanation: `${topAccount.name} handled ${topAccount.txCount} transaction${topAccount.txCount > 1 ? 's' : ''} representing ${acctPct}% of outflows.`,
        accountId: topAccount.id,
      });
    }

    // 7. Average Purchase Size
    if (digest.expenseCount > 0) {
      cards.push({
        id: 'card_average_expense',
        type: 'AVERAGE_EXPENSE',
        title: 'AVERAGE PURCHASE',
        primaryMetric: `${digest.averageExpenseAmount.toLocaleString()} ETB`,
        secondaryMetric: `${digest.expenseCount} purchases`,
        badgeText: 'Average Ticket',
        badgeVariant: 'neutral',
        supportingValue: digest.averageExpenseAmount,
        explanation: `Across ${digest.expenseCount} confirmed expense transactions, your average ticket was ${digest.averageExpenseAmount.toLocaleString()} ETB.`,
      });
    }

    return cards;
  }

  /**
   * Anti-hallucination helper: checks if an AI generated text mentions numbers that are
   * wildly unaligned with the factual local digest. Replaces or falls back if suspicious.
   */
  public validateAiObservation(text: string, digest: LocalFinancialDigest): boolean {
    if (!text || text.trim().length < 10) return false;
    // Reject foreign currencies
    if (text.includes('$') || text.includes('€') || text.includes('£')) return false;

    // Extract all numbers >= 10 from the text
    const numberMatches = text.match(/\b\d+(?:,\d+)*(?:\.\d+)?\b/g);
    if (!numberMatches) return true; // No numbers mentioned, safe qualitative observation

    // Build list of valid numbers from digest
    const validNumbers = new Set<number>();
    validNumbers.add(Math.round(digest.totalIncome));
    validNumbers.add(Math.round(digest.totalExpense));
    validNumbers.add(Math.round(Math.abs(digest.netSavings)));
    validNumbers.add(Math.round(digest.averageExpenseAmount));
    validNumbers.add(digest.expenseCount);
    validNumbers.add(digest.incomeCount);
    validNumbers.add(digest.uncategorizedCount);
    validNumbers.add(Math.round(digest.uncategorizedTotalAmount));
    if (digest.prevMonthExpense !== undefined) validNumbers.add(Math.round(digest.prevMonthExpense));
    if (digest.momExpenseChangePct !== undefined) {
      validNumbers.add(Math.abs(digest.momExpenseChangePct));
    }
    if (digest.top2ConcentrationPct !== undefined) {
      validNumbers.add(digest.top2ConcentrationPct);
    }
    if (digest.largestExpense) {
      validNumbers.add(Math.round(digest.largestExpense.amount));
    }
    for (const c of digest.topCategories) {
      validNumbers.add(Math.round(c.amount));
      validNumbers.add(c.percentage);
    }
    for (const a of digest.accountBreakdown) {
      validNumbers.add(Math.round(a.spentAmount));
      validNumbers.add(a.txCount);
    }
    for (const m of digest.topMerchants) {
      validNumbers.add(Math.round(m.amount));
      validNumbers.add(m.count);
    }

    // Check each number: if a number is >= 10 and not year/day, is it close to a known fact?
    for (const numStr of numberMatches) {
      const cleanNum = parseFloat(numStr.replace(/,/g, ''));
      if (isNaN(cleanNum)) continue;
      // Skip year (e.g. 2026, 2025) or day/month small numbers (1-31)
      if (cleanNum === digest.year || cleanNum <= 31) continue;

      // Allow small percentage or rounding differences (+/- 2 or 5%)
      let matchesAny = false;
      for (const valid of validNumbers) {
        if (Math.abs(cleanNum - valid) <= Math.max(2, valid * 0.05)) {
          matchesAny = true;
          break;
        }
      }
      if (!matchesAny && cleanNum >= 50) {
        // Suspected hallucinated amount
        return false;
      }
    }

    return true;
  }

  /**
   * Generates full visual financial summary for a month.
   * Loads from SQLite cache if available, runs local-first arithmetic,
   * calls Gemini only when permitted for headline/observation synthesis,
   * validates against hallucinations, and saves to SQLite report cache.
   */
  public async generateVisualFinancialSummary(
    digest: LocalFinancialDigest,
    forceRefresh = false
  ): Promise<VisualFinancialSummaryResult> {
    const currentFingerprint = computeFinancialDigestFingerprint(digest);

    // 1. Check local SQLite cache first (unless forceRefresh is true)
    if (!forceRefresh) {
      try {
        const cached = await dbService.getCachedMonthlyReport(digest.month, digest.year);
        if (cached && cached.contentJson) {
          const parsed = JSON.parse(cached.contentJson) as VisualFinancialSummaryResult;
          if (parsed && typeof parsed.summaryHeadline === 'string') {
            const isStale = parsed.dataFingerprint
              ? parsed.dataFingerprint !== currentFingerprint
              : false;

            // Factual cards ALWAYS represent the current SQLite digest
            const currentCards = this.getLocalInsightCards(digest);
            const finalCards = currentCards.map((card) => {
              const match = parsed.insightCards?.find((c) => c.id === card.id);
              if (match?.explanation && this.validateAiObservation(match.explanation, digest)) {
                return { ...card, explanation: match.explanation };
              }
              return card;
            });

            const momChangeDirection = digest.momExpenseChangePct === undefined
              ? 'FLAT'
              : digest.momExpenseChangePct < 0
              ? 'DOWN'
              : digest.momExpenseChangePct > 0
              ? 'UP'
              : 'FLAT';

            const momChangeText = digest.momExpenseChangePct !== undefined
              ? `${Math.abs(digest.momExpenseChangePct)}% ${digest.momExpenseChangePct <= 0 ? 'lower than last month' : 'higher than last month'}`
              : undefined;

            return {
              ...parsed,
              summaryHeadline: parsed.summaryHeadline,
              observationSummary: parsed.observationSummary,
              isAiGenerated: parsed.isAiGenerated,
              cachedAt: cached.createdAt,
              dataFingerprint: parsed.dataFingerprint,
              isStale,
              monthName: digest.monthName,
              year: digest.year,
              totalExpenseFormatted: `${digest.totalExpense.toLocaleString()} ETB`,
              momChangeText,
              momChangeDirection,
              insightCards: finalCards,
            };
          }
        }
      } catch (cacheErr) {
        console.warn('[AI] Cache read notice:', cacheErr);
      }
    }

    // 2. Generate deterministic local cards (0ms, 0 tokens, 100% offline)
    const localCards = this.getLocalInsightCards(digest);

    const momChangeDirection = digest.momExpenseChangePct === undefined
      ? 'FLAT'
      : digest.momExpenseChangePct < 0
      ? 'DOWN'
      : digest.momExpenseChangePct > 0
      ? 'UP'
      : 'FLAT';

    const momChangeText = digest.momExpenseChangePct !== undefined
      ? `${Math.abs(digest.momExpenseChangePct)}% ${digest.momExpenseChangePct <= 0 ? 'lower than last month' : 'higher than last month'}`
      : undefined;

    const localHeadline = digest.expenseCount > 0
      ? `${digest.monthName} Snapshot: ${digest.totalExpense.toLocaleString()} ETB across ${digest.expenseCount} transaction${digest.expenseCount > 1 ? 's' : ''}`
      : `${digest.monthName} Snapshot: No expenses recorded`;

    const topCatName = digest.topCategories.length > 0 ? digest.topCategories[0].name : '';
    const localObservation = digest.topCategories.length > 0
      ? `${topCatName} represented ${digest.topCategories[0].percentage}% of total outflows. ${digest.uncategorizedCount > 0 ? `Reviewing ${digest.uncategorizedCount} unassigned transaction${digest.uncategorizedCount > 1 ? 's' : ''} will increase reporting accuracy.` : 'All transactions are categorized.'}`
      : 'Keep recording daily transactions to build personalized financial cockpit insights.';

    const localResult: VisualFinancialSummaryResult = {
      summaryHeadline: localHeadline,
      monthName: digest.monthName,
      year: digest.year,
      totalExpenseFormatted: `${digest.totalExpense.toLocaleString()} ETB`,
      momChangeText,
      momChangeDirection,
      insightCards: localCards,
      observationSummary: localObservation,
      isAiGenerated: false,
      dataFingerprint: currentFingerprint,
      isStale: false,
    };

    // 3. Check AI Settings & API Key
    const settings = await vaultSecurity.getAiSettings();
    const apiKey = await vaultSecurity.getGeminiApiKey();
    if (!settings.monthlyAnalysisEnabled || !apiKey) {
      await dbService.saveMonthlyReport(
        digest.month,
        digest.year,
        localResult.summaryHeadline,
        JSON.stringify(localResult)
      );
      return localResult;
    }

    // 4. Invoke Gemini with pre-aggregated factual digest
    try {
      const prompt = `You are the executive financial analyst for MoneyTracker, a private local-first personal finance app in Ethiopia.
Analyze this pre-aggregated monthly financial summary for ${digest.monthName} ${digest.year}:
- Inflow: ${digest.totalIncome.toLocaleString()} ETB (${digest.incomeCount} transactions)
- Outflow: ${digest.totalExpense.toLocaleString()} ETB (${digest.expenseCount} transactions)
- Net Savings: ${digest.netSavings.toLocaleString()} ETB
- Average Expense: ${digest.averageExpenseAmount.toLocaleString()} ETB
${digest.momExpenseChangePct !== undefined ? `- Month-over-Month Expense Trend: ${digest.momExpenseChangePct}%` : ''}
${digest.largestExpense ? `- Largest Single Expense: ${digest.largestExpense.merchant} (${digest.largestExpense.amount.toLocaleString()} ETB, Category: ${digest.largestExpense.categoryName || 'None'})` : ''}
- Top Categories: ${JSON.stringify(digest.topCategories.map((c) => ({ name: c.name, amount: c.amount, percentage: c.percentage })))}
${digest.top2ConcentrationPct !== undefined ? `- Top 2 Concentration: ${digest.top2ConcentrationPct}%` : ''}
- Unassigned / Uncategorized: ${digest.uncategorizedCount} transactions (${digest.uncategorizedTotalAmount.toLocaleString()} ETB)
- Accounts: ${JSON.stringify(digest.accountBreakdown.map((a) => ({ name: a.name, amount: a.spentAmount, count: a.txCount })))}
- Top Recurring Merchants: ${JSON.stringify(digest.topMerchants)}

Tasks:
1. Provide a sharp, punchy summaryHeadline (under 12 words) characterizing the month's spending.
2. Provide a 2-3 sentence observationSummary ("💡 What stands out") analyzing spending distribution, spikes, and habits.
3. Optionally enhance individual card explanations with crisp, data-backed insights.

STRICT ACCURACY RULES:
- Never invent numbers or currency symbols. Use ETB.
- All numbers must match the figures provided in the summary above.
- Return valid JSON matching the schema.`;

      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              summaryHeadline: { type: 'STRING' },
              observationSummary: { type: 'STRING' },
              cardExplanations: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    cardId: { type: 'STRING' },
                    explanation: { type: 'STRING' },
                  },
                  required: ['cardId', 'explanation'],
                },
              },
            },
            required: ['summaryHeadline', 'observationSummary'],
          },
        },
      };

      const aiResponse = await this.executeGeminiRequest<any>(requestBody, {
        operationType: 'MONTHLY_ANALYSIS',
        timeoutMs: 15000,
        estimatedCategory: 'MEDIUM',
      });

      const data = aiResponse.data;
      let finalHeadline = localHeadline;
      if (data?.summaryHeadline && typeof data.summaryHeadline === 'string' && data.summaryHeadline.trim().length >= 4) {
        if (!data.summaryHeadline.includes('$') && !data.summaryHeadline.includes('€')) {
          finalHeadline = data.summaryHeadline.trim();
        }
      }

      let finalObservation = localObservation;
      if (data?.observationSummary && typeof data.observationSummary === 'string') {
        const obsValid = this.validateAiObservation(data.observationSummary, digest);
        if (obsValid) {
          finalObservation = data.observationSummary.trim();
        }
      }

      // Merge card explanations onto the locally grounded cards
      const finalCards = localCards.map((card) => {
        if (Array.isArray(data?.cardExplanations)) {
          const match = data.cardExplanations.find((ce: any) => ce?.cardId === card.id);
          if (match && typeof match.explanation === 'string' && match.explanation.trim().length > 10) {
            if (this.validateAiObservation(match.explanation, digest)) {
              return {
                ...card,
                explanation: match.explanation.trim(),
              };
            }
          }
        }
        return card;
      });

      const aiResult: VisualFinancialSummaryResult = {
        summaryHeadline: finalHeadline,
        monthName: digest.monthName,
        year: digest.year,
        totalExpenseFormatted: `${digest.totalExpense.toLocaleString()} ETB`,
        momChangeText,
        momChangeDirection,
        insightCards: finalCards,
        observationSummary: finalObservation,
        isAiGenerated: true,
        dataFingerprint: currentFingerprint,
        isStale: false,
        cachedAt: new Date().toISOString(),
      };

      // Save to SQLite cache (replaces old report)
      await dbService.saveMonthlyReport(
        digest.month,
        digest.year,
        aiResult.summaryHeadline,
        JSON.stringify(aiResult)
      );

      return aiResult;
    } catch (err) {
      console.warn('[AI] Visual summary Gemini fallback to local arithmetic:', err);
      await dbService.saveMonthlyReport(
        digest.month,
        digest.year,
        localResult.summaryHeadline,
        JSON.stringify(localResult)
      );
      return localResult;
    }
  }
}

/**
 * Computes a deterministic string signature of the underlying financial ledger for a month.
 * Changes whenever transactions are added, edited, categorized, or deleted.
 */
export function computeFinancialDigestFingerprint(digest: LocalFinancialDigest): string {
  const topCatSig = (digest.topCategories || [])
    .slice(0, 3)
    .map((c) => `${c.id}:${Math.round(c.amount)}`)
    .join('|');
  const largestSig = digest.largestExpense
    ? `${Math.round(digest.largestExpense.amount)}:${digest.largestExpense.merchant}`
    : 'none';
  return `v1_${digest.month}_${digest.year}_inc${Math.round(digest.totalIncome)}_exp${Math.round(digest.totalExpense)}_cnt${digest.expenseCount}_${digest.incomeCount}_${digest.transferCount}_unc${digest.uncategorizedCount}_${Math.round(digest.uncategorizedTotalAmount)}_top[${topCatSig}]_max[${largestSig}]`;
}

export const aiService = new AiService();
