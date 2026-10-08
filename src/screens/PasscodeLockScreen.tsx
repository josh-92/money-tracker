/**
 * PasscodeLockScreen.tsx
 * 4-digit PIN lock screen enforced by SessionManager on 5-minute inactivity.
 * Includes biometric fallback and keypad matching the Figma design.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  AppState,
  AppStateStatus,
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
  const [isVerifying, setIsVerifying] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const isBiometricInFlightRef = useRef(false);
  const userDismissedBiometricRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    // Check initial lockout state
    const status = vaultSecurity.getPinLockoutStatus();
    if (status.isLockedOut) {
      setLockoutSec(status.lockoutRemainingSeconds);
      setErrorMsg(`Too many failed attempts. Try again in ${status.lockoutRemainingSeconds}s.`);
    }

    // Attempt biometric unlock on screen mount with a slight delay for native window attachment
    const mountTimer = setTimeout(() => {
      if (!userDismissedBiometricRef.current && !isBiometricInFlightRef.current) {
        attemptBiometric(false);
      }
    }, 150);

    return () => clearTimeout(mountTimer);
  }, []);

  // Listen to AppState changes so returning to foreground re-prompts biometric
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const previous = appStateRef.current;
      appStateRef.current = nextState;

      // When app goes to background, user left the session — reset dismissal flag
      if (nextState === 'background') {
        userDismissedBiometricRef.current = false;
      }

      // When returning to foreground from background or inactive, re-prompt if enabled
      if ((previous === 'background' || previous === 'inactive') && nextState === 'active') {
        if (!userDismissedBiometricRef.current && !isBiometricInFlightRef.current && lockoutSec <= 0) {
          // Defer briefly to allow Android activity focus to settle
          setTimeout(() => {
            if (!userDismissedBiometricRef.current && !isBiometricInFlightRef.current) {
              attemptBiometric(false);
            }
          }, 150);
        }
      }
    });

    return () => sub.remove();
  }, [lockoutSec]);

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

  const attemptBiometric = async (fromManualTap = false) => {
    if (isBiometricInFlightRef.current || isUnlocking) return;
    if (fromManualTap) {
      userDismissedBiometricRef.current = false;
    }
    isBiometricInFlightRef.current = true;

    try {
      const profile = await dbService.getVaultProfile();
      if (profile?.biometricEnabled) {
        const success = await vaultSecurity.authenticateBiometric();
        if (success) {
          setIsUnlocking(true);
          sessionManager.unlock();
        } else {
          // User cancelled prompt or backed out to use PIN
          userDismissedBiometricRef.current = true;
        }
      }
    } catch {
      userDismissedBiometricRef.current = true;
    } finally {
      isBiometricInFlightRef.current = false;
    }
  };

  const handlePressDigit = async (d: string) => {
    if (lockoutSec > 0 || isVerifying || isUnlocking) return;
    if (digits.length >= 4) return;
    const newDigits = [...digits, d];
    setDigits(newDigits);
    setErrorMsg(null);

    if (newDigits.length === 4) {
      setIsVerifying(true);

      try {
        const enteredPin = newDigits.join('');
        const profile = await dbService.getVaultProfile();

        if (profile && profile.passcodeHash) {
          const result = await vaultSecurity.verifyPasscodeWithRateLimit(
            enteredPin,
            profile.salt,
            profile.passcodeHash
          );

          if (result.isValid) {
            setIsUnlocking(true);
            // Non-blocking PBKDF2 migration if legacy hash detected
            if (result.needsRehash) {
              vaultSecurity
                .hashPasscode(enteredPin, profile.salt)
                .then((newHash) => dbService.updateVaultProfile({ passcodeHash: newHash }))
                .catch((rehashErr) => console.warn('Passcode rehash migration failed:', rehashErr));
            }
            sessionManager.unlock();
          } else {
            setIsVerifying(false);
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
          setIsUnlocking(true);
          sessionManager.unlock();
        }
      } catch (err) {
        setIsVerifying(false);
        setDigits([]);
        setErrorMsg('Authentication error. Please try again.');
      }
    }
  };

  const handleDeleteDigit = () => {
    if (lockoutSec > 0 || isVerifying || isUnlocking) return;
    if (digits.length > 0) {
      setDigits(digits.slice(0, -1));
      setErrorMsg(null);
    }
  };

  const isKeypadDisabled = lockoutSec > 0 || isVerifying || isUnlocking;

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
      pointerEvents={isUnlocking ? 'none' : 'auto'}
    >
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

        {/* Status / Loading / Error Message */}
        <View style={styles.statusContainer}>
          {isVerifying ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.statusText, { color: theme.textSecondary }]}>
                Verifying passcode...
              </Text>
            </View>
          ) : errorMsg ? (
            <Text style={[styles.errorText, { color: theme.expense }]}>{errorMsg}</Text>
          ) : (
            <View style={{ height: 20 }} />
          )}
        </View>

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
                      style={[
                        styles.keyButton,
                        {
                          backgroundColor: 'transparent',
                          opacity: isKeypadDisabled ? 0.35 : 1,
                        },
                      ]}
                      onPress={() => attemptBiometric(true)}
                      disabled={isKeypadDisabled}
                      activeOpacity={0.7}
                    >
                      <Fingerprint size={28} color={theme.primary} />
                    </TouchableOpacity>
                  );
                }
                if (item === 'del') {
                  return (
                    <TouchableOpacity
                      key="del"
                      style={[
                        styles.keyButton,
                        {
                          backgroundColor: 'transparent',
                          opacity: isKeypadDisabled || digits.length === 0 ? 0.35 : 1,
                        },
                      ]}
                      onPress={handleDeleteDigit}
                      disabled={isKeypadDisabled || digits.length === 0}
                      activeOpacity={0.7}
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
                        opacity: isKeypadDisabled ? 0.35 : 1,
                      },
                    ]}
                    onPress={() => handlePressDigit(item)}
                    disabled={isKeypadDisabled}
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
  statusContainer: {
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
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
