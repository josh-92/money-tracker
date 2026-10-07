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

    // 1. Language Identification
    const isAmharic = /[\u1200-\u137F]/.test(raw);
    const language: 'EN' | 'AM' = isAmharic ? 'AM' : 'EN';

    // 2. Strict Source Gate for NOTIFICATIONS
    // Notifications MUST come from a trusted financial identity (official package or verified shortcode/sender)
    if (candidate.source === 'NOTIFICATION') {
      const isOfficialTelebirr =
        pkg.includes('tydic.ethiopay') ||
        pkg.includes('telebirr') ||
        pkg.includes('ethiomobilemoney') ||
        sender === '127' ||
        title === '127' ||
        sender.includes('TELEBIRR') ||
        title.includes('TELEBIRR') ||
        title.includes('ቴሌብር');

      const isOfficialCBE =
        pkg.includes('combanketh') ||
        pkg.includes('cbebirr') ||
        sender === '951' ||
        title === '951' ||
        sender.includes('CBE') ||
        title.includes('CBE') ||
        sender.includes('COMMERCIAL BANK') ||
        title.includes('COMMERCIAL BANK');

      const isOfficialAwash =
        pkg.includes('awashpay') ||
        pkg.includes('awash') ||
        sender === '8900' ||
        title === '8900' ||
        sender.includes('AWASH') ||
        title.includes('AWASH') ||
        title.includes('አዋሽ');

      if (!isOfficialTelebirr && !isOfficialCBE && !isOfficialAwash) {
        return {
          isCandidate: false,
          provider: 'UNKNOWN',
          templateCategory: 'UNKNOWN',
          language,
          reason: 'Notification from untrusted source discarded (e.g. 131, Telegram, generic SMS).',
        };
      }
    }

    // 3. Strict Content Gate for CLIPBOARD
    if (candidate.source === 'CLIPBOARD') {
      // Discard developer logs, stack traces, API error strings, JSON, URLs
      const isDevArtifact =
        /^(?:error:|exception:|traceback|fail|at\s+[\w\.\/]+:\d+|npm|npx|git|\{|\[|<|http[s]?:\/\/)/i.test(raw) ||
        /\b(?:console\.log|undefined|null|TypeError|SyntaxError|ReferenceError)\b/i.test(raw);
      if (isDevArtifact) {
        return {
          isCandidate: false,
          provider: 'UNKNOWN',
          templateCategory: 'UNKNOWN',
          language,
          reason: 'Development artifact or error log discarded from clipboard.',
        };
      }

      // Clipboard MUST contain a recognizable monetary amount with currency
      const hasMonetaryAmount = /(?:ETB|ብር)\s*[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s*(?:ETB|ብር)/i.test(raw);
      if (!hasMonetaryAmount) {
        return {
          isCandidate: false,
          provider: 'UNKNOWN',
          templateCategory: 'UNKNOWN',
          language,
          reason: 'Clipboard text lacks valid monetary amount and currency.',
        };
      }
    }

    // 4. Strict Security, Authentication & PIN Failure Filter (All sources)
    const isPinOrSecurityError =
      /(?:pin|password|credential|login).*(?:incorrect|wrong|failed|invalid|error|sorry)|sorry.*(?:pin|password)|ሚስጥራዊ\s*ቁጥር.*ተሳስቷል/i.test(raw);
    const isServiceOrPromo =
      /(?:package\s*has\s*been\s*activated|internet\s*package|bonus|unlimited\s*voice|service\s*notification|monthly\s*fee)/i.test(raw);
    const isPureOtp =
      /\b(verification\s*code|one[-\s]time[-\s]password|your\s*otp\s*is|is\s*your\s*otp|security\s*code|auth\s*code|reset\s*your\s*password)\b/i.test(raw) ||
      /የማረጋገጫ\s*ኮድ|ይህን\s*ሚስጥራዊ\s*ቁጥር|የይለፍ\s*ቃል/i.test(raw);

    const hasFinancialMovement =
      /\b(debited|credited|paid|transferred|received|withdrawn|bought\s+ETB.*airtime|payment\s+of)\b/i.test(raw) ||
      /ወጪ|ገቢ|ክፍያ|አስተላልፈዋል|ተቀብለዋል|ተልኳል/i.test(raw);

    if (isPinOrSecurityError || isServiceOrPromo) {
      return {
        isCandidate: false,
        provider: 'UNKNOWN',
        templateCategory: 'UNKNOWN',
        language,
        reason: 'Security alert, PIN failure, or telecom service notification discarded.',
      };
    }

    if (isPureOtp && !hasFinancialMovement) {
      return {
        isCandidate: false,
        provider: 'UNKNOWN',
        templateCategory: 'UNKNOWN',
        language,
        reason: 'Security code / OTP discarded for privacy.',
      };
    }

    if (!hasFinancialMovement) {
      return {
        isCandidate: false,
        provider: 'UNKNOWN',
        templateCategory: 'UNKNOWN',
        language,
        reason: 'Text contains no financial transaction movement.',
      };
    }

    // 5. Provider Resolution
    let provider: ProviderKey | 'UNKNOWN' = 'UNKNOWN';

    // A. Package Name / Official Sender hint
    if (pkg.includes('tydic.ethiopay') || pkg.includes('telebirr') || pkg.includes('ethiomobilemoney')) {
      provider = 'TELEBIRR';
    } else if (pkg.includes('combanketh') || pkg.includes('cbebirr')) {
      provider = 'CBE';
    } else if (pkg.includes('awashpay') || pkg.includes('awash')) {
      provider = 'AWASH';
    }

    if (provider === 'UNKNOWN') {
      if (
        sender === '127' ||
        sender.includes('TELEBIRR') ||
        title === '127' ||
        title.includes('TELEBIRR') ||
        title.includes('ቴሌብር')
      ) {
        provider = 'TELEBIRR';
      } else if (
        sender === '951' ||
        sender.includes('CBE') ||
        sender.includes('COMMERCIAL BANK') ||
        title === '951' ||
        title.includes('CBE') ||
        title.includes('COMMERCIAL BANK')
      ) {
        provider = 'CBE';
      } else if (
        sender === '8900' ||
        sender.includes('AWASH') ||
        title === '8900' ||
        title.includes('AWASH') ||
        title.includes('አዋሽ')
      ) {
        provider = 'AWASH';
      }
    }

    // B. Deterministic Content Signatures (for clipboard / SMS / manual text)
    if (provider === 'UNKNOWN') {
      if (
        /\b(?:telebirr|127|cn\.tydic\.ethiopay)\b/i.test(raw) ||
        /ቴሌብር|የቴሌብር/i.test(raw) ||
        /(?:Transaction\s+number|Txn\s+(?:number|ID|No)|Transaction\s+ID)(?:\s+is)?[:\s]*(?:CR|TR|RC|AT|CO|CI)\d[A-Z0-9]{3,}/i.test(raw) ||
        /የግብይት\s*ቁጥር[:\s]*(?:CR|TR|RC|AT|CO|CI)\d[A-Z0-9]{3,}/i.test(raw) ||
        /\b(?:CR|TR|RC|AT|CO|CI)\d[A-Z0-9]{3,}\b/i.test(raw)
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
        /አዋሽ\s*ባንክ|አዋሽ/i.test(raw) ||
        /(?:account|Acc\.?)\s*(?:0132[*xX\d]+|[*xX\d]+3901)\s+(?:has\s+been|is|was)?\s*(?:debited|credited)/i.test(raw)
      ) {
        provider = 'AWASH';
      } else if (/transferred\s+to\s+other\s+bank/i.test(raw)) {
        if (/FT\d+/i.test(raw) || /CBE/i.test(raw)) provider = 'CBE';
        else if (/AW\d+|Awash/i.test(raw)) provider = 'AWASH';
        else if (sender.includes('CBE') || title.includes('CBE')) provider = 'CBE';
        else if (sender.includes('AWASH') || title.includes('AWASH')) provider = 'AWASH';
      }
    }

    // 6. Absolute Provider Isolation Invariant:
    // If provider cannot be established, the message is NOT an eligible transaction candidate!
    if (provider === 'UNKNOWN') {
      return {
        isCandidate: false,
        provider: 'UNKNOWN',
        templateCategory: 'UNKNOWN',
        language,
        reason: 'Text discarded: financial provider identity could not be verified.',
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
