/**
 * PasscodeLockScreen.tsx
 * 4-digit PIN lock screen enforced by SessionManager on 5-minute inactivity.
 * Includes biometric fallback and keypad matching the Figma design.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock, Fingerprint, Delete } from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { sessionManager } from '../security/SessionManager';
import { vaultSecurity } from '../security/VaultSecurity';
import { dbService } from '../database/DatabaseService';

interface PasscodeLockScreenProps {
  isDark?: boolean;
}

export const PasscodeLockScreen: React.FC<PasscodeLockScreenProps> = ({ isDark = true }) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;

  const [digits, setDigits] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lockoutSec, setLockoutSec] = useState(0);

  useEffect(() => {
    // Check initial lockout state
    const status = vaultSecurity.getPinLockoutStatus();
    if (status.isLockedOut) {
      setLockoutSec(status.lockoutRemainingSeconds);
      setErrorMsg(`Too many failed attempts. Try again in ${status.lockoutRemainingSeconds}s.`);
    }

    // Attempt biometric unlock immediately on screen mount
    attemptBiometric();
  }, []);

  useEffect(() => {
    if (lockoutSec <= 0) return;
    const timer = setInterval(() => {
      setLockoutSec((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setErrorMsg(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSec]);

  const attemptBiometric = async () => {
    try {
      const profile = await dbService.getVaultProfile();
      if (profile?.biometricEnabled) {
        const success = await vaultSecurity.authenticateBiometric();
        if (success) {
          sessionManager.unlock();
        }
      }
    } catch {
      // Biometrics not available, fallback to PIN
    }
  };

  const handlePressDigit = async (d: string) => {
    if (lockoutSec > 0) return;
    if (digits.length >= 4) return;
    const newDigits = [...digits, d];
    setDigits(newDigits);
    setErrorMsg(null);

    if (newDigits.length === 4) {
      const enteredPin = newDigits.join('');
      const profile = await dbService.getVaultProfile();

      if (profile && profile.passcodeHash) {
        const result = await vaultSecurity.verifyPasscodeWithRateLimit(
          enteredPin,
          profile.salt,
          profile.passcodeHash
        );

        if (result.isValid) {
          // If legacy hash detected and needs rehash, migrate transparently to PBKDF2
          if (result.needsRehash) {
            try {
              const newHash = await vaultSecurity.hashPasscode(enteredPin, profile.salt);
              await dbService.updateVaultProfile({
                passcodeHash: newHash,
              });
            } catch (rehashErr) {
              console.warn('Passcode rehash migration failed:', rehashErr);
            }
          }
          sessionManager.unlock();
        } else {
          if (result.isLockedOut) {
            setLockoutSec(result.lockoutRemainingSeconds);
            setErrorMsg(`Too many failed attempts. Try again in ${result.lockoutRemainingSeconds}s.`);
          } else {
            const attemptsLeft = result.attemptsRemaining;
            const warningSuffix =
              attemptsLeft <= 2 && attemptsLeft > 0
                ? ` (${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining)`
                : '';
            setErrorMsg(`Incorrect passcode.${warningSuffix} Try again.`);
          }
          setDigits([]);
        }
      } else {
        // No passcode configured, unlock
        sessionManager.unlock();
      }
    }
  };

  const handleDeleteDigit = () => {
    if (digits.length > 0) {
      setDigits(digits.slice(0, -1));
      setErrorMsg(null);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: theme.primaryGlow }]}>
            <Lock size={32} color={theme.primary} />
          </View>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Vault Locked</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Enter your 4-digit passcode to access your financial records
          </Text>
        </View>

        {/* PIN Dots */}
        <View style={styles.dotsRow}>
          {[0, 1, 2, 3].map((idx) => (
            <View
              key={idx}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    idx < digits.length
                      ? theme.primary
                      : errorMsg
                      ? theme.expense
                      : theme.surfaceHighlight,
                  borderColor: idx < digits.length ? theme.primary : theme.surfaceBorder,
                },
              ]}
            />
          ))}
        </View>

        {errorMsg && <Text style={[styles.errorText, { color: theme.expense }]}>{errorMsg}</Text>}

        {/* Numeric Keypad */}
        <View style={styles.keypad}>
          {[
            ['1', '2', '3'],
            ['4', '5', '6'],
            ['7', '8', '9'],
            ['bio', '0', 'del'],
          ].map((row, rIdx) => (
            <View key={rIdx} style={styles.keypadRow}>
              {row.map((item) => {
                if (item === 'bio') {
                  return (
                    <TouchableOpacity
                      key="bio"
                      style={[styles.keyButton, { backgroundColor: 'transparent' }]}
                      onPress={attemptBiometric}
                    >
                      <Fingerprint size={28} color={theme.primary} />
                    </TouchableOpacity>
                  );
                }
                if (item === 'del') {
                  return (
                    <TouchableOpacity
                      key="del"
                      style={[styles.keyButton, { backgroundColor: 'transparent', opacity: lockoutSec > 0 ? 0.35 : 1 }]}
                      onPress={handleDeleteDigit}
                      disabled={lockoutSec > 0}
                    >
                      <Delete size={24} color={theme.textPrimary} />
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity
                    key={item}
                    style={[
                      styles.keyButton,
                      {
                        backgroundColor: theme.surfaceHighlight,
                        opacity: lockoutSec > 0 ? 0.35 : 1,
                      },
                    ]}
                    onPress={() => handlePressDigit(item)}
                    disabled={lockoutSec > 0}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.keyNumber, { color: theme.textPrimary }]}>{item}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  content: {
    flex: 1,
    paddingHorizontal: layout.screenPaddingHorizontal,
    justifyContent: 'space-between',
    paddingVertical: spacing['2xl'],
  },
  header: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
    marginVertical: spacing.xl,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  keypad: {
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: spacing.sm,
  },
  keyButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyNumber: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
  },
});
