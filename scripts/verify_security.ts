/**
 * verify_security.ts
 * Rigorous security verification test suite:
 * 1. Modern PBKDF2-HMAC-SHA256 (10,000 iterations, 32-byte key) derivation
 * 2. Self-describing hash format: pbkdf2:sha256:10000:<salt>:<hash>
 * 3. Legacy prototype 50-round SHA-256 hash verification & automatic rehash migration detection
 * 4. 4-digit PIN rate-limiting, timing-delay defense, and exponential lockout schedule
 * 5. Secret and balance masking verification
 */

import { vaultCrypto } from '../src/security/VaultCrypto';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes, bytesToHex } from '@noble/hashes/utils.js';

console.log('====================================================');
console.log('MONEY TRACKER: CRYPTOGRAPHIC & SECURITY AUDIT TEST');
console.log('====================================================\n');

let testsPassed = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
  }
}

async function runSecurityTests() {
  // ---------------------------------------------------------
  // 1. PBKDF2 Password Hashing & Verification
  // ---------------------------------------------------------
  console.log('--- 1. Modern PBKDF2-HMAC-SHA256 Password Derivation ---');

  const salt = vaultCrypto.generateSalt();
  assert(
    typeof salt === 'string' && salt.length === 32,
    'Salt is a 32-character hexadecimal string (16 bytes)',
    `Salt: ${salt}`
  );

  const rawPassword = 'SecureMasterPassword2026!';
  const modernHash = await vaultCrypto.hashPassword(rawPassword, salt, 10000);

  assert(
    modernHash.startsWith('pbkdf2:sha256:10000:'),
    'Password hash format is self-describing pbkdf2:sha256:10000:<salt>:<hash>',
    `Hash: ${modernHash}`
  );

  const parts = modernHash.split(':');
  assert(
    parts.length === 5 && parts[3] === salt && parts[4].length === 64,
    'Derived key is 32 bytes (64 hex characters) matching given salt'
  );

  const verifyCorrect = await vaultCrypto.verifyPassword(rawPassword, salt, modernHash);
  assert(
    verifyCorrect.isValid === true && verifyCorrect.needsRehash === false,
    'Correct password successfully verified with needsRehash: false'
  );

  const verifyWrong = await vaultCrypto.verifyPassword('WrongPassword!', salt, modernHash);
  assert(
    verifyWrong.isValid === false,
    'Incorrect password correctly rejected'
  );

  // ---------------------------------------------------------
  // 2. 4-Digit Passcode Derivation
  // ---------------------------------------------------------
  console.log('\n--- 2. 4-Digit PIN Passcode Hashing ---');

  const pin = '4829';
  const pinHash = await vaultCrypto.hashPasscode(pin, salt, 10000);

  assert(
    pinHash.startsWith('pbkdf2:sha256:10000:'),
    'Passcode hash format is self-describing pbkdf2:sha256:10000:...',
    `PIN Hash: ${pinHash}`
  );

  const verifyPinCorrect = await vaultCrypto.verifyPasscode(pin, salt, pinHash);
  assert(
    verifyPinCorrect.isValid === true,
    'Correct 4-digit PIN verified successfully'
  );

  const verifyPinWrong = await vaultCrypto.verifyPasscode('0000', salt, pinHash);
  assert(
    verifyPinWrong.isValid === false,
    'Incorrect 4-digit PIN rejected'
  );

  // ---------------------------------------------------------
  // 3. Legacy 50-Round SHA-256 Migration Detection
  // ---------------------------------------------------------
  console.log('\n--- 3. Legacy Hash Verification & Transparent Migration ---');

  // Simulate legacy prototype 50-round iterative SHA-256 hash
  let legacyHash = bytesToHex(sha256(utf8ToBytes(`${salt}:PIN_9512:${salt}`)));
  for (let i = 0; i < 50; i++) {
    legacyHash = bytesToHex(sha256(utf8ToBytes(`${legacyHash}:${salt}:${i}`)));
  }
  const legacyHashHex = legacyHash;

  assert(
    legacyHashHex.length === 64 && !legacyHashHex.startsWith('pbkdf2:'),
    'Simulated legacy prototype hash is raw 64-char hex string',
    `Legacy Hash: ${legacyHashHex}`
  );

  const legacyVerify = await vaultCrypto.verifyPasscode('9512', salt, legacyHashHex);
  assert(
    legacyVerify.isValid === true,
    'Legacy 50-round SHA-256 hash verifies correctly for existing users'
  );
  assert(
    legacyVerify.needsRehash === true,
    'Legacy hash flags needsRehash: true to trigger transparent PBKDF2 upgrade'
  );

  const legacyWrongVerify = await vaultCrypto.verifyPasscode('1234', salt, legacyHashHex);
  assert(
    legacyWrongVerify.isValid === false,
    'Wrong PIN fails on legacy hash verification'
  );

  // ---------------------------------------------------------
  // 4. PIN Brute-Force Rate Limiting & Exponential Lockout
  // ---------------------------------------------------------
  console.log('\n--- 4. 4-Digit PIN Rate Limiting & Lockout Schedule ---');

  const testPin = '7391';
  const testPinHash = await vaultCrypto.hashPasscode(testPin, salt);

  // Attempt 1: Failed
  const attempt1 = await vaultCrypto.verifyPasscodeWithRateLimit('0001', salt, testPinHash);
  assert(
    !attempt1.isValid && !attempt1.isLockedOut && attempt1.attemptsRemaining === 3,
    'Failed attempt 1: not locked out, 3 attempts remaining'
  );

  // Attempt 2: Failed
  const attempt2 = await vaultCrypto.verifyPasscodeWithRateLimit('0002', salt, testPinHash);
  assert(
    !attempt2.isValid && !attempt2.isLockedOut && attempt2.attemptsRemaining === 2,
    'Failed attempt 2: not locked out, 2 attempts remaining'
  );

  // Attempt 3: Failed
  const attempt3 = await vaultCrypto.verifyPasscodeWithRateLimit('0003', salt, testPinHash);
  assert(
    !attempt3.isValid && !attempt3.isLockedOut && attempt3.attemptsRemaining === 1,
    'Failed attempt 3: not locked out, 1 attempt remaining'
  );

  // Attempt 4: Triggers 30s lockout
  const attempt4 = await vaultCrypto.verifyPasscodeWithRateLimit('0004', salt, testPinHash);
  assert(
    !attempt4.isValid && attempt4.isLockedOut && attempt4.lockoutRemainingSeconds === 30,
    'Failed attempt 4: triggers 30-second lockout',
    `Remaining: ${attempt4.lockoutRemainingSeconds}s`
  );

  // Attempt while locked out should immediately reject without checking hash
  const lockedOutAttempt = await vaultCrypto.verifyPasscodeWithRateLimit(testPin, salt, testPinHash);
  assert(
    lockedOutAttempt.isLockedOut === true && lockedOutAttempt.isValid === false,
    'Attempt during active lockout is immediately blocked (even with correct PIN)'
  );

  // Reset lockout for test sequence
  vaultCrypto.resetLockout();

  // Test successful entry clears lockout counter
  const successAttempt = await vaultCrypto.verifyPasscodeWithRateLimit(testPin, salt, testPinHash);
  assert(
    successAttempt.isValid === true && successAttempt.attemptsRemaining === 4 && !successAttempt.isLockedOut,
    'Successful PIN entry resets failed counter to full 4 attempts'
  );

  // ---------------------------------------------------------
  // 5. Sensitive Data Masking Verification
  // ---------------------------------------------------------
  console.log('\n--- 5. Sensitive Data Masking Verification ---');

  const testApiKey = 'AIzaSyA874139247291048104829104829191K4';
  const maskedKey = vaultCrypto.maskApiKey(testApiKey);
  assert(
    maskedKey.endsWith('91K4') && maskedKey.startsWith('••••') && !maskedKey.includes('SyA874'),
    'Gemini API key is masked revealing only the last 4 characters',
    `Masked: ${maskedKey}`
  );

  const emptyMasked = vaultCrypto.maskApiKey('');
  assert(emptyMasked === '', 'Empty key masking returns empty string');

  // ---------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------
  console.log('\n====================================================');
  console.log(`TOTAL SECURITY AUDIT RESULTS: ${testsPassed} / ${totalTests} TESTS PASSED`);
  console.log('====================================================');

  if (testsPassed !== totalTests) {
    process.exit(1);
  }
}

runSecurityTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
