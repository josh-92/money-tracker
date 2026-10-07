/**
 * verify_regex.ts
 * Rigorous automated verification script for Ethiopian Bank Regex Parser.
 * Runs directly with Node.js to validate extraction accuracy.
 */

import { RegexParser } from '../src/ingestion/RegexParser';

const testCases = [
  {
    name: 'CBE Debit Alert',
    text: 'Dear Tanya, your Acc. ***7852 has been debited with ETB 450.00 on 04/10/2026 14:15 for Shoa Supermarket. Balance: ETB 6,800.00. Ref: FT26277.',
    expected: { provider: 'CBE', type: 'EXPENSE', amount: 450, merchant: 'Shoa Supermarket', balance: 6800, ref: 'FT26277' },
  },
  {
    name: 'CBE Credit Salary Alert',
    text: 'Dear Tanya, your Acc. ***7852 has been credited with ETB 25,000.00 on 04/10/2026 by TECH PLC. Balance: ETB 31,800.00.',
    expected: { provider: 'CBE', type: 'INCOME', amount: 25000, merchant: 'TECH PLC', balance: 31800 },
  },
  {
    name: 'Telebirr Merchant Payment',
    text: "You have paid ETB 350.00 to Kaldi's Coffee (251911223344) on 2026-10-04 14:30:00. Transaction number: CR12345. Your current balance is ETB 2750.00.",
    expected: { provider: 'TELEBIRR', type: 'EXPENSE', amount: 350, merchant: "Kaldi's Coffee", balance: 2750, ref: 'CR12345' },
  },
  {
    name: 'Telebirr P2P Transfer',
    text: 'You have transferred ETB 500.00 to Abebe Bikila (0911000000) on 2026-10-04. Txn number: TR9988. Current balance is ETB 1500.00.',
    expected: { provider: 'TELEBIRR', type: 'TRANSFER', amount: 500, merchant: 'Abebe Bikila', balance: 1500, ref: 'TR9988' },
  },
  {
    name: 'Telebirr Amharic Payment',
    text: "ለ Kaldi's Coffee የ 350.00 ብር ክፍያ ፈጽመዋል። የግብይት ቁጥር: CR12345",
    expected: { provider: 'TELEBIRR', type: 'EXPENSE', amount: 350, merchant: "Kaldi's Coffee", ref: 'CR12345' },
  },
  {
    name: 'Awash Bank Debit Alert',
    text: 'Your account ***3901 has been debited by ETB 800.00 at Total Bole on 04/10/2026. Available Balance: ETB 1,300.00. Reference: AW9876.',
    expected: { provider: 'AWASH', type: 'EXPENSE', amount: 800, merchant: 'TotalEnergies', balance: 1300, ref: 'AW9876' },
  },
  {
    name: 'Telebirr Outgoing Transfer (No inline date)',
    text: 'You have transferred ETB 500.00 to Abebe Bikila (0911000000). Txn number: TR9988. Current balance is ETB 1500.00.',
    expected: { provider: 'TELEBIRR', type: 'TRANSFER', amount: 500, merchant: 'Abebe Bikila', balance: 1500, ref: 'TR9988' },
  },
  {
    name: 'Telebirr Outgoing Transfer (Amharic start with ለ)',
    text: 'ለ Abebe Bikila (0911000000) የ 500.00 ብር አስተላልፈዋል። የግብይት ቁጥር: TR9988። ቀሪ ሂሳብ: 1500.00 ብር',
    expected: { provider: 'TELEBIRR', type: 'TRANSFER', amount: 500, merchant: 'Abebe Bikila', balance: 1500, ref: 'TR9988' },
  },
  {
    name: 'Telebirr Outgoing Transfer (Amharic start with ወደ)',
    text: 'ወደ Abebe Bikila (0911000000) የ 500.00 ብር አስተላልፈዋል። የግብይት ቁጥር: TR9988። ቀሪ ሂሳብ: 1500.00 ብር',
    expected: { provider: 'TELEBIRR', type: 'TRANSFER', amount: 500, merchant: 'Abebe Bikila', balance: 1500, ref: 'TR9988' },
  },
  {
    name: 'Telebirr Outgoing Transfer (With successfully)',
    text: 'Transferred ETB 500.00 to Abebe Bikila successfully. Balance: ETB 1,500.00. Txn No: TR9988',
    expected: { provider: 'TELEBIRR', type: 'TRANSFER', amount: 500, merchant: 'Abebe Bikila', balance: 1500, ref: 'TR9988' },
  },
  {
    name: 'Awash Credit Alert (Standard SMS)',
    text: 'Your account ***3901 has been credited with ETB 5,000.00 on 04/10/2026. Available Balance: ETB 6,300.00. Reference: AW5432.',
    expected: { provider: 'AWASH', type: 'INCOME', amount: 5000, merchant: 'Awash Credit', balance: 6300, ref: 'AW5432' },
  },
  {
    name: 'Awash Credit Alert (With sender)',
    text: 'Acc 0132*** is credited with ETB 2,500.00 from Abebe Bikila. Ref: 98765.',
    expected: { provider: 'AWASH', type: 'INCOME', amount: 2500, merchant: 'Abebe Bikila', ref: '98765' },
  },
  {
    name: 'Awash Credit Alert (Without with/by token)',
    text: 'Your account ***3901 has been credited ETB 5,000.00 on 04/10/2026. Available Balance: ETB 6,300.00. Reference: AW5432.',
    expected: { provider: 'AWASH', type: 'INCOME', amount: 5000, merchant: 'Awash Credit', balance: 6300, ref: 'AW5432' },
  },
  {
    name: 'Awash POS Purchase Debit Alert',
    text: 'Dear Customer, Acc ***3901 is debited with ETB 1,200.00 for POS Purchase. Available Bal: ETB 100.00. Ref: AW123456.',
    expected: { provider: 'AWASH', type: 'EXPENSE', amount: 1200, merchant: 'POS Purchase', balance: 100, ref: 'AW123456' },
  },
  {
    name: 'Awash Debit Alert (Without by/with token)',
    text: 'Your account ***3901 was debited ETB 450.00. Available Bal: ETB 2,500.00. Ref: 12345.',
    expected: { provider: 'AWASH', type: 'EXPENSE', amount: 450, merchant: 'Awash Debit', balance: 2500, ref: '12345' },
  },
  {
    name: 'Awash 8900 Shortcode Hint',
    text: 'Your account ***3901 has been credited ETB 1,500.00. Ref: AW1122.',
    senderHint: '8900',
    expected: { provider: 'AWASH', type: 'INCOME', amount: 1500, merchant: 'Awash Credit', ref: 'AW1122' },
  },
  {
    name: 'Awash Birr Wallet Inflow',
    text: 'You have received ETB 1,000.00 from Abebe Bikila (0911223344) on 04/10/2026. Txn ID: AW1234. Your balance is ETB 2,500.00.',
    expected: { provider: 'AWASH', type: 'INCOME', amount: 1000, merchant: 'Abebe Bikila', balance: 2500, ref: 'AW1234' },
  },
  {
    name: 'Awash Amharic Debit (ከሂሳብ ቁጥር)',
    text: 'ከሂሳብ ቁጥር ***3901 የ 800.00 ብር ወጪ ተደርጓል (Total Bole)። ቀሪ ሂሳብ: 1,300.00 ብር። መለያ ቁጥር: AW9876',
    expected: { provider: 'AWASH', type: 'EXPENSE', amount: 800, merchant: 'TotalEnergies', balance: 1300, ref: 'AW9876' },
  },
  {
    name: 'Awash Amharic Credit (የሂሳብ ቁጥር)',
    text: 'የሂሳብ ቁጥር ***3901 የ 5,000.00 ብር ገቢ ተደርጓል (ከ Payroll)። ቀሪ ሂሳብ: 6,300.00 ብር። መለያ ቁጥር: AW5432',
    expected: { provider: 'AWASH', type: 'INCOME', amount: 5000, merchant: 'Payroll', balance: 6300, ref: 'AW5432' },
  },
  {
    name: 'Telebirr Outgoing Transfer (With "is" in reference string)',
    text: 'You have transferred ETB 15.00 to Dawit Tsige on 2026-10-07. Txn number is TR9988. Current balance is ETB 1500.00.',
    expected: { provider: 'TELEBIRR', type: 'TRANSFER', amount: 15, merchant: 'Dawit Tsige', balance: 1500, ref: 'TR9988' },
  },
  {
    name: 'AwashBirr Pro School Fees Payment',
    text: 'Dear Customer, School fees payment of 1,200.00 ETB charge- 0.00 ETB on 2026-10-07 09:12. Ref: AW123456. Your balance is 5,400.00 ETB.',
    senderHint: 'com.sc.awashpay',
    expected: { provider: 'AWASH', type: 'EXPENSE', amount: 1200, merchant: 'School fees', balance: 5400, ref: 'AW123456' },
  },
  {
    name: 'Awash Bank Other-Bank Transfer',
    text: 'Awash Bank: Dear Customer , You have transferred to other bank ETB 100.00 to Abebe Bikila on 2026-10-07 10:00:00. Balance: ETB 1,500.00. Ref: AW5566.',
    expected: { provider: 'AWASH', type: 'TRANSFER', amount: 100, merchant: 'Abebe Bikila', balance: 1500, ref: 'AW5566' },
  },
  {
    name: 'CBE Other-Bank Transfer',
    text: 'Dear Customer , You have transferred to other bank ETB 20 to Abebe on 07/10/2026. Ref: FT123456. Balance: ETB 500.',
    expected: { provider: 'CBE', type: 'TRANSFER', amount: 20, merchant: 'Abebe', balance: 500, ref: 'FT123456' },
  },
];

