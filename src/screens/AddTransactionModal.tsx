/**
 * AddTransactionModal.tsx
 * Quick manual transaction entry for cash expenses, income, or transfers.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Check } from 'lucide-react-native';
import { spacing, borderRadius, layout } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { dbService } from '../database/DatabaseService';
import { Account, Category, TransactionType } from '../types/database';

interface AddTransactionModalProps {
  navigation: any;
  isDark?: boolean;
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  navigation,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;

  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [notes, setNotes] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

  useEffect(() => {
    dbService.getAccounts().then((accs) => {
      setAccounts(accs);
      if (accs.length > 0) setSelectedAccountId(accs[0].id);
    });
    dbService.getCategories().then((cats) => {
      setCategories(cats);
      if (cats.length > 0) setSelectedCategoryId(cats[0].id);
    });
  }, []);

  const handleSave = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Required', 'Please enter a valid amount.');
      return;
    }
    if (!merchantName.trim()) {
      Alert.alert('Required', 'Please enter a merchant or description.');
      return;
    }

    try {
      await dbService.createTransaction({
        accountId: selectedAccountId,
        categoryId: selectedCategoryId || null,
        amount: numAmount,
        type,
        merchantName: merchantName.trim(),
        cleanMerchant: merchantName.trim(),
        source: 'MANUAL',
        status: 'CONFIRMED',
        timestamp: new Date().toISOString(),
        notes: notes.trim() || null,
      });

      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to record transaction.');
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.topBar}>
        <Text style={[styles.topBarTitle, { color: theme.textPrimary }]}>Record Transaction</Text>
        <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
          <X size={22} color={theme.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Type Selector (Expense / Income / Transfer) */}
        <View style={[styles.typeSelectorRow, { backgroundColor: theme.surfaceHighlight }]}>
          {(['EXPENSE', 'INCOME', 'TRANSFER'] as TransactionType[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[
                styles.typeButton,
                {
                  backgroundColor: type === t ? theme.primary : 'transparent',
                },
              ]}
              onPress={() => setType(t)}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  {
                    color: type === t ? '#FFFFFF' : theme.textSecondary,
                    fontWeight: type === t ? typography.fontWeight.bold : typography.fontWeight.medium,
                  },
                ]}
              >
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Amount Input */}
        <VaultCard isDark={isDark} style={styles.amountCard}>
          <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>Amount in ETB</Text>
          <View style={styles.amountInputRow}>
            <TextInput
              style={[styles.heroAmountInput, { color: theme.textPrimary }]}
              placeholder="0.00"
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              autoFocus
            />
            <Text style={[styles.amountCurrency, { color: theme.primary }]}>ETB</Text>
          </View>
        </VaultCard>

        {/* Details Card */}
        <VaultCard isDark={isDark} style={styles.formCard}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
            {type === 'INCOME' ? 'Payer / Source' : type === 'TRANSFER' ? 'Transfer Note' : 'Merchant / Store'}
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
            placeholder="e.g. Kaldi's Coffee, Taxi, Salary"
            placeholderTextColor={theme.textMuted}
            value={merchantName}
            onChangeText={setMerchantName}
          />

          {/* Account Selector */}
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Account / Wallet</Text>
          <View style={styles.pillsRow}>
            {accounts.map((acc) => (
              <TouchableOpacity
                key={acc.id}
                style={[
                  styles.pill,
                  {
                    backgroundColor: selectedAccountId === acc.id ? theme.primary : theme.surfaceHighlight,
                    borderColor: selectedAccountId === acc.id ? theme.primary : theme.surfaceBorder,
                  },
                ]}
                onPress={() => setSelectedAccountId(acc.id)}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: selectedAccountId === acc.id ? '#FFFFFF' : theme.textPrimary },
                  ]}
                >
                  {acc.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Category Selector */}
          {type !== 'TRANSFER' && (
            <>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Category</Text>
              <View style={styles.pillsRow}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.pill,
                      {
                        backgroundColor: selectedCategoryId === cat.id ? cat.colorHex : theme.surfaceHighlight,
                        borderColor: selectedCategoryId === cat.id ? cat.colorHex : theme.surfaceBorder,
                      },
                    ]}
                    onPress={() => setSelectedCategoryId(cat.id)}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        { color: selectedCategoryId === cat.id ? '#FFFFFF' : theme.textPrimary },
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Notes (Optional)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
            placeholder="Add extra context..."
            placeholderTextColor={theme.textMuted}
            value={notes}
            onChangeText={setNotes}
          />
        </VaultCard>

        {/* Save Button */}
        <TouchableOpacity style={[styles.saveButton, { backgroundColor: theme.primary }]} onPress={handleSave}>
          <Check size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.saveButtonText}>Save to Ledger</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: layout.screenPaddingHorizontal,
    paddingVertical: spacing.md,
  },
  topBarTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  closeButton: {
    padding: spacing.xs,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPaddingHorizontal,
    paddingBottom: spacing['4xl'],
  },
  typeSelectorRow: {
    flexDirection: 'row',
    borderRadius: borderRadius.pill,
    padding: 4,
    marginBottom: spacing.lg,
  },
  typeButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.pill,
  },
  typeButtonText: {
    fontSize: typography.fontSize.xs,
  },
  amountCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.lg,
  },
  amountLabel: {
    fontSize: typography.fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  heroAmountInput: {
    fontSize: typography.fontSize.currencyHero,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
    minWidth: 140,
  },
  amountCurrency: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginLeft: 6,
  },
  formCard: {
    padding: spacing.base,
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
    height: 46,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    fontSize: typography.fontSize.sm,
    borderWidth: 1,
    marginBottom: spacing.xs,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
  },
  pillText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: borderRadius.pill,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
});
