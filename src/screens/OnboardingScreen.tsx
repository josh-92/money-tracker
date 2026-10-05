/**
 * OnboardingScreen.tsx
 * 100% Local Private Vault Onboarding Flow.
 * - Vault Name, Email, Password (hashed via PBKDF2)
 * - Account Selection with initial opening balances
 * - Optional 4-Digit Passcode & Biometric setup (with security skip warning)
 * - Seeds starting ledger transactions
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldCheck, Lock, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react-native';
import { spacing, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { vaultSecurity } from '../security/VaultSecurity';
import { dbService } from '../database/DatabaseService';
import { ProviderLogo } from '../components/ProviderLogo';

interface OnboardingScreenProps {
  onComplete: () => void;
  isDark?: boolean;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete, isDark = true }) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Vault Profile
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');

  // Step 2: Accounts & Balances
  const [selectedAccounts, setSelectedAccounts] = useState({
    cbe: true,
    telebirr: true,
    awash: true,
    cash: true,
  });
  const [cbeBalance, setCbeBalance] = useState('7250');
  const [telebirrBalance, setTelebirrBalance] = useState('3100');
  const [awashBalance, setAwashBalance] = useState('2100');
  const [cashBalance, setCashBalance] = useState('850');

  // Step 3: Security & Passcode
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleStep1Next = () => {
    if (!fullName.trim()) {
      Alert.alert('Required', 'Please enter your name for your private vault profile.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Required', 'Please enter a valid local email identifier.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Password Security', 'Master password should be at least 6 characters.');
      return;
    }
    setStep(2);
  };

  const handleStep2Next = () => {
    setStep(3);
  };

  const handleCompleteSetup = async (skipPasscode = false) => {
    if (!skipPasscode && passcode.length > 0) {
      if (passcode.length !== 4) {
        Alert.alert('Invalid Passcode', 'App passcode must be exactly 4 digits.');
        return;
      }
      if (passcode !== confirmPasscode) {
        Alert.alert('Mismatch', 'Passcodes do not match. Please verify.');
        return;
      }
    }

    if (!skipPasscode && passcode.length === 0 && !showSkipWarning) {
      setShowSkipWarning(true);
      return;
    }

    setLoading(true);
    try {
      // 1. Initialize SQLite Database
      await dbService.initialize();

      // 2. Derive Salt and Hash Password
      const salt = vaultSecurity.generateSalt();
      const passwordHash = await vaultSecurity.hashPassword(password, salt);
      const passcodeHash =
        !skipPasscode && passcode.length === 4
          ? await vaultSecurity.hashPasscode(passcode, salt)
          : null;

      // 3. Create Vault Profile in SQLite
      await dbService.createVaultProfile({
        fullName: fullName.trim(),
        email: email.trim(),
        phoneNumber: phoneNumber.trim() || undefined,
        passwordHash,
        salt,
        passcodeHash,
        biometricEnabled,
        autoLockMinutes: 5,
        themePreference: isDark ? 'dark' : 'light',
      });

      // 4. Seed Chosen Accounts and Initial Opening Balances
      const balancesMap: Record<string, number> = {};
      if (selectedAccounts.cbe) balancesMap['acc_cbe'] = parseFloat(cbeBalance) || 0;
      if (selectedAccounts.telebirr) balancesMap['acc_telebirr'] = parseFloat(telebirrBalance) || 0;
      if (selectedAccounts.awash) balancesMap['acc_awash'] = parseFloat(awashBalance) || 0;
      if (selectedAccounts.cash) balancesMap['acc_cash'] = parseFloat(cashBalance) || 0;

      await dbService.seedDefaultAccounts(balancesMap);

      onComplete();
    } catch (err: any) {
      Alert.alert('Setup Error', err.message || 'Failed to initialize local vault.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Step Indicator */}
        <View style={styles.stepIndicatorRow}>
          {[1, 2, 3].map((s) => (
            <View
              key={s}
              style={[
                styles.stepDot,
                {
                  backgroundColor: s === step ? theme.primary : s < step ? theme.income : theme.surfaceBorder,
                  width: s === step ? 28 : 8,
                },
              ]}
            />
          ))}
        </View>

        {/* STEP 1: Create Private Vault */}
        {step === 1 && (
          <View>
            <View style={styles.iconHeader}>
              <View style={[styles.iconCircle, { backgroundColor: theme.primaryGlow }]}>
                <ShieldCheck size={32} color={theme.primary} />
              </View>
              <Text style={[styles.title, { color: theme.textPrimary }]}>Create Private Vault</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                Your financial ledger is stored 100% on this device. No remote company servers, no cloud telemetry.
              </Text>
            </View>

            <VaultCard isDark={isDark} style={styles.formCard}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Full Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                placeholder="e.g. Tanya Myroniuk"
                placeholderTextColor={theme.textMuted}
                value={fullName}
                onChangeText={setFullName}
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Local Email Identifier</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                placeholder="name@example.com"
                placeholderTextColor={theme.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Phone Number (Optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                placeholder="+251 91 123 4567"
                placeholderTextColor={theme.textMuted}
                keyboardType="phone-pad"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Master Vault Password</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                placeholder="At least 6 characters"
                placeholderTextColor={theme.textMuted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </VaultCard>

            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: theme.primary }]} onPress={handleStep1Next}>
              <Text style={styles.buttonText}>Continue to Accounts</Text>
              <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 2: Configure Accounts & Starting Balances */}
        {step === 2 && (
          <View>
            <View style={styles.iconHeader}>
              <Text style={[styles.title, { color: theme.textPrimary }]}>Your Accounts & Wallets</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                Select the accounts you actively use and enter their starting balances. These form immutable starting points for future cash-flow tracking.
              </Text>
            </View>

            {/* CBE Account */}
            <VaultCard isDark={isDark} style={styles.accountRowCard}>
              <View style={styles.accountRowHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <ProviderLogo providerKey="CBE" size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.accountTitle, { color: theme.textPrimary }]}>Commercial Bank of Ethiopia (CBE)</Text>
                    <Text style={[styles.accountMask, { color: theme.textSecondary }]}>Primary Salary / Savings</Text>
                  </View>
                </View>
                <Switch
                  value={selectedAccounts.cbe}
                  onValueChange={(val) => setSelectedAccounts({ ...selectedAccounts, cbe: val })}
                  trackColor={{ false: theme.surfaceBorder, true: theme.primary }}
                />
              </View>
              {selectedAccounts.cbe && (
                <View>
                  <View style={styles.balanceInputContainer}>
                    <Text style={[styles.balanceInputLabel, { color: theme.textSecondary }]}>Starting Balance (ETB):</Text>
                    <TextInput
                      style={[styles.smallInput, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                      keyboardType="numeric"
                      value={cbeBalance}
                      onChangeText={setCbeBalance}
                    />
                  </View>
                  <Text style={[styles.openingBalanceDisclosure, { color: theme.textMuted }]}>
                    This will be used as your opening balance
                  </Text>
                </View>
              )}
            </VaultCard>

            {/* Telebirr Wallet */}
            <VaultCard isDark={isDark} style={styles.accountRowCard}>
              <View style={styles.accountRowHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <ProviderLogo providerKey="TELEBIRR" size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.accountTitle, { color: theme.textPrimary }]}>Telebirr Mobile Wallet</Text>
                    <Text style={[styles.accountMask, { color: theme.textSecondary }]}>Daily Retail & QR Payments</Text>
                  </View>
                </View>
                <Switch
                  value={selectedAccounts.telebirr}
                  onValueChange={(val) => setSelectedAccounts({ ...selectedAccounts, telebirr: val })}
                  trackColor={{ false: theme.surfaceBorder, true: theme.primary }}
                />
              </View>
              {selectedAccounts.telebirr && (
                <View>
                  <View style={styles.balanceInputContainer}>
                    <Text style={[styles.balanceInputLabel, { color: theme.textSecondary }]}>Starting Balance (ETB):</Text>
                    <TextInput
                      style={[styles.smallInput, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                      keyboardType="numeric"
                      value={telebirrBalance}
                      onChangeText={setTelebirrBalance}
                    />
                  </View>
                  <Text style={[styles.openingBalanceDisclosure, { color: theme.textMuted }]}>
                    This will be used as your opening balance
                  </Text>
                </View>
              )}
            </VaultCard>

            {/* Awash Bank */}
            <VaultCard isDark={isDark} style={styles.accountRowCard}>
              <View style={styles.accountRowHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <ProviderLogo providerKey="AWASH" size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.accountTitle, { color: theme.textPrimary }]}>Awash Bank</Text>
                    <Text style={[styles.accountMask, { color: theme.textSecondary }]}>Secondary Bank Account</Text>
                  </View>
                </View>
                <Switch
                  value={selectedAccounts.awash}
                  onValueChange={(val) => setSelectedAccounts({ ...selectedAccounts, awash: val })}
                  trackColor={{ false: theme.surfaceBorder, true: theme.primary }}
                />
              </View>
              {selectedAccounts.awash && (
                <View>
                  <View style={styles.balanceInputContainer}>
                    <Text style={[styles.balanceInputLabel, { color: theme.textSecondary }]}>Starting Balance (ETB):</Text>
                    <TextInput
                      style={[styles.smallInput, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                      keyboardType="numeric"
                      value={awashBalance}
                      onChangeText={setAwashBalance}
                    />
                  </View>
                  <Text style={[styles.openingBalanceDisclosure, { color: theme.textMuted }]}>
                    This will be used as your opening balance
                  </Text>
                </View>
              )}
            </VaultCard>

            {/* Cash in Hand */}
            <VaultCard isDark={isDark} style={styles.accountRowCard}>
              <View style={styles.accountRowHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <ProviderLogo providerKey="CASH" size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.accountTitle, { color: theme.textPrimary }]}>Cash in Hand</Text>
                    <Text style={[styles.accountMask, { color: theme.textSecondary }]}>Physical Wallet (Taxis, Gulit)</Text>
                  </View>
                </View>
                <Switch
                  value={selectedAccounts.cash}
                  onValueChange={(val) => setSelectedAccounts({ ...selectedAccounts, cash: val })}
                  trackColor={{ false: theme.surfaceBorder, true: theme.primary }}
                />
              </View>
              {selectedAccounts.cash && (
                <View>
                  <View style={styles.balanceInputContainer}>
                    <Text style={[styles.balanceInputLabel, { color: theme.textSecondary }]}>Starting Balance (ETB):</Text>
                    <TextInput
                      style={[styles.smallInput, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                      keyboardType="numeric"
                      value={cashBalance}
                      onChangeText={setCashBalance}
                    />
                  </View>
                  <Text style={[styles.openingBalanceDisclosure, { color: theme.textMuted }]}>
                    This will be used as your opening balance
                  </Text>
                </View>
              )}
            </VaultCard>

            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: theme.primary }]} onPress={handleStep2Next}>
              <Text style={styles.buttonText}>Continue to Security</Text>
              <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 3: Security & Passcode */}
        {step === 3 && (
          <View>
            <View style={styles.iconHeader}>
              <View style={[styles.iconCircle, { backgroundColor: theme.primaryGlow }]}>
                <Lock size={32} color={theme.primary} />
              </View>
              <Text style={[styles.title, { color: theme.textPrimary }]}>Secure Your Vault</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                Set a 4-digit passcode for instant access. The app auto-locks after 5 minutes of inactivity.
              </Text>
            </View>

            <VaultCard isDark={isDark} style={styles.formCard}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Set 4-Digit Passcode</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                placeholder="• • • •"
                placeholderTextColor={theme.textMuted}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
                value={passcode}
                onChangeText={setPasscode}
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Confirm Passcode</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                placeholder="• • • •"
                placeholderTextColor={theme.textMuted}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
                value={confirmPasscode}
                onChangeText={setConfirmPasscode}
              />

              <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: theme.textPrimary }]}>Enable Biometric Unlock</Text>
                <Switch
                  value={biometricEnabled}
                  onValueChange={setBiometricEnabled}
                  trackColor={{ false: theme.surfaceBorder, true: theme.primary }}
                />
              </View>
            </VaultCard>

            {showSkipWarning && (
              <VaultCard isDark={isDark} style={styles.warningCard} variant="highlight">
                <View style={styles.warningRow}>
                  <AlertTriangle size={22} color={theme.warning} style={{ marginRight: spacing.sm }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.warningTitle, { color: theme.warning }]}>
                      Your financial information isn't protected yet
                    </Text>
                    <Text style={[styles.warningBody, { color: theme.textSecondary }]}>
                      Anyone with access to this phone can view your balances and transactions. We strongly recommend setting a 4-digit passcode now.
                    </Text>
                  </View>
                </View>
              </VaultCard>
            )}

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.primary }]}
              onPress={() => handleCompleteSetup(false)}
              disabled={loading}
            >
              <Text style={styles.buttonText}>{loading ? 'Creating Vault...' : 'Finish Setup & Enter Vault'}</Text>
              <CheckCircle2 size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
            </TouchableOpacity>

            {!showSkipWarning && passcode.length === 0 && (
              <TouchableOpacity style={styles.skipButton} onPress={() => setShowSkipWarning(true)}>
                <Text style={[styles.skipButtonText, { color: theme.textMuted }]}>Skip Passcode for Now</Text>
              </TouchableOpacity>
            )}

            {showSkipWarning && (
              <TouchableOpacity style={styles.skipButton} onPress={() => handleCompleteSetup(true)}>
                <Text style={[styles.skipButtonText, { color: theme.warning }]}>Confirm & Continue Without Passcode</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  stepIndicatorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
    gap: 8,
  },
  stepDot: {
    height: 8,
    borderRadius: 4,
  },
  iconHeader: {
    alignItems: 'center',
    marginBottom: spacing.xl,
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
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },
  formCard: {
    marginBottom: spacing.xl,
  },
  inputLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    height: 48,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    fontSize: typography.fontSize.base,
    borderWidth: 1,
    marginBottom: spacing.xs,
  },
  primaryButton: {
    height: 52,
    borderRadius: borderRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  skipButton: {
    alignItems: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  skipButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  accountRowCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  accountRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accountTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  accountMask: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  balanceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  balanceInputLabel: {
    fontSize: typography.fontSize.xs,
  },
  smallInput: {
    width: 120,
    height: 38,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    fontSize: typography.fontSize.sm,
    borderWidth: 1,
    textAlign: 'right',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  switchLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  warningCard: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderColor: '#F59E0B',
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  warningTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 2,
  },
  warningBody: {
    fontSize: typography.fontSize.xs,
    lineHeight: 18,
  },
  openingBalanceDisclosure: {
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },
});
