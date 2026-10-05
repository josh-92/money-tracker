/**
 * VaultCrypto.ts
 * Pure cryptographic primitives and rate-limiting brute-force defense.
 * - PBKDF2-HMAC-SHA256 (10,000 iterations, 32-byte key) password & passcode derivation
 * - Self-describing hash format with versioning metadata: `pbkdf2:sha256:<iter>:<salt>:<hash>`
 * - Seamless migration for legacy 50-round SHA-256 prototype hashes
 * - Rate limiting and exponential lockout backoff for 4-digit PIN brute-force defense
 * - Zero native dependencies: runs in React Native, Node.js, and browser environments.
 */

import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export interface PinVerificationResult {
  isValid: boolean;
  needsRehash?: boolean;
  isLockedOut: boolean;
  lockoutRemainingSeconds: number;
  attemptsRemaining: number;
  errorMessage?: string;
}

export interface VerificationResult {
  isValid: boolean;
  needsRehash: boolean;
}

export class VaultCrypto {
  private failedPinAttempts = 0;
  private lockoutUntilTimestamp: number | null = null;

  /**
   * Generates a cryptographically random salt (16 bytes hex).
   */
  public generateSalt(): string {
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      const arr = new Uint8Array(16);
      globalThis.crypto.getRandomValues(arr);
      return Array.from(arr)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }

