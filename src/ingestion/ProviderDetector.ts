/**
 * ProviderDetector.ts
 * Intelligent, privacy-preserving gatekeeper and classification engine for candidate messages.
 * 
 * Rules:
 * 1. Privacy First: Non-banking notifications (WhatsApp, Telegram, SMS from friends)
 *    are rejected and immediately discarded in memory.
 * 2. OTP / 2FA Guard: Verification codes and security tokens are rejected.
 * 3. Provider Resolution: Accurately attributes messages to CBE, Telebirr, or Awash Bank
 *    via package name, sender shortcode, or deterministic syntax analysis.
 * 4. Language & Template Classification: Identifies whether the message is English
 *    or Amharic and what transaction action is represented (DEBIT, CREDIT, TRANSFER, AIRTIME).
 */

import { CandidateMessage } from './types';
import { ProviderKey } from '../types/database';

export interface DetectionResult {
  isCandidate: boolean;
  provider: ProviderKey | 'UNKNOWN';
  templateCategory: 'DEBIT' | 'CREDIT' | 'TRANSFER' | 'AIRTIME' | 'UNKNOWN';
  language: 'EN' | 'AM';
  reason?: string;
  templateId?: string;
}

export class ProviderDetector {
  /**
   * Main gatekeeper method.
   * Evaluates if a message is an eligible Ethiopian banking candidate.
   */
  public static detect(candidate: CandidateMessage): DetectionResult {
    const raw = candidate.rawText ? candidate.rawText.trim() : '';
    const sender = (candidate.senderHint || '').trim().toUpperCase();
    const pkg = (candidate.packageName || '').trim().toLowerCase();
    const title = (candidate.title || '').trim().toUpperCase();

    if (!raw) {
      return {
        isCandidate: false,
        provider: 'UNKNOWN',
        templateCategory: 'UNKNOWN',
        language: 'EN',
        reason: 'Empty text payload.',
      };
    }

    // 1. Strict Security & Privacy Filter: Reject pure OTP / Verification messages
    const isPureOtp =
      /\b(verification\s*code|one[-\s]time[-\s]password|your\s*otp\s*is|is\s*your\s*otp|security\s*code|auth\s*code)\b/i.test(raw) ||
      /የማረጋገጫ\s*ኮድ|ይህን\s*ሚስጥራዊ\s*ቁጥር|የይለፍ\s*ቃል/i.test(raw);

    const hasFinancialMovement =
      /\b(debited|credited|paid|transferred|received|withdrawn|bought|ETB|balance)\b/i.test(raw) ||
      /ወጪ|ገቢ|ክፍያ|አስተላልፈዋል|ተቀብለዋል|ቀሪ\s*ሂሳብ|ብር/i.test(raw);

    if (isPureOtp && !hasFinancialMovement) {
      return {
        isCandidate: false,
        provider: 'UNKNOWN',
        templateCategory: 'UNKNOWN',
        language: 'EN',
        reason: 'Security code / OTP discarded for privacy.',
      };
    }

    // 2. Identify Language
    const isAmharic = /[\u1200-\u137F]/.test(raw);
    const language: 'EN' | 'AM' = isAmharic ? 'AM' : 'EN';

    // 3. Provider Resolution
    let provider: ProviderKey | 'UNKNOWN' = 'UNKNOWN';

    // Check Package Name first (Android notifications from official apps)
    if (pkg.includes('tydic.ethiopay') || pkg.includes('telebirr') || pkg.includes('ethiomobilemoney')) {
      provider = 'TELEBIRR';
    } else if (pkg.includes('combanketh') || pkg.includes('cbebirr') || pkg.includes('cbe')) {
      provider = 'CBE';
    } else if (pkg.includes('awash') || pkg.includes('awashpay')) {
      provider = 'AWASH';
    }

    // Check Sender Shortcode / Title if not resolved
    if (provider === 'UNKNOWN') {
      if (
        sender === '127' ||
        sender.includes('TELEBIRR') ||
        sender.includes('ETHIOTELECOM') ||
        title === '127' ||
        title.includes('TELEBIRR') ||
        title.includes('ቴሌብር')
      ) {
        provider = 'TELEBIRR';
      } else if (
        sender.includes('CBE') ||
        sender.includes('COMMERCIAL BANK') ||
        sender === '951' ||
        title.includes('CBE') ||
        title.includes('COMMERCIAL BANK') ||
        title.includes('951')
      ) {
        provider = 'CBE';
      } else if (
        sender.includes('AWASH') ||
        sender === '8900' ||
        title.includes('AWASH') ||
        title.includes('8900') ||
        title.includes('አዋሽ')
      ) {
        provider = 'AWASH';
      }
    }

    // Text-based heuristics if sender is missing or generic (e.g. from clipboard or manual paste)
    if (provider === 'UNKNOWN') {
      if (
        /\b(?:telebirr|127|cn\.tydic\.ethiopay)\b/i.test(raw) ||
        /ቴሌብር|የቴሌብር/i.test(raw) ||
        /(?:Transaction\s+number|Txn\s+(?:number|ID|No)|Transaction\s+ID)(?:\s+is)?[:\s]*(?:CR|TR|RC|AT|CO|CI)[A-Z0-9]+/i.test(raw) ||
        /የግብይት\s*ቁጥር[:\s]*(?:CR|TR|RC|AT|CO|CI)[A-Z0-9]+/i.test(raw) ||
        /(?:transferred|sent)\s+ETB\s+[\d,]+/i.test(raw) ||
        /(?:ወደ|ለ)\s+.+?\s+የ\s*[\d,]+\s*ብር\s*አስተላልፈዋል/i.test(raw) ||
        /የ\s*[\d,]+\s*ብር\s*(?:ወደ|ለ)\s+.+?\s*አስተላልፈዋል/i.test(raw)
      ) {
        provider = 'TELEBIRR';
      } else if (
        /\b(?:CBE|Commercial Bank of Ethiopia|CBEBirr)\b/i.test(raw) ||
        /(?:Ref|Txn|Reference)(?:\s+is)?[:\s]+FT\d{4,}/i.test(raw) ||
        /\bFT\d{5,}\b/i.test(raw) ||
        /ውድ\s*ደንበኛችን|የሂሳብ\s*ቁጥር\s*[*xX\d]+.*(?:ወጪ|ገቢ)\s*ተደርጓል/i.test(raw)
      ) {
        provider = 'CBE';
      } else if (
        /\b(?:Awash Bank|Awash|AwashBirr|8900)\b/i.test(raw) ||
        /(?:Reference|Ref|Txn ID|Txn)(?:\s+is)?[:\s]+AW\d+/i.test(raw) ||
        /\bAW\d{4,}\b/i.test(raw) ||
        /payment\s+of\s+[\d,]+(?:\.\d{1,2})?\s*ETB\s+charge/i.test(raw) ||
        /አዋሽ\s*ባንክ|አዋሽ/i.test(raw) ||
        /(?:account|Acc\.?)\s*[*xX\d]+\s+(?:has\s+been|is|was)?\s*(?:debited|credited)/i.test(raw)
      ) {
        provider = 'AWASH';
      } else if (/transferred\s+to\s+other\s+bank/i.test(raw)) {
        if (/FT\d+/i.test(raw)) provider = 'CBE';
        else if (/AW\d+|Awash/i.test(raw)) provider = 'AWASH';
        else provider = 'CBE';
      }
    }

    // 4. Privacy Check: If provider is still UNKNOWN and there's no clear financial marker, reject!
    if (provider === 'UNKNOWN' && !hasFinancialMovement) {
      return {
        isCandidate: false,
        provider: 'UNKNOWN',
        templateCategory: 'UNKNOWN',
        language,
        reason: 'Non-banking text discarded.',
      };
    }

    // 5. Template Category Classification
    let templateCategory: 'DEBIT' | 'CREDIT' | 'TRANSFER' | 'AIRTIME' | 'UNKNOWN' = 'UNKNOWN';
    let templateId = `${provider.toLowerCase()}_unknown`;

    if (language === 'EN') {
      if (/transferred\s+ETB|transfer\s+to|sent\s+ETB|transferred\s+to\s+other\s+bank/i.test(raw)) {
        templateCategory = 'TRANSFER';
        templateId = `${provider.toLowerCase()}_transfer_en`;
      } else if (/paid\s+ETB|debited\s+(?:with|by)\s+ETB|bought\s+ETB.*airtime|withdrawn|payment\s+of/i.test(raw)) {
        if (/airtime/i.test(raw)) {
          templateCategory = 'AIRTIME';
          templateId = `${provider.toLowerCase()}_airtime_en`;
        } else {
          templateCategory = 'DEBIT';
          templateId = `${provider.toLowerCase()}_debit_en`;
        }
      } else if (/credited\s+with\s+ETB|received\s+ETB|deposited\s+ETB/i.test(raw)) {
        templateCategory = 'CREDIT';
        templateId = `${provider.toLowerCase()}_credit_en`;
      }
    } else {
      // Amharic classification
      if (/አስተላልፈዋል|ወደ\s+.*\s+የ\s+.*\s*ብር/i.test(raw)) {
        templateCategory = 'TRANSFER';
        templateId = `${provider.toLowerCase()}_transfer_am`;
      } else if (/ክፍያ\s*ፈጽመዋል|ወጪ\s*ተደርጓል/i.test(raw)) {
        templateCategory = 'DEBIT';
        templateId = `${provider.toLowerCase()}_debit_am`;
      } else if (/የአየር\s*ሰዓት\s*.*ገዝተዋል/i.test(raw)) {
        templateCategory = 'AIRTIME';
        templateId = `${provider.toLowerCase()}_airtime_am`;
      } else if (/ገቢ\s*ተደርጓል|ተቀብለዋል/i.test(raw)) {
        templateCategory = 'CREDIT';
        templateId = `${provider.toLowerCase()}_credit_am`;
      }
    }

    return {
      isCandidate: true,
      provider,
      templateCategory,
      language,
      templateId,
    };
  }
}
