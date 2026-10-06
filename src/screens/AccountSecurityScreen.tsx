/**
 * AccountSecurityScreen.tsx
 * Dedicated security management screen.
 * - Change Password (authenticated via current password)
 * - Change 4-Digit Passcode (authenticated via current password or PIN)
 * - Biometric Unlock toggle (expo-local-authentication)
 * - Auto-Lock timeout picker (default 5 minutes)
 * - Android Keystore-backed secure storage status and snapshot protection status
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Shield,
  Key,
  Lock,
  Fingerprint,
  Clock,
  EyeOff,
  CheckCircle,
} from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { dbService } from '../database/DatabaseService';
import { vaultSecurity } from '../security/VaultSecurity';
import { sessionManager } from '../security/SessionManager';
import { VaultProfile } from '../types/database';

interface AccountSecurityScreenProps {
  navigation: any;
  isDark?: boolean;
}

const AUTO_LOCK_OPTIONS = [
  { label: '1 Minute', value: 1 },
  { label: '2 Minutes', value: 2 },
  { label: '5 Minutes (Default)', value: 5 },
  { label: '10 Minutes', value: 10 },
  { label: '15 Minutes', value: 15 },
  { label: '30 Minutes', value: 30 },
];

export const AccountSecurityScreen: React.FC<AccountSecurityScreenProps> = ({
  navigation,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;

  const [profile, setProfile] = useState<VaultProfile | null>(null);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [autoLockMinutes, setAutoLockMinutes] = useState(5);

  // Password Modal/State
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // PIN Modal/State
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [currentAuthForPin, setCurrentAuthForPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  useEffect(() => {
    loadSecuritySettings();
  }, []);

  const loadSecuritySettings = async () => {
    const p = await dbService.getVaultProfile();
    setProfile(p);
    if (p) {
      setBiometricsEnabled(Boolean(p.biometricEnabled));
      setAutoLockMinutes(p.autoLockMinutes || 5);
    }
    const hasBio = await vaultSecurity.isBiometricAvailable();
    setBiometricsAvailable(hasBio);
  };

  const handleToggleBiometrics = async (val: boolean) => {
    if (val && !biometricsAvailable) {
      Alert.alert('Not Available', 'Biometric authentication is not enrolled or available on this device.');
      return;
    }

    if (val) {
      const authenticated = await vaultSecurity.authenticateBiometric();
      if (!authenticated) {
        Alert.alert('Verification Failed', 'Could not verify biometrics.');
        return;
      }
    }

    setBiometricsEnabled(val);
    await dbService.updateVaultProfile({ biometricEnabled: val });
  };

  const handleSelectAutoLock = async (mins: number) => {
    setAutoLockMinutes(mins);
    await dbService.updateVaultProfile({ autoLockMinutes: mins });
    sessionManager.setAutoLockMinutes(mins);
  };

  const handleChangePassword = async () => {
    if (!profile) return;
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Required', 'Please fill in all password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Password Length', 'New password must be at least 6 characters.');
      return;
    }

    // Verify existing password
    const verify = await vaultSecurity.verifyPassword(currentPassword, profile.salt, profile.passwordHash);
    if (!verify.isValid) {
      Alert.alert('Incorrect Password', 'Your current password is not correct.');
      return;
    }

    // Hash with modern PBKDF2-HMAC-SHA256
    const newSalt = vaultSecurity.generateSalt();
    const newHash = await vaultSecurity.hashPassword(newPassword, newSalt);

    await dbService.updateVaultProfile({
      passwordHash: newHash,
      salt: newSalt,
    });

    setIsChangingPassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    Alert.alert('Success', 'Vault password has been updated securely with PBKDF2-HMAC-SHA256.');
    loadSecuritySettings();
  };

  const handleChangePin = async () => {
    if (!profile) return;
    if (!currentAuthForPin || !newPin || !confirmPin) {
      Alert.alert('Required', 'Please enter your current vault password and new 4-digit PIN.');
      return;
    }
    if (!/^\d{4}$/.test(newPin)) {
      Alert.alert('Invalid PIN', 'Passcode must be exactly 4 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert('Mismatch', 'New passcodes do not match.');
      return;
    }

    // Verify current vault password
    const verify = await vaultSecurity.verifyPassword(currentAuthForPin, profile.salt, profile.passwordHash);
    if (!verify.isValid) {
      Alert.alert('Incorrect Password', 'Your current vault password was incorrect.');
      return;
    }

    const newPinHash = await vaultSecurity.hashPasscode(newPin, profile.salt);
    await dbService.updateVaultProfile({ passcodeHash: newPinHash });

    setIsChangingPin(false);
    setCurrentAuthForPin('');
    setNewPin('');
    setConfirmPin('');
    vaultSecurity.resetPinRateLimit();
    Alert.alert('Success', '4-digit app passcode has been updated.');
    loadSecuritySettings();
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Account Security</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Security Overview Status Card */}
        <VaultCard isDark={isDark} variant="highlight" style={styles.card}>
          <View style={styles.row}>
            <Shield size={22} color={theme.primary} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Local Cryptographic Vault</Text>
              <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
                Encrypted credentials protected by Android Keystore-backed storage & PBKDF2-HMAC-SHA256 key stretching.
              </Text>
            </View>
          </View>
        </VaultCard>

        {/* Change Password Card */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Password Security</Text>
        <VaultCard isDark={isDark} style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.rowLeft}>
              <Key size={20} color={theme.primary} />
              <View style={{ marginLeft: spacing.sm }}>
                <Text style={[styles.itemTitle, { color: theme.textPrimary }]}>Vault Master Password</Text>
                <Text style={[styles.itemSubtitle, { color: theme.textSecondary }]}>PBKDF2-HMAC-SHA256 (10,000 rounds)</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.smallActionButton, { backgroundColor: theme.surfaceHighlight, borderColor: theme.surfaceBorder }]}
              onPress={() => setIsChangingPassword((prev) => !prev)}
            >
              <Text style={[styles.smallActionText, { color: theme.primary }]}>
                {isChangingPassword ? 'Cancel' : 'Change'}
              </Text>
            </TouchableOpacity>
          </View>

          {isChangingPassword && (
            <View style={styles.formContainer}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Current Password</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                secureTextEntry
                placeholder="Enter current password"
                placeholderTextColor={theme.textMuted}
                value={currentPassword}
                onChangeText={setCurrentPassword}
              />
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>New Password (min 6 chars)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                secureTextEntry
                placeholder="Enter new password"
                placeholderTextColor={theme.textMuted}
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Confirm New Password</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                secureTextEntry
                placeholder="Confirm new password"
                placeholderTextColor={theme.textMuted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }]}
                onPress={handleChangePassword}
              >
                <Text style={styles.submitButtonText}>Update Master Password</Text>
              </TouchableOpacity>
            </View>
          )}
        </VaultCard>

        {/* Change 4-Digit Passcode Card */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Quick Unlock Passcode</Text>
        <VaultCard isDark={isDark} style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.rowLeft}>
              <Lock size={20} color={theme.primary} />
              <View style={{ marginLeft: spacing.sm }}>
                <Text style={[styles.itemTitle, { color: theme.textPrimary }]}>4-Digit App Passcode</Text>
                <Text style={[styles.itemSubtitle, { color: theme.textSecondary }]}>
                  {profile?.passcodeHash ? 'Active with brute-force rate limiting' : 'Not configured'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.smallActionButton, { backgroundColor: theme.surfaceHighlight, borderColor: theme.surfaceBorder }]}
              onPress={() => setIsChangingPin((prev) => !prev)}
            >
              <Text style={[styles.smallActionText, { color: theme.primary }]}>
                {isChangingPin ? 'Cancel' : profile?.passcodeHash ? 'Change' : 'Set PIN'}
              </Text>
            </TouchableOpacity>
          </View>

          {isChangingPin && (
            <View style={styles.formContainer}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Current Master Password</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                secureTextEntry
                placeholder="Authorize with master password"
                placeholderTextColor={theme.textMuted}
                value={currentAuthForPin}
                onChangeText={setCurrentAuthForPin}
              />
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>New 4-Digit Passcode</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                secureTextEntry
                keyboardType="numeric"
                maxLength={4}
                placeholder="••••"
                placeholderTextColor={theme.textMuted}
                value={newPin}
                onChangeText={setNewPin}
              />
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Confirm 4-Digit Passcode</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                secureTextEntry
                keyboardType="numeric"
                maxLength={4}
                placeholder="••••"
                placeholderTextColor={theme.textMuted}
                value={confirmPin}
                onChangeText={setConfirmPin}
              />
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }]}
                onPress={handleChangePin}
              >
                <Text style={styles.submitButtonText}>Save 4-Digit Passcode</Text>
              </TouchableOpacity>
            </View>
          )}
        </VaultCard>

        {/* Biometrics Card */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Biometrics</Text>
        <VaultCard isDark={isDark} style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.rowLeft}>
              <Fingerprint size={20} color={theme.primary} />
              <View style={{ marginLeft: spacing.sm }}>
                <Text style={[styles.itemTitle, { color: theme.textPrimary }]}>Biometric Unlock</Text>
                <Text style={[styles.itemSubtitle, { color: theme.textSecondary }]}>Fingerprint / Face ID recognition</Text>
              </View>
            </View>
            <Switch
              value={biometricsEnabled}
              onValueChange={handleToggleBiometrics}
              trackColor={{ false: theme.surfaceBorder, true: theme.primary }}
            />
          </View>
        </VaultCard>

        {/* Auto-Lock Timeout Card */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Auto-Lock Timeout</Text>
        <VaultCard isDark={isDark} style={styles.card}>
          <View style={styles.rowLeft}>
            <Clock size={20} color={theme.primary} />
            <View style={{ marginLeft: spacing.sm }}>
              <Text style={[styles.itemTitle, { color: theme.textPrimary }]}>Inactivity Timeout</Text>
              <Text style={[styles.itemSubtitle, { color: theme.textSecondary }]}>Automatically lock vault when backgrounded</Text>
            </View>
          </View>

          <View style={styles.optionsList}>
            {AUTO_LOCK_OPTIONS.map((opt) => {
              const isSelected = autoLockMinutes === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.optionRow,
                    {
                      borderColor: isSelected ? theme.primary : theme.surfaceBorder,
                      backgroundColor: isSelected ? theme.surfaceHighlight : 'transparent',
                    },
                  ]}
                  onPress={() => handleSelectAutoLock(opt.value)}
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      { color: isSelected ? theme.primary : theme.textPrimary },
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {isSelected && <CheckCircle size={16} color={theme.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </VaultCard>

        {/* Privacy & Anti-Surveillance Safeguards */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Active Protection Safeguards</Text>
        <VaultCard isDark={isDark} style={styles.card}>
          <View style={styles.safeguardRow}>
            <EyeOff size={18} color={theme.income} />
            <View style={{ marginLeft: spacing.sm, flex: 1 }}>
              <Text style={[styles.safeguardTitle, { color: theme.textPrimary }]}>Android FLAG_SECURE Active</Text>
              <Text style={[styles.safeguardDesc, { color: theme.textSecondary }]}>
                Screen capture blocked & recent-apps switcher masked.
              </Text>
            </View>
          </View>
        </VaultCard>

        {/* Immediate Manual Lock */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Manual Vault Lockdown</Text>
        <VaultCard isDark={isDark} style={styles.card}>
          <TouchableOpacity
            style={styles.manualLockRow}
            onPress={() => sessionManager.lock()}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: theme.primaryGlow }]}>
              <Lock size={18} color={theme.primary} />
            </View>
            <View style={{ marginLeft: spacing.sm, flex: 1 }}>
              <Text style={[styles.itemTitle, { color: theme.textPrimary }]}>Lock Vault Immediately</Text>
              <Text style={[styles.itemSubtitle, { color: theme.textSecondary }]}>
                Require PIN or biometric authentication now
              </Text>
            </View>
            <Text style={{ color: theme.primary, fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.xs }}>
              LOCK NOW
            </Text>
          </TouchableOpacity>
        </VaultCard>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  scrollContent: {
    padding: layout.screenPadding,
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  sectionHeader: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: 4,
  },
  card: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  cardSubtitle: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
    lineHeight: 16,
  },
  itemTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  itemSubtitle: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  smallActionButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
  },
  smallActionText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  formContainer: {
    borderTopWidth: 1,
    borderTopColor: '#33333330',
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: typography.fontSize.xs,
    marginTop: 4,
  },
  input: {
    height: 42,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    fontSize: typography.fontSize.sm,
  },
  submitButton: {
    height: 42,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  optionsList: {
    marginTop: spacing.xs,
    gap: 6,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  optionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  safeguardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  safeguardTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  safeguardDesc: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  manualLockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
