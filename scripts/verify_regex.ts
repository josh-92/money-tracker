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
];

console.log('--- RUNNING ETHIOPIAN BANK REGEX VERIFICATION ---');
let passed = 0;

for (const tc of testCases) {
  const result = RegexParser.parse(tc.text);
  if (!result) {
    console.error(`❌ FAILED: ${tc.name} returned null`);
    continue;
  }

  const amountOk = result.amount === tc.expected.amount;
  const typeOk = result.type === tc.expected.type;
  const providerOk = result.provider === tc.expected.provider;
  const merchantOk = result.cleanMerchant?.toLowerCase().includes(tc.expected.merchant.toLowerCase());

  if (amountOk && typeOk && providerOk && merchantOk) {
    console.log(`✅ PASSED: ${tc.name} -> ${result.provider} ${result.type} ${result.amount} ETB (${result.cleanMerchant})`);
    passed++;
  } else {
    console.error(`❌ MISMATCH in ${tc.name}:`, { expected: tc.expected, got: result });
  }
}

console.log(`\nResults: ${passed} of ${testCases.length} tests passed.\n`);
if (passed !== testCases.length) {
  process.exit(1);
}
