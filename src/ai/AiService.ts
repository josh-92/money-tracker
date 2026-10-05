/**
 * AiService.ts
 * Unified application-level AI service backed by Google's official Gemini API.
 * - Follows the local-data-grounded principle (no unbounded chats, purpose-specific only)
 * - Structured JSON schemas for receipt extraction and monthly analysis
 * - Client-side image downsampling (max 1024px, JPEG 80%)
 * - Honest usage audit logging in local SQLite
 * - Dynamic, user-configurable model ID
 */

import * as ImageManipulator from 'expo-image-manipulator';
import { vaultSecurity, AiFeatureSettings } from '../security/VaultSecurity';
import { dbService } from '../database/DatabaseService';

export interface ExtractedReceiptData {
  merchantName: string;
  transactionDate: string;
  transactionTime?: string;
  currency: string;
  totalAmount: number;
  taxAmount: number;
  categoryHint: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
}

export interface ExtractedSmsData {
  amount: number;
  currency: string;
  merchantName: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  balance?: number;
  refNumber?: string;
}

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

class AiService {
  private async getApiKeyAndModel(): Promise<{ apiKey: string; modelId: string }> {
    const apiKey = await vaultSecurity.getGeminiApiKey();
    if (!apiKey) {
      throw new Error('Gemini API Key is not configured. Please add your key in Settings.');
    }
    const modelId = await vaultSecurity.getConfiguredModel();
    return { apiKey, modelId };
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
   * Tests API key validity and returns latency in milliseconds.
   */
  public async testConnection(apiKey: string, modelId: string): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}?key=${apiKey}`;
      const response = await fetch(url, { method: 'GET' });
      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        return {
          success: false,
          latencyMs,
          error: errJson.error?.message || `HTTP ${response.status}: Failed to connect`,
        };
      }

      return { success: true, latencyMs };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        error: err.message || 'Network connection failed',
      };
    }
  }

  /**
   * Multimodal receipt extraction using Gemini structured output.
   */
  public async parseReceipt(imageUri: string): Promise<ExtractedReceiptData> {
    const { apiKey, modelId } = await this.getApiKeyAndModel();
    const settings = await vaultSecurity.getAiSettings();
    if (!settings.receiptAiEnabled) {
      throw new Error('Receipt AI extraction is disabled in settings.');
    }

    const { base64, mimeType } = await this.preprocessReceiptImage(imageUri);
    const startTime = Date.now();

    const prompt = `Analyze this paper receipt or invoice from Ethiopia.
Extract the merchant name, transaction date (YYYY-MM-DD), transaction time (HH:MM if present), currency (usually ETB), total amount, tax amount, a suggested expense category, and line items with item name, quantity, unit price, and total price.
Return strictly valid JSON conforming to the requested schema.`;

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

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        await dbService.logAiUsage({
          operationType: 'RECEIPT',
          modelId,
          latencyMs,
          status: 'FAILED',
        });
        throw new Error(errJson.error?.message || `Gemini API returned error ${response.status}`);
      }

      const jsonResponse = await response.json();
      const rawText = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsedData: ExtractedReceiptData = JSON.parse(rawText || '{}');

      // Log honest usage
      const usage = jsonResponse.usageMetadata;
      await dbService.logAiUsage({
        operationType: 'RECEIPT',
        modelId,
        promptTokensRecorded: usage?.promptTokenCount,
        responseTokensRecorded: usage?.candidatesTokenCount,
        estimatedCategory: 'HEAVY',
        latencyMs,
        status: 'SUCCESS',
      });

      return {
        merchantName: parsedData.merchantName || 'Unknown Merchant',
        transactionDate: parsedData.transactionDate || new Date().toISOString().split('T')[0],
        transactionTime: parsedData.transactionTime,
        currency: parsedData.currency || 'ETB',
        totalAmount: Number(parsedData.totalAmount) || 0.0,
        taxAmount: Number(parsedData.taxAmount) || 0.0,
        categoryHint: parsedData.categoryHint || 'Other Expenses',
        items: parsedData.items || [],
      };
    } catch (err: any) {
      await dbService.logAiUsage({
        operationType: 'RECEIPT',
        modelId,
        latencyMs: Date.now() - startTime,
        status: 'FAILED',
      });
      throw err;
    }
  }

  /**
   * Fallback SMS parsing when local deterministic regex fails.
   */
  public async parseUnknownSms(smsText: string): Promise<ExtractedSmsData> {
    const { apiKey, modelId } = await this.getApiKeyAndModel();
    const settings = await vaultSecurity.getAiSettings();
    if (!settings.unknownSmsFallbackEnabled) {
      throw new Error('Unknown SMS fallback is disabled in settings.');
    }

    const startTime = Date.now();
    const prompt = `You are a financial SMS parser for Ethiopian bank alerts (CBE, Telebirr, Awash, Dashen, etc.).
Extract the transaction amount, currency (default ETB), merchant or counterparty name, transaction type (EXPENSE, INCOME, or TRANSFER), available balance, and reference number from this notification:
"""
${smsText}
"""
Respond strictly in JSON format matching the schema.`;

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
          },
          required: ['amount', 'merchantName', 'type'],
        },
      },
    };

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const latencyMs = Date.now() - startTime;
      if (!response.ok) {
        throw new Error(`Gemini API returned error ${response.status}`);
      }

      const jsonResponse = await response.json();
      const rawText = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed: ExtractedSmsData = JSON.parse(rawText || '{}');

      const usage = jsonResponse.usageMetadata;
      await dbService.logAiUsage({
        operationType: 'SMS_FALLBACK',
        modelId,
        promptTokensRecorded: usage?.promptTokenCount,
        responseTokensRecorded: usage?.candidatesTokenCount,
        estimatedCategory: 'LIGHT',
        latencyMs,
        status: 'SUCCESS',
      });

      return parsed;
    } catch (err: any) {
      await dbService.logAiUsage({
        operationType: 'SMS_FALLBACK',
        modelId,
        latencyMs: Date.now() - startTime,
        status: 'FAILED',
      });
      throw err;
    }
  }

  /**
   * Generates a monthly financial summary from pre-computed local numbers.
   */
  public async generateMonthlyAnalysis(digest: MonthlyAnalysisDigest): Promise<MonthlyAnalysisResult> {
    const { apiKey, modelId } = await this.getApiKeyAndModel();
    const settings = await vaultSecurity.getAiSettings();
    if (!settings.monthlyAnalysisEnabled) {
      throw new Error('Monthly AI analysis is disabled in settings.');
    }

    const startTime = Date.now();
    const prompt = `You are a personal financial advisor. Review this aggregated monthly financial summary for ${digest.monthName} ${digest.year}:
- Total Inflow: ${digest.totalIncome.toLocaleString()} ETB
- Total Outflow: ${digest.totalExpense.toLocaleString()} ETB
- Net Savings: ${digest.netSavings.toLocaleString()} ETB
- Top Spending Categories: ${JSON.stringify(digest.topCategories)}
- Top Recurring Merchants: ${JSON.stringify(digest.topMerchants)}

Generate a helpful, realistic, data-grounded financial analysis report.
Do not invent facts or numbers. Produce:
1. A concise headline summary (e.g., "October Financial Analysis: Spending increased by 12%").
2. 3 bullet highlights on where the money went.
3. 1-2 anomaly observations (e.g., unusual category shifts).
4. 2 practical, encouraging suggestions to save money in an Ethiopian economic context (e.g. reducing dining out or taxi spend).
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

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const latencyMs = Date.now() - startTime;
      if (!response.ok) {
        throw new Error(`Gemini API returned error ${response.status}`);
      }

      const jsonResponse = await response.json();
      const rawText = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed: MonthlyAnalysisResult = JSON.parse(rawText || '{}');

      const usage = jsonResponse.usageMetadata;
      await dbService.logAiUsage({
        operationType: 'MONTHLY_ANALYSIS',
        modelId,
        promptTokensRecorded: usage?.promptTokenCount,
        responseTokensRecorded: usage?.candidatesTokenCount,
        estimatedCategory: 'MEDIUM',
        latencyMs,
        status: 'SUCCESS',
      });

      return parsed;
    } catch (err: any) {
      await dbService.logAiUsage({
        operationType: 'MONTHLY_ANALYSIS',
        modelId,
        latencyMs: Date.now() - startTime,
        status: 'FAILED',
      });
      throw err;
    }
  }
}

export const aiService = new AiService();
