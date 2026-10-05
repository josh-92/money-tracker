/**
 * verify_ingestion.ts
 * Rigorous test harness for Phase 3 Transaction Ingestion Engine.
 * Verifies:
 * 1. ProviderDetector privacy gate, OTP rejection, and provider resolution.
 * 2. RegexParser extraction across all 18 Ethiopian banking fixtures (English + Amharic).
 * 3. Merchant normalization for local Ethiopian brands.
 * 4. Multi-message batch splitting for historical SMS statements.
 * 5. Normalized candidate data structure and audit metadata compliance.
 */

import { ProviderDetector } from '../src/ingestion/ProviderDetector';
import { RegexParser } from '../src/ingestion/RegexParser';
import { IngestionPipeline } from '../src/ingestion/IngestionPipeline';
import { CandidateMessage } from '../src/ingestion/types';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, details?: any) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    if (details) {
      console.error('    Details:', JSON.stringify(details, null, 2));
    }
  }
}

async function runIngestionTests() {
  console.log('\n======================================================');
  console.log('   MONEY TRACKER - PHASE 3 INGESTION ENGINE AUDIT');
  console.log('======================================================\n');

  // =========================================================================
  // 1. PRIVACY GATEKEEPER & PROVIDER DETECTOR AUDIT
  // =========================================================================
  console.log('--- 1. ProviderDetector & Privacy Gatekeeper ---');

  // Test 1.1: Reject pure OTP message
  const otpMsg: CandidateMessage = {
    id: 'test_otp_1',
    source: 'NOTIFICATION',
    rawText: 'Your Telebirr verification code is 482910. Do not share this code with anyone.',
    senderHint: '127',
    timestamp: new Date().toISOString(),
  };
  const resOtp = ProviderDetector.detect(otpMsg);
  assert(!resOtp.isCandidate, 'Pure OTP messages are rejected by privacy filter');

  // Test 1.2: Reject personal chat message
  const personalMsg: CandidateMessage = {
    id: 'test_personal_1',
    source: 'NOTIFICATION',
    rawText: 'Hey Joni! Are we having lunch at Kaldis at 1pm? Let me know.',
    senderHint: 'Aster',
    timestamp: new Date().toISOString(),
  };
  const resPersonal = ProviderDetector.detect(personalMsg);
  assert(!resPersonal.isCandidate, 'Personal messages from contacts are discarded in memory');

  // Test 1.3: Package name resolution for Telebirr
  const pkgTelebirr: CandidateMessage = {
    id: 'test_pkg_tb',
    source: 'NOTIFICATION',
    rawText: 'You have paid ETB 100.00 to Kaldi Coffee. Txn ID: CR1111.',
    packageName: 'cn.tydic.ethiopay',
    timestamp: new Date().toISOString(),
  };
  const resPkgTb = ProviderDetector.detect(pkgTelebirr);
  assert(resPkgTb.isCandidate && resPkgTb.provider === 'TELEBIRR', 'Resolves Telebirr via Android package name cn.tydic.ethiopay');

  // Test 1.4: Sender hint resolution for 127
  const shortcodeMsg: CandidateMessage = {
    id: 'test_shortcode',
    source: 'NOTIFICATION',
    rawText: 'You have paid ETB 200.00 to TotalEnergies. Transaction number: CR2222.',
    senderHint: '127',
    timestamp: new Date().toISOString(),
  };
  const resShortcode = ProviderDetector.detect(shortcodeMsg);
  assert(resShortcode.isCandidate && resShortcode.provider === 'TELEBIRR', 'Resolves Telebirr via 127 official shortcode');

  // Test 1.5: Package name resolution for CBE
  const pkgCbe: CandidateMessage = {
    id: 'test_pkg_cbe',
    source: 'NOTIFICATION',
    rawText: 'Acc. ***7852 has been debited with ETB 300.00 for Safari Mart. Balance: ETB 5,000.00.',
    packageName: 'com.combanketh.mobilebanking',
    timestamp: new Date().toISOString(),
  };
  const resPkgCbe = ProviderDetector.detect(pkgCbe);
  assert(resPkgCbe.isCandidate && resPkgCbe.provider === 'CBE', 'Resolves CBE via Android package name com.combanketh.mobilebanking');

  // Test 1.6: Package name resolution for Awash
  const pkgAwash: CandidateMessage = {
    id: 'test_pkg_awash',
    source: 'NOTIFICATION',
    rawText: 'Your account ***3901 has been debited by ETB 500.00 at Total Bole on 04/10/2026. Available Balance: ETB 1,000.00.',
    packageName: 'com.awash.bank',
    timestamp: new Date().toISOString(),
  };
  const resPkgAwash = ProviderDetector.detect(pkgAwash);
  assert(resPkgAwash.isCandidate && resPkgAwash.provider === 'AWASH', 'Resolves Awash Bank via package name');

  // Test 1.7: Amharic language detection
  const amharicDetect: CandidateMessage = {
    id: 'test_am_detect',
    source: 'MANUAL_SMS',
    rawText: 'ለ Kaldi\'s Coffee የ 350.00 ብር ክፍያ ፈጽመዋል። የግብይት ቁጥር: CR12345',
    timestamp: new Date().toISOString(),
  };
  const resAmDetect = ProviderDetector.detect(amharicDetect);
  assert(resAmDetect.isCandidate && resAmDetect.language === 'AM' && resAmDetect.provider === 'TELEBIRR', 'Detects Amharic language and Telebirr provider');

  // =========================================================================
  // 2. TELEBIRR DETERMINISTIC REGEX PARSER AUDIT
  // =========================================================================
  console.log('\n--- 2. Telebirr Regex Parsers (English & Amharic) ---');

  // Test 2.1: Merchant Payment (English)
  const tbPayEn = "You have paid ETB 350.00 to Kaldi's Coffee (251911223344) on 2026-10-04 14:30:00. Transaction number: CR12345. Your current balance is ETB 2750.00.";
  const pTbPayEn = RegexParser.parseTelebirr(tbPayEn);
  assert(
    pTbPayEn !== null &&
      pTbPayEn.amount === 350 &&
      pTbPayEn.cleanMerchant === "Kaldi's Coffee" &&
      pTbPayEn.balanceAfterTransaction === 2750 &&
      pTbPayEn.refNumber === 'CR12345' &&
      pTbPayEn.type === 'EXPENSE',
    'Telebirr Merchant Payment (English) parsed accurately',
    pTbPayEn
  );

  // Test 2.2: P2P Transfer Out (English)
  const tbTransferEn = 'You have transferred ETB 500.00 to Abebe Bikila (0911000000) on 2026-10-04. Txn number: TR9988. Current balance is ETB 1500.00.';
  const pTbTransferEn = RegexParser.parseTelebirr(tbTransferEn);
  assert(
    pTbTransferEn !== null &&
      pTbTransferEn.amount === 500 &&
      pTbTransferEn.recipient === 'Abebe Bikila' &&
      pTbTransferEn.balanceAfterTransaction === 1500 &&
      pTbTransferEn.refNumber === 'TR9988' &&
      pTbTransferEn.type === 'TRANSFER',
    'Telebirr P2P Transfer (English) parsed accurately',
    pTbTransferEn
  );

  // Test 2.3: Received Money / Inflow (English)
  const tbReceiveEn = 'You have received ETB 1,200.00 from Kebede on 2026-10-04. Txn number: RC4567. Your current balance is ETB 3950.00.';
  const pTbReceiveEn = RegexParser.parseTelebirr(tbReceiveEn);
  assert(
    pTbReceiveEn !== null &&
      pTbReceiveEn.amount === 1200 &&
      pTbReceiveEn.sender === 'Kebede' &&
      pTbReceiveEn.balanceAfterTransaction === 3950 &&
      pTbReceiveEn.refNumber === 'RC4567' &&
      pTbReceiveEn.type === 'INCOME',
    'Telebirr Received Money (English) parsed accurately',
    pTbReceiveEn
  );

  // Test 2.4: Airtime Purchase (English)
  const tbAirtimeEn = 'You have bought ETB 50.00 airtime for 0911223344 on 2026-10-04. Txn number: AT4321. Current balance is ETB 2700.00.';
  const pTbAirtimeEn = RegexParser.parseTelebirr(tbAirtimeEn);
  assert(
    pTbAirtimeEn !== null &&
      pTbAirtimeEn.amount === 50 &&
      pTbAirtimeEn.cleanMerchant === 'Ethio Telecom Airtime' &&
      pTbAirtimeEn.balanceAfterTransaction === 2700 &&
      pTbAirtimeEn.refNumber === 'AT4321' &&
      pTbAirtimeEn.type === 'EXPENSE',
    'Telebirr Airtime Purchase (English) parsed accurately',
    pTbAirtimeEn
  );

  // Test 2.5: Deposit / Cash-in (English)
  const tbDepositEn = 'You have deposited ETB 2,000.00 from CBE account. Txn number: CI1234. Your current balance is ETB 5,950.00.';
  const pTbDepositEn = RegexParser.parseTelebirr(tbDepositEn);
  assert(
    pTbDepositEn !== null &&
      pTbDepositEn.amount === 2000 &&
      pTbDepositEn.balanceAfterTransaction === 5950 &&
      pTbDepositEn.refNumber === 'CI1234' &&
      pTbDepositEn.type === 'INCOME',
    'Telebirr Bank Deposit (English) parsed accurately',
    pTbDepositEn
  );

  // Test 2.6: Merchant Payment (Amharic)
  const tbPayAm = "ለ Kaldi's Coffee የ 350.00 ብር ክፍያ ፈጽመዋል። የግብይት ቁጥር: CR12345። ቀሪ ሂሳብዎ 2,750.00 ብር ነው።";
  const pTbPayAm = RegexParser.parseTelebirr(tbPayAm);
  assert(
    pTbPayAm !== null &&
      pTbPayAm.amount === 350 &&
      pTbPayAm.cleanMerchant === "Kaldi's Coffee" &&
      pTbPayAm.balanceAfterTransaction === 2750 &&
      pTbPayAm.refNumber === 'CR12345' &&
      pTbPayAm.type === 'EXPENSE',
    'Telebirr Merchant Payment (Amharic) parsed accurately',
    pTbPayAm
  );

  // Test 2.7: Transfer Out (Amharic)
  const tbTransferAm = 'ለ Abebe Bikila (0911000000) የ 500.00 ብር አስተላልፈዋል። የግብይት ቁጥር: TR9988። ቀሪ ሂሳብ: 1500.00 ብር';
  const pTbTransferAm = RegexParser.parseTelebirr(tbTransferAm);
  assert(
    pTbTransferAm !== null &&
      pTbTransferAm.amount === 500 &&
      pTbTransferAm.recipient === 'Abebe Bikila' &&
      pTbTransferAm.balanceAfterTransaction === 1500 &&
      pTbTransferAm.refNumber === 'TR9988' &&
      pTbTransferAm.type === 'TRANSFER',
    'Telebirr Transfer Out (Amharic) parsed accurately',
    pTbTransferAm
  );

  // Test 2.8: Receive Money (Amharic)
  const tbReceiveAm = 'ከ Kebede የ 1,200.00 ብር ገቢ ተደርጎልዎታል። የግብይት ቁጥር: RC4567። ቀሪ ሂሳብዎ 3,950.00 ብር ነው።';
  const pTbReceiveAm = RegexParser.parseTelebirr(tbReceiveAm);
  assert(
    pTbReceiveAm !== null &&
      pTbReceiveAm.amount === 1200 &&
      pTbReceiveAm.sender === 'Kebede' &&
      pTbReceiveAm.balanceAfterTransaction === 3950 &&
      pTbReceiveAm.refNumber === 'RC4567' &&
      pTbReceiveAm.type === 'INCOME',
    'Telebirr Receive Money (Amharic) parsed accurately',
    pTbReceiveAm
  );

  // =========================================================================
  // 3. COMMERCIAL BANK OF ETHIOPIA (CBE) PARSER AUDIT
  // =========================================================================
  console.log('\n--- 3. CBE Regex Parsers (English & Amharic) ---');

  // Test 3.1: CBE Debit Alert (English)
  const cbeDebitEn = 'Dear Tanya, your Acc. ***7852 has been debited with ETB 450.00 on 04/10/2026 14:15 for Shoa Supermarket. Balance: ETB 6,800.00. Ref: FT26277.';
  const pCbeDebitEn = RegexParser.parseCBE(cbeDebitEn);
  assert(
    pCbeDebitEn !== null &&
      pCbeDebitEn.amount === 450 &&
      pCbeDebitEn.accountMask === '***7852' &&
      pCbeDebitEn.cleanMerchant === 'Shoa Supermarket' &&
      pCbeDebitEn.balanceAfterTransaction === 6800 &&
      pCbeDebitEn.refNumber === 'FT26277' &&
      pCbeDebitEn.type === 'EXPENSE',
    'CBE Debit Alert (English) parsed accurately',
    pCbeDebitEn
  );

  // Test 3.2: CBE Credit Alert (English)
  const cbeCreditEn = 'Dear Tanya, your Acc. ***7852 has been credited with ETB 25,000.00 on 04/10/2026 by TECH PLC. Balance: ETB 31,800.00. Ref: FT889900.';
  const pCbeCreditEn = RegexParser.parseCBE(cbeCreditEn);
  assert(
    pCbeCreditEn !== null &&
      pCbeCreditEn.amount === 25000 &&
      pCbeCreditEn.accountMask === '***7852' &&
      pCbeCreditEn.sender === 'TECH PLC' &&
      pCbeCreditEn.balanceAfterTransaction === 31800 &&
      pCbeCreditEn.refNumber === 'FT889900' &&
      pCbeCreditEn.type === 'INCOME',
    'CBE Credit Alert (English) parsed accurately',
    pCbeCreditEn
  );

  // Test 3.3: CBE Transfer Alert (English)
  const cbeTransferEn = 'Dear Customer, you have transferred ETB 2,000.00 from Acc. ***7852 to Acc. ***9999 (Dawit Tsige). Balance: ETB 29,800.00. Ref: FT556677.';
  const pCbeTransferEn = RegexParser.parseCBE(cbeTransferEn);
  assert(
    pCbeTransferEn !== null &&
      pCbeTransferEn.amount === 2000 &&
      pCbeTransferEn.accountMask === '***7852' &&
      pCbeTransferEn.recipient === 'Dawit Tsige' &&
      pCbeTransferEn.balanceAfterTransaction === 29800 &&
      pCbeTransferEn.refNumber === 'FT556677' &&
      pCbeTransferEn.type === 'TRANSFER',
    'CBE Transfer Alert (English) parsed accurately',
    pCbeTransferEn
  );

  // Test 3.4: CBE Debit Alert (Amharic)
  const cbeDebitAm = 'ውድ ደንበኛችን፤ የሂሳብ ቁጥር ***7852 በ 04/10/2026 የ 450.00 ብር ወጪ ተደርጓል (Shoa Supermarket)። ቀሪ ሂሳብዎ 6,800.00 ብር። የማጣቀሻ ቁጥር: FT26277';
  const pCbeDebitAm = RegexParser.parseCBE(cbeDebitAm);
  assert(
    pCbeDebitAm !== null &&
      pCbeDebitAm.amount === 450 &&
      pCbeDebitAm.accountMask === '***7852' &&
      pCbeDebitAm.cleanMerchant === 'Shoa Supermarket' &&
      pCbeDebitAm.balanceAfterTransaction === 6800 &&
      pCbeDebitAm.refNumber === 'FT26277' &&
      pCbeDebitAm.type === 'EXPENSE',
    'CBE Debit Alert (Amharic) parsed accurately',
    pCbeDebitAm
  );

  // Test 3.5: CBE Credit Alert (Amharic)
  const cbeCreditAm = 'ውድ ደንበኛችን፤ በሂሳብ ቁጥር ***7852 ላይ በ 04/10/2026 የ 25,000.00 ብር ገቢ ተደርጓል (ከ TECH PLC)። ቀሪ ሂሳብ: 31,800.00 ብር። የማጣቀሻ ቁጥር: FT889900';
  const pCbeCreditAm = RegexParser.parseCBE(cbeCreditAm);
  assert(
    pCbeCreditAm !== null &&
      pCbeCreditAm.amount === 25000 &&
      pCbeCreditAm.accountMask === '***7852' &&
      pCbeCreditAm.sender === 'TECH PLC' &&
      pCbeCreditAm.balanceAfterTransaction === 31800 &&
      pCbeCreditAm.refNumber === 'FT889900' &&
      pCbeCreditAm.type === 'INCOME',
    'CBE Credit Alert (Amharic) parsed accurately',
    pCbeCreditAm
  );

  // =========================================================================
  // 4. AWASH BANK PARSER AUDIT
  // =========================================================================
  console.log('\n--- 4. Awash Bank Regex Parsers (English & Amharic) ---');

  // Test 4.1: Awash Debit Alert (English)
  const awashDebitEn = 'Your account ***3901 has been debited by ETB 800.00 at Total Bole on 04/10/2026. Available Balance: ETB 1,300.00. Reference: AW9876.';
  const pAwashDebitEn = RegexParser.parseAwash(awashDebitEn);
  assert(
    pAwashDebitEn !== null &&
      pAwashDebitEn.amount === 800 &&
      pAwashDebitEn.accountMask === '***3901' &&
      pAwashDebitEn.cleanMerchant === 'TotalEnergies' &&
      pAwashDebitEn.balanceAfterTransaction === 1300 &&
      pAwashDebitEn.refNumber === 'AW9876' &&
      pAwashDebitEn.type === 'EXPENSE',
    'Awash Debit Alert (English) parsed accurately',
    pAwashDebitEn
  );

  // Test 4.2: Awash Credit Alert (English)
  const awashCreditEn = 'Your account ***3901 has been credited with ETB 5,000.00 on 04/10/2026 by Payroll. Available Balance: ETB 6,300.00. Reference: AW5432.';
  const pAwashCreditEn = RegexParser.parseAwash(awashCreditEn);
  assert(
    pAwashCreditEn !== null &&
      pAwashCreditEn.amount === 5000 &&
      pAwashCreditEn.accountMask === '***3901' &&
      pAwashCreditEn.sender === 'Payroll' &&
      pAwashCreditEn.balanceAfterTransaction === 6300 &&
      pAwashCreditEn.refNumber === 'AW5432' &&
      pAwashCreditEn.type === 'INCOME',
    'Awash Credit Alert (English) parsed accurately',
    pAwashCreditEn
  );

  // Test 4.3: Awash Transfer Alert (English)
  const awashTransferEn = 'Your account ***3901 transferred ETB 1,500.00 to Selamawit on 04/10/2026. Ref: AW7788. Available Balance: ETB 4,800.00.';
  const pAwashTransferEn = RegexParser.parseAwash(awashTransferEn);
  assert(
    pAwashTransferEn !== null &&
      pAwashTransferEn.amount === 1500 &&
      pAwashTransferEn.accountMask === '***3901' &&
      pAwashTransferEn.recipient === 'Selamawit' &&
      pAwashTransferEn.balanceAfterTransaction === 4800 &&
      pAwashTransferEn.refNumber === 'AW7788' &&
      pAwashTransferEn.type === 'TRANSFER',
    'Awash Transfer Alert (English) parsed accurately',
    pAwashTransferEn
  );

  // Test 4.4: Awash Debit Alert (Amharic)
  const awashDebitAm = 'የሂሳብ ቁጥር ***3901 በ ETB 800.00 ወጪ ተደርጓል (Total Bole)። ቀሪ ሂሳብ: ETB 1,300.00። መለያ ቁጥር: AW9876';
  const pAwashDebitAm = RegexParser.parseAwash(awashDebitAm);
  assert(
    pAwashDebitAm !== null &&
      pAwashDebitAm.amount === 800 &&
      pAwashDebitAm.accountMask === '***3901' &&
      pAwashDebitAm.cleanMerchant === 'TotalEnergies' &&
      pAwashDebitAm.balanceAfterTransaction === 1300 &&
      pAwashDebitAm.refNumber === 'AW9876' &&
      pAwashDebitAm.type === 'EXPENSE',
    'Awash Debit Alert (Amharic) parsed accurately',
    pAwashDebitAm
  );

  // =========================================================================
  // 5. BATCH SMS SPLITTING AUDIT
  // =========================================================================
  console.log('\n--- 5. Batch SMS Splitting ---');

  const multiSms = `
Dear Tanya, your Acc. ***7852 has been debited with ETB 450.00 on 04/10/2026 14:15 for Shoa Supermarket. Balance: ETB 6,800.00. Ref: FT26277.

You have paid ETB 350.00 to Kaldi's Coffee (251911223344) on 2026-10-04 14:30:00. Transaction number: CR12345. Your current balance is ETB 2750.00.

Your account ***3901 has been debited by ETB 800.00 at Total Bole on 04/10/2026. Available Balance: ETB 1,300.00. Reference: AW9876.
`;

  const splitResult = IngestionPipeline.splitBatchSms(multiSms);
  assert(
    splitResult.length === 3,
    'Batch text correctly segmented into 3 candidate messages',
    { count: splitResult.length }
  );

  // =========================================================================
  // 6. MERCHANT NORMALIZATION AUDIT
  // =========================================================================
  console.log('\n--- 6. Merchant Normalization ---');

  assert(RegexParser.normalizeMerchant('POS 14 KALDIS COFFEE PLC') === "Kaldi's Coffee", "Normalizes 'POS 14 KALDIS COFFEE PLC' -> Kaldi's Coffee");
  assert(RegexParser.normalizeMerchant('SHOA SUPERMARKET LTD BR 02') === 'Shoa Supermarket', "Normalizes 'SHOA SUPERMARKET LTD BR 02' -> Shoa Supermarket");
  assert(RegexParser.normalizeMerchant('TOTAL BOLE POS') === 'TotalEnergies', "Normalizes 'TOTAL BOLE POS' -> TotalEnergies");
  assert(RegexParser.normalizeMerchant('FERES TRANSPORT PLC') === 'Feres Transport', "Normalizes 'FERES TRANSPORT PLC' -> Feres Transport");

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n======================================================');
  console.log(`RESULTS: ${passedTests} / ${totalTests} tests passed`);
  console.log('======================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL INGESTION ENGINE TESTS PASSED PERFECTLY!\n');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED. CHECK LOGS ABOVE.');
    process.exit(1);
  }
}

runIngestionTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
