/**
 * ManageAccountsModal.tsx
 * Comprehensive Account & Wallet management modal.
 * - Add, rename, edit provider, change color, update balance, activate/deactivate accounts
 * - Ensures user is never forced into default providers
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  X,
  Plus,
  Landmark,
  Smartphone,
  Building2,
  Wallet,
  Trash2,
  CheckCircle,
  Edit2,
} from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { dbService } from '../database/DatabaseService';
import { Account, ProviderKey } from '../types/database';
import { ProviderLogo } from '../components/ProviderLogo';

interface ManageAccountsModalProps {
  navigation: any;
  isDark?: boolean;
}

const PROVIDER_OPTIONS: Array<{ key: ProviderKey; name: string; icon: string; defaultColor: string }> = [
  { key: 'CBE', name: 'Commercial Bank of Ethiopia', icon: 'Landmark', defaultColor: '#7B1FA2' },
  { key: 'TELEBIRR', name: 'Telebirr Wallet', icon: 'Smartphone', defaultColor: '#00A3E0' },
  { key: 'AWASH', name: 'Awash Bank', icon: 'Building2', defaultColor: '#006A4E' },
  { key: 'CASH', name: 'Cash in Hand', icon: 'Wallet', defaultColor: '#10B981' },
  { key: 'CUSTOM', name: 'Other Bank / Account', icon: 'Wallet', defaultColor: '#0066FF' },
];

const COLOR_PRESETS = ['#7B1FA2', '#00A3E0', '#006A4E', '#10B981', '#0066FF', '#F97316', '#EF4444', '#8B5CF6'];

export const ManageAccountsModal: React.FC<ManageAccountsModalProps> = ({
  navigation,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formProvider, setFormProvider] = useState<ProviderKey>('CBE');
  const [formMask, setFormMask] = useState('');
  const [formOpeningBalance, setFormOpeningBalance] = useState('');
  const [formColor, setFormColor] = useState('#7B1FA2');

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    const list = await dbService.getAccounts();
    setAccounts(list);
  };

  const handleStartAdd = () => {
    setFormName('');
    setFormProvider('CBE');
    setFormMask('**** 1234');
    setFormOpeningBalance('0');
    setFormColor('#7B1FA2');
    setEditingAccountId(null);
    setIsAdding(true);
  };

  const handleStartEdit = (acc: Account) => {
    setFormName(acc.name);
    setFormProvider(acc.providerKey);
    setFormMask(acc.accountMask);
    setFormOpeningBalance(String(acc.openingBalance || 0));
    setFormColor(acc.colorHex);
    setEditingAccountId(acc.id);
    setIsAdding(true);
  };

  const handleSaveAccount = async () => {
    if (!formName.trim()) {
      Alert.alert('Required', 'Please enter an account name.');
      return;
    }

    try {
      const openingBal = parseFloat(formOpeningBalance) || 0;
      if (editingAccountId) {
        // Update existing
        await dbService.updateAccount(editingAccountId, {
          name: formName.trim(),
          providerKey: formProvider,
          accountMask: formMask.trim() || '**** 0000',
          colorHex: formColor,
        });
        Alert.alert('Updated', 'Account details updated.');
      } else {
        // Create new
        await dbService.createAccount({
          name: formName.trim(),
          providerKey: formProvider,
          accountMask: formMask.trim() || '**** 0000',
          currency: 'ETB',
          colorHex: formColor,
          iconName: PROVIDER_OPTIONS.find((p) => p.key === formProvider)?.icon || 'Wallet',
          openingBalance: openingBal,
        });
        Alert.alert('Created', 'New account added to vault.');
      }

      setIsAdding(false);
      setEditingAccountId(null);
      loadAccounts();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save account.');
    }
  };

  const handleDeleteAccount = (acc: Account) => {
    Alert.alert(
      'Remove Account',
      `Are you sure you want to deactivate ${acc.name}? Historical transactions will remain preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            await dbService.deleteAccount(acc.id);
            loadAccounts();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <X size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Accounts & Wallets</Text>
        <TouchableOpacity style={styles.addBtn} onPress={handleStartAdd}>
          <Plus size={22} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isAdding && (
          <VaultCard isDark={isDark} variant="highlight" style={styles.formCard}>
            <Text style={[styles.formTitle, { color: theme.textPrimary }]}>
              {editingAccountId ? 'Edit Account' : 'Add New Account / Wallet'}
            </Text>

            {/* Provider Picker */}
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Account Provider</Text>
            <View style={styles.providerPills}>
              {PROVIDER_OPTIONS.map((p) => {
                const isSelected = formProvider === p.key;
                return (
                  <TouchableOpacity
                    key={p.key}
                    style={[
                      styles.providerPill,
                      {
                        backgroundColor: isSelected ? theme.primary : theme.surfaceHighlight,
                        borderColor: isSelected ? theme.primary : theme.surfaceBorder,
                      },
                    ]}
                    onPress={() => {
                      setFormProvider(p.key);
                      setFormColor(p.defaultColor);
                      if (!formName) setFormName(p.name);
                    }}
                  >
                    <ProviderLogo providerKey={p.key} size={16} containerBackground={false} />
                    <Text
                      style={[
                        styles.providerPillText,
                        { color: isSelected ? '#FFFFFF' : theme.textPrimary },
                      ]}
                    >
                      {p.name.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Display Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
              value={formName}
              onChangeText={setFormName}
              placeholder="e.g. CBE Savings or Telebirr"
              placeholderTextColor={theme.textMuted}
            />

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Account / Phone Mask</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
              value={formMask}
              onChangeText={setFormMask}
              placeholder="e.g. **** 7852 or 09** *** 289"
              placeholderTextColor={theme.textMuted}
            />

            {!editingAccountId && (
              <>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Current Balance (Opening Balance)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                  keyboardType="numeric"
                  value={formOpeningBalance}
                  onChangeText={setFormOpeningBalance}
                  placeholder="0.00"
                  placeholderTextColor={theme.textMuted}
                />
                <Text style={[styles.openingNotice, { color: theme.textMuted }]}>
                  This will be recorded as your starting opening balance in the ledger.
                </Text>
              </>
            )}

            {/* Color Palette */}
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Badge Color</Text>
            <View style={styles.colorRow}>
              {COLOR_PRESETS.map((hex) => (
                <TouchableOpacity
                  key={hex}
                  style={[
                    styles.colorCircle,
                    {
                      backgroundColor: hex,
                      borderColor: formColor === hex ? '#FFFFFF' : 'transparent',
                    },
                  ]}
                  onPress={() => setFormColor(hex)}
                />
              ))}
            </View>

            <View style={styles.formButtonRow}>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: theme.primary }]}
                onPress={handleSaveAccount}
              >
                <Text style={styles.saveBtnText}>{editingAccountId ? 'Save Updates' : 'Add Account'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: theme.surfaceBorder }]}
                onPress={() => {
                  setIsAdding(false);
                  setEditingAccountId(null);
                }}
              >
                <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </VaultCard>
        )}

        {/* Existing Accounts List */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Configured Accounts</Text>
        <View style={styles.accountList}>
          {accounts.map((acc) => (
            <VaultCard key={acc.id} isDark={isDark} style={styles.accCard}>
              <View style={styles.accRow}>
                <ProviderLogo providerKey={acc.providerKey} size={36} />
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={[styles.accName, { color: theme.textPrimary }]}>{acc.name}</Text>
                  <Text style={[styles.accMask, { color: theme.textSecondary }]}>
                    {acc.providerKey} • {acc.accountMask}
                  </Text>
                  <Text style={[styles.accBalance, { color: theme.primary }]}>
                    {(acc.calculatedBalance || 0).toLocaleString()} ETB
                  </Text>
                </View>

                <View style={styles.accActions}>
                  <TouchableOpacity
                    style={[styles.actionIconBtn, { backgroundColor: theme.surfaceHighlight }]}
                    onPress={() => handleStartEdit(acc)}
                  >
                    <Edit2 size={16} color={theme.textPrimary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionIconBtn, { backgroundColor: theme.surfaceHighlight }]}
                    onPress={() => handleDeleteAccount(acc)}
                  >
                    <Trash2 size={16} color={theme.expense} />
                  </TouchableOpacity>
                </View>
              </View>
            </VaultCard>
          ))}
        </View>
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
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
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
    marginTop: spacing.xs,
    marginBottom: 4,
  },
  formCard: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  formTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: typography.fontSize.xs,
    marginTop: 4,
  },
  providerPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 4,
  },
  providerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    gap: 6,
  },
  providerPillText: {
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
  },
  input: {
    height: 42,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    fontSize: typography.fontSize.sm,
  },
  openingNotice: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },
  colorRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginVertical: 4,
  },
  colorCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
  },
  formButtonRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  saveBtn: {
    flex: 1,
    height: 42,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  cancelBtn: {
    paddingHorizontal: spacing.md,
    height: 42,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  accountList: {
    gap: spacing.xs,
  },
  accCard: {
    padding: spacing.sm,
  },
  accRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accColorStrip: {
    width: 6,
    height: 48,
    borderRadius: 3,
  },
  accName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  accMask: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  accBalance: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    marginTop: 2,
  },
  accActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
