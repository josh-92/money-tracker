/**
 * VaultSecurity.ts
 * Cryptographic security and Android Keystore-backed / iOS Keychain secure storage.
 * - PBKDF2-HMAC-SHA256 (10,000 iterations, 32-byte key) password & passcode derivation via VaultCrypto
 * - Self-describing hash format with versioning metadata: `pbkdf2:sha256:<iter>:<salt>:<hash>`
 * - Seamless migration for legacy 50-round SHA-256 prototype hashes
 * - Rate limiting and exponential lockout backoff for 4-digit PIN brute-force defense
 * - Android Keystore-backed secure storage via expo-secure-store for secrets
 * - Biometric authentication via expo-local-authentication
 */

import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { DEFAULT_GEMINI_MODEL_ID } from '../ai/GeminiConfig';
import {
  VaultCrypto,
  PinVerificationResult,
  VerificationResult,
} from './VaultCrypto';

export * from './VaultCrypto';

const GEMINI_API_KEY_STORAGE_KEY = 'money_tracker_gemini_api_key';
const GEMINI_MODEL_STORAGE_KEY = 'money_tracker_gemini_model_id';
const AI_SETTINGS_STORAGE_KEY = 'money_tracker_ai_settings';
const HIDE_BALANCES_STORAGE_KEY = 'money_tracker_hide_balances_by_default';

export interface AiFeatureSettings {
  receiptAiEnabled: boolean;
  unknownSmsFallbackEnabled: boolean;
  merchantNormalizationEnabled: boolean;
  categoryInferenceEnabled: boolean;
  spendingAnomalyEnabled: boolean;
  dashboardInsightsEnabled: boolean;
  monthlyAnalysisEnabled: boolean;
  monthlyRequestThreshold: number; // default 50
}

export const DEFAULT_AI_SETTINGS: AiFeatureSettings = {
  receiptAiEnabled: true,
  unknownSmsFallbackEnabled: true,
  merchantNormalizationEnabled: true,
  categoryInferenceEnabled: true,
  spendingAnomalyEnabled: true,
  dashboardInsightsEnabled: true,
  monthlyAnalysisEnabled: true,
  monthlyRequestThreshold: 50,
};

class VaultSecurity extends VaultCrypto {
  // --- Android Keystore-Backed / iOS Keychain Secure Storage ---

  public async saveGeminiApiKey(apiKey: string): Promise<void> {
    await SecureStore.setItemAsync(GEMINI_API_KEY_STORAGE_KEY, apiKey);
  }

  public async getGeminiApiKey(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(GEMINI_API_KEY_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  public async deleteGeminiApiKey(): Promise<void> {
    await SecureStore.deleteItemAsync(GEMINI_API_KEY_STORAGE_KEY);
  }

  public async saveGeminiModel(modelId: string): Promise<void> {
    await SecureStore.setItemAsync(GEMINI_MODEL_STORAGE_KEY, modelId);
  }

  public async saveConfiguredModel(modelId: string): Promise<void> {
    return this.saveGeminiModel(modelId);
  }

  public async getGeminiModel(): Promise<string> {
    try {
      const stored = await SecureStore.getItemAsync(GEMINI_MODEL_STORAGE_KEY);
      return stored || DEFAULT_GEMINI_MODEL_ID;
    } catch {
      return DEFAULT_GEMINI_MODEL_ID;
    }
  }

  public async getConfiguredModel(): Promise<string> {
    return this.getGeminiModel();
  }

  public async saveAiSettings(settings: AiFeatureSettings): Promise<void> {
    await SecureStore.setItemAsync(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }

  public async getAiSettings(): Promise<AiFeatureSettings> {
    try {
      const stored = await SecureStore.getItemAsync(AI_SETTINGS_STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_AI_SETTINGS, ...JSON.parse(stored) };
      }
      return DEFAULT_AI_SETTINGS;
    } catch {
      return DEFAULT_AI_SETTINGS;
    }
  }

  public async saveHideBalancesPreference(hide: boolean): Promise<void> {
    await SecureStore.setItemAsync(HIDE_BALANCES_STORAGE_KEY, hide ? '1' : '0');
  }

  public async getHideBalancesPreference(): Promise<boolean> {
    try {
      const stored = await SecureStore.getItemAsync(HIDE_BALANCES_STORAGE_KEY);
      return stored === '1';
    } catch {
      return false;
    }
  }

  // --- Biometric & Device Screen-Lock Authentication via LocalAuthentication ---

  private isBiometricPromptActive = false;

  public async isBiometricAvailable(): Promise<boolean> {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const enrolledLevel = await LocalAuthentication.getEnrolledLevelAsync();
      // Eligible if biometric hardware is enrolled OR device-level screen lock (PIN/pattern/password) is set
      return (compatible && enrolled) || enrolledLevel > LocalAuthentication.SecurityLevel.NONE;
    } catch {
      return false;
    }
  }

  public async authenticateBiometric(): Promise<boolean> {
    if (this.isBiometricPromptActive) {
      return false;
    }
    try {
      const available = await this.isBiometricAvailable();
      if (!available) return false;

      this.isBiometricPromptActive = true;
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Money Tracker Vault',
        fallbackLabel: 'Use 4-digit Passcode',
        cancelLabel: 'Use 4-digit Passcode',
        disableDeviceFallback: false,
      });

      return result.success;
    } catch {
      return false;
    } finally {
      this.isBiometricPromptActive = false;
    }
  }
}

export const vaultSecurity = new VaultSecurity();