    let salt = '';
    const hex = '0123456789abcdef';
    for (let i = 0; i < 32; i++) {
      salt += hex.charAt(Math.floor(Math.random() * 16));
    }
    return salt;
  }

  /**
   * Computes modern PBKDF2-HMAC-SHA256 password hash.
   * Format: `pbkdf2:sha256:<iterations>:<saltHex>:<hashHex>`
   * Default iterations: 10,000 (recommended baseline for mobile React Native)
   */
  public async hashPassword(password: string, salt: string, iterations = 10000): Promise<string> {
    const saltBytes = hexToBytes(salt);
    const pwdBytes = utf8ToBytes(password);
    const derived = pbkdf2(sha256, pwdBytes, saltBytes, { c: iterations, dkLen: 32 });
    return `pbkdf2:sha256:${iterations}:${salt}:${bytesToHex(derived)}`;
  }

  /**
   * Computes modern PBKDF2-HMAC-SHA256 hash for 4-digit passcode.
   */
  public async hashPasscode(passcode: string, salt: string, iterations = 10000): Promise<string> {
    return this.hashPassword(`PIN_${passcode}`, salt, iterations);
  }

  /**
   * Validates password against stored hash.
   * Supports both modern `pbkdf2:sha256:...` hashes and legacy 50-round SHA-256 prototype hashes.
   * Flags `needsRehash: true` if an existing user logged in with a legacy hash.
   */
  public async verifyPassword(
    password: string,
    salt: string,
    expectedHash: string
  ): Promise<VerificationResult> {
    if (expectedHash.startsWith('pbkdf2:')) {
      const parts = expectedHash.split(':');
      if (parts.length === 5) {
        const [, , iterStr, saltHex, targetHash] = parts;
        const iterations = parseInt(iterStr, 10);
        const saltBytes = hexToBytes(saltHex);
        const pwdBytes = utf8ToBytes(password);
        const derived = pbkdf2(sha256, pwdBytes, saltBytes, { c: iterations, dkLen: 32 });
        const computedHex = bytesToHex(derived);
        return {
          isValid: computedHex === targetHash,
          needsRehash: false,
        };
      }
    }

    // Legacy fallback: 50-round iterative SHA-256
    let currentHash = bytesToHex(sha256(utf8ToBytes(`${salt}:${password}:${salt}`)));
    for (let i = 0; i < 50; i++) {
      currentHash = bytesToHex(sha256(utf8ToBytes(`${currentHash}:${salt}:${i}`)));
    }

    if (currentHash === expectedHash) {
      return {
        isValid: true,
        needsRehash: true, // Legacy hash detected! Signal system to rehash with PBKDF2
      };
    }

    return {
      isValid: false,
      needsRehash: false,
    };
  }

  /**
   * Validates entered 4-digit passcode against stored hash.
   */
  public async verifyPasscode(
    passcode: string,
    salt: string,
    expectedHash: string
  ): Promise<VerificationResult> {
    return this.verifyPassword(`PIN_${passcode}`, salt, expectedHash);
  }

  // --- 4-Digit PIN Rate Limiting & Brute-Force Defense ---

  public getPinLockoutStatus(): {
    isLockedOut: boolean;
    lockoutRemainingSeconds: number;
    attemptsRemaining: number;
  } {
    const now = Date.now();
    if (this.lockoutUntilTimestamp && now < this.lockoutUntilTimestamp) {
      const remaining = Math.ceil((this.lockoutUntilTimestamp - now) / 1000);
      return { isLockedOut: true, lockoutRemainingSeconds: remaining, attemptsRemaining: 0 };
    }
    this.lockoutUntilTimestamp = null;
    const remainingAttempts = Math.max(0, 4 - this.failedPinAttempts);
    return { isLockedOut: false, lockoutRemainingSeconds: 0, attemptsRemaining: remainingAttempts };
  }

  /**
   * Verifies passcode with rate-limiting, timing-delay defense, and exponential lockout.
   * Lockout schedule:
   * - 1 to 3 failed attempts: delay warning, no lockout
   * - 4 failed attempts: 30-second lockout
   * - 5 failed attempts: 60-second lockout
   * - 6+ failed attempts: 300-second (5 minute) lockout
   */
  public async verifyPasscodeWithRateLimit(
    passcode: string,
    salt: string,
    expectedHash: string
  ): Promise<PinVerificationResult> {
    const status = this.getPinLockoutStatus();
    if (status.isLockedOut) {
      return {
        isValid: false,
        isLockedOut: true,
        lockoutRemainingSeconds: status.lockoutRemainingSeconds,
        attemptsRemaining: 0,
        errorMessage: `Too many incorrect attempts. Try again in ${status.lockoutRemainingSeconds}s.`,
      };
    }

    // Enforce artificial delay (200ms) to throttle rapid automated guessing
    await new Promise((resolve) => setTimeout(resolve, 200));

    const verification = await this.verifyPasscode(passcode, salt, expectedHash);

    if (verification.isValid) {
      this.failedPinAttempts = 0;
      this.lockoutUntilTimestamp = null;
      return {
        isValid: true,
        needsRehash: verification.needsRehash,
        isLockedOut: false,
        lockoutRemainingSeconds: 0,
        attemptsRemaining: 4,
      };
    }

    // Failed attempt recorded
    this.failedPinAttempts++;
    let lockoutSec = 0;

    if (this.failedPinAttempts >= 6) {
      lockoutSec = 300; // 5 minutes
    } else if (this.failedPinAttempts === 5) {
      lockoutSec = 60; // 1 minute
    } else if (this.failedPinAttempts === 4) {
      lockoutSec = 30; // 30 seconds
    }

    if (lockoutSec > 0) {
      this.lockoutUntilTimestamp = Date.now() + lockoutSec * 1000;
      return {
        isValid: false,
        isLockedOut: true,
        lockoutRemainingSeconds: lockoutSec,
        attemptsRemaining: 0,
        errorMessage: `Too many failed attempts. Locked for ${lockoutSec} seconds.`,
      };
    }

    const attemptsLeft = 4 - this.failedPinAttempts;
    return {
      isValid: false,
      isLockedOut: false,
      lockoutRemainingSeconds: 0,
      attemptsRemaining: attemptsLeft,
      errorMessage: `Incorrect passcode. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining.`,
    };
  }

  public resetPinRateLimit(): void {
    this.failedPinAttempts = 0;
    this.lockoutUntilTimestamp = null;
  }

  public resetLockout(): void {
    this.resetPinRateLimit();
  }

  /**
   * Safely masks Gemini API key revealing only the last 4 characters.
   */
  public maskApiKey(apiKey: string): string {
    if (!apiKey) return '';
    if (apiKey.length <= 4) return '••••';
    const last4 = apiKey.slice(-4);
    const maskedLength = Math.max(8, apiKey.length - 4);
    return '•'.repeat(maskedLength) + last4;
  }
}

export const vaultCrypto = new VaultCrypto();
