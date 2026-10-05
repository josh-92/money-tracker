/**
 * ReconcileModal.tsx
 * Account balance reconciliation modal.
 * - Allows comparing current app ledger balance with physical bank/wallet balance
 * - Creates an auditable 'RECONCILIATION' adjustment entry if discrepancy exists
 * - Zero hidden balance adjustments; 100% auditable
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
import { X, CheckCircle2, AlertTriangle, ArrowRight, SlidersHorizontal } from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { ProviderLogo } from '../components/ProviderLogo';
import { Account } from '../types/database';
import { dbService } from '../database/DatabaseService';
import { useBalanceVisibility } from '../context/BalanceVisibilityContext';

interface ReconcileModalProps {
  route?: {
    params?: {
      accountId?: string;
    };
  };
  navigation: any;
  isDark?: boolean;
}

export const ReconcileModal: React.FC<ReconcileModalProps> = ({
  route,
  navigation,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;
  const { formatAmount } = useBalanceVisibility();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    route?.params?.accountId || ''
  );
  const [actualBalanceInput, setActualBalanceInput] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    dbService.getAccounts().then((accs) => {
      setAccounts(accs);
      if (!selectedAccountId && accs.length > 0) {
        setSelectedAccountId(accs[0].id);
      }
    });
  }, [selectedAccountId]);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const currentAppBalance =
    selectedAccount?.calculatedBalance ?? selectedAccount?.openingBalance ?? 0;

  const parsedActual = parseFloat(actualBalanceInput);
  const hasInput = !isNaN(parsedActual);
  const discrepancy = hasInput ? parsedActual - currentAppBalance : 0;
  const isMatch = hasInput && Math.abs(discrepancy) < 0.01;

  const handleReconcile = async () => {
    if (!selectedAccount) return;

    if (!hasInput || parsedActual < 0) {
      Alert.alert('Invalid Balance', 'Please enter your actual current bank/wallet balance.');
      return;
    }

    try {
      setLoading(true);
      const adjustmentTx = await dbService.reconcileAccount(
        selectedAccount.id,
        parsedActual,
        notes.trim() || undefined
      );

      if (adjustmentTx) {
        Alert.alert(
          'Reconciliation Recorded',
          `An adjustment of ${Math.abs(discrepancy).toFixed(2)} ETB was recorded to align your ledger balance with your bank statement.`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert(
          'Perfect Match!',
          'Your app ledger is already perfectly balanced with your bank statement. No adjustment was needed.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to reconcile account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
        <View style={{ width: 32 }} />
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Reconcile Balance</Text>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={22} color={theme.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Account Selector */}
        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Select Account</Text>
        <View style={styles.accountsRow}>
          {accounts.map((acc) => {
            const isSelected = selectedAccountId === acc.id;
            return (
              <TouchableOpacity
                key={acc.id}
                style={[
                  styles.accountPill,
                  {
                    backgroundColor: isSelected ? theme.primary + '15' : theme.surfaceHighlight,
                    borderColor: isSelected ? theme.primary : theme.surfaceBorder,
                  },
                ]}
                onPress={() => {
                  setSelectedAccountId(acc.id);
                  setActualBalanceInput('');
                }}
              >
                <ProviderLogo providerKey={acc.providerKey} size={20} containerBackground={false} />
                <Text
                  style={[
                    styles.accountPillText,
                    { color: isSelected ? theme.primary : theme.textPrimary },
                  ]}
                >
                  {acc.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Current App Balance Card */}
        {selectedAccount && (
          <VaultCard isDark={isDark} style={styles.currentBalanceCard}>
            <Text style={[styles.balanceCardLabel, { color: theme.textSecondary }]}>
              Current App Ledger Balance
            </Text>
            <Text style={[styles.balanceCardAmount, { color: theme.textPrimary }]}>
              {formatAmount(currentAppBalance, selectedAccount.currency)}
            </Text>
            <Text style={[styles.balanceCardNotice, { color: theme.textMuted }]}>
              Calculated from opening balance and all confirmed transactions.
            </Text>
          </VaultCard>
        )}

        {/* Actual Bank Balance Input */}
        <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: spacing.md }]}>
          Actual Bank / SMS Balance (ETB)
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.surfaceHighlight,
              color: theme.textPrimary,
              borderColor: theme.surfaceBorder,
            },
          ]}
          placeholder="e.g. 14,250.00"
          placeholderTextColor={theme.textMuted}
          keyboardType="numeric"
          value={actualBalanceInput}
          onChangeText={setActualBalanceInput}
        />

        {/* Discrepancy Indicator Box */}
        {hasInput && (
          <View
            style={[
              styles.discrepancyBox,
              {
                backgroundColor: isMatch ? theme.incomeBackground : theme.warningBackground,
                borderColor: isMatch ? theme.income : theme.warning,
              },
            ]}
          >
            {isMatch ? (
              <View style={styles.discrepancyContent}>
                <CheckCircle2 size={18} color={theme.income} />
                <Text style={[styles.discrepancyText, { color: theme.income }]}>
                  Ledger is perfectly balanced! No adjustments required.
                </Text>
              </View>
            ) : (
              <View style={styles.discrepancyContent}>
                <AlertTriangle size={18} color={theme.warning} />
                <Text style={[styles.discrepancyText, { color: theme.warning }]}>
                  {discrepancy > 0
                    ? `Discrepancy: +${discrepancy.toFixed(2)} ETB (Ledger is lower than bank)`
                    : `Discrepancy: ${discrepancy.toFixed(2)} ETB (Ledger is higher than bank)`}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Optional Notes */}
        <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: spacing.sm }]}>
          Reconciliation Notes (Optional)
        </Text>
        <TextInput
          style={[
            styles.notesInput,
            {
              backgroundColor: theme.surfaceHighlight,
              color: theme.textPrimary,
              borderColor: theme.surfaceBorder,
            },
          ]}
          placeholder="e.g. Monthly statement review"
          placeholderTextColor={theme.textMuted}
          value={notes}
          onChangeText={setNotes}
        />

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: theme.primary }]}
          onPress={handleReconcile}
          disabled={loading || !hasInput}
        >
          <Text style={styles.submitButtonText}>
            {loading ? 'Reconciling...' : 'Save Reconciliation'}
          </Text>
          <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
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
    paddingHorizontal: layout.screenPaddingHorizontal,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  scrollContent: {
    padding: layout.screenPaddingHorizontal,
    paddingBottom: 40,
  },
  fieldLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing.xs,
  },
  accountsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.md,
  },
  accountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    gap: 6,
  },
  accountPillText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  currentBalanceCard: {
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  balanceCardLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  balanceCardAmount: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    marginVertical: 4,
  },
  balanceCardNotice: {
    fontSize: 11,
  },
  input: {
    height: 52,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
  discrepancyBox: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  discrepancyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  discrepancyText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    flex: 1,
  },
  notesInput: {
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: typography.fontSize.sm,
  },
  submitButton: {
    height: 52,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
});