console.log('--- RUNNING ETHIOPIAN BANK REGEX VERIFICATION ---');
let passed = 0;

for (const tc of testCases) {
  const result = RegexParser.parse(tc.text, (tc as any).senderHint);
  if (!result) {
    console.error(`❌ FAILED: ${tc.name} returned null`);
    continue;
  }

  const amountOk = result.amount === tc.expected.amount;
  const typeOk = result.type === tc.expected.type;
  const providerOk = result.provider === tc.expected.provider;
  const merchantOk = result.cleanMerchant?.toLowerCase().includes(tc.expected.merchant.toLowerCase());
  const refOk = (tc.expected as any).ref ? result.refNumber === (tc.expected as any).ref : true;

  if (amountOk && typeOk && providerOk && merchantOk && refOk) {
    console.log(`✅ PASSED: ${tc.name} -> ${result.provider} ${result.type} ${result.amount} ETB (${result.cleanMerchant}) [Ref: ${result.refNumber}]`);
    passed++;
  } else {
    console.error(`❌ MISMATCH in ${tc.name}:`, { expected: tc.expected, got: result });
  }
}

// Reference validation tests
console.log('\n--- VERIFYING REFERENCE VALIDATOR ---');
const refChecks = [
  { ref: 'is', expected: false },
  { ref: 'IS', expected: false },
  { ref: 'to', expected: false },
  { ref: 'on', expected: false },
  { ref: 'TR9988', expected: true },
  { ref: 'FT26277', expected: true },
  { ref: 'AW9876', expected: true },
  { ref: 'CR12345', expected: true },
  { ref: 'AW123456', expected: true },
];

let refPassed = 0;
for (const rc of refChecks) {
  const actual = RegexParser.isValidReference(rc.ref);
  if (actual === rc.expected) {
    console.log(`✅ Ref '${rc.ref}' validity: ${actual} (expected ${rc.expected})`);
    refPassed++;
  } else {
    console.error(`❌ Ref '${rc.ref}' failed: got ${actual}, expected ${rc.expected}`);
  }
}

console.log(`\nResults: ${passed} of ${testCases.length} parser tests passed.`);
console.log(`Reference validation: ${refPassed} of ${refChecks.length} checks passed.\n`);

if (passed !== testCases.length || refPassed !== refChecks.length) {
  process.exit(1);
}
