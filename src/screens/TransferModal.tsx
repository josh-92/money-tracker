/**
 * TransferModal.tsx
 * Double-entry internal transfer modal.
 * - Allows transferring funds between user's own accounts (e.g. CBE -> Telebirr)
 * - Prevents double counting in net worth calculations
 * - Clean UI with ProviderLogo account selection
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
import { X, ArrowRightLeft, Check, ArrowRight } from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { ProviderLogo } from '../components/ProviderLogo';
import { Account } from '../types/database';
import { dbService } from '../database/DatabaseService';
import { useBalanceVisibility } from '../context/BalanceVisibilityContext';

interface TransferModalProps {
  navigation: any;
  isDark?: boolean;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  navigation,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;
  const { formatAmount } = useBalanceVisibility();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fromAccountId, setFromAccountId] = useState<string>('');
  const [toAccountId, setToAccountId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    dbService.getAccounts().then((accs) => {
      setAccounts(accs);
      if (accs.length >= 2) {
        setFromAccountId(accs[0].id);
        setToAccountId(accs[1].id);
      } else if (accs.length === 1) {
        setFromAccountId(accs[0].id);
      }
    });
  }, []);

  const handleTransfer = async () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid transfer amount.');
      return;
    }

    if (!fromAccountId || !toAccountId) {
      Alert.alert('Select Accounts', 'Please select both source and destination accounts.');
      return;
    }

    if (fromAccountId === toAccountId) {
      Alert.alert('Same Account', 'Source and destination accounts must be different.');
      return;
    }

    const fromAcc = accounts.find((a) => a.id === fromAccountId);
    const toAcc = accounts.find((a) => a.id === toAccountId);

    if (!fromAcc || !toAcc) return;

    try {
      setLoading(true);
      await dbService.createTransaction({
        accountId: fromAccountId,
        destinationAccountId: toAccountId,
        amount: parsedAmount,
        type: 'TRANSFER',
        merchantName: `Transfer to ${toAcc.name}`,
        cleanMerchant: 'Internal Transfer',
        notes: notes.trim() || `Transfer from ${fromAcc.name} to ${toAcc.name}`,
        status: 'CONFIRMED',
        timestamp: new Date().toISOString(),
        source: 'MANUAL',
        confidenceScore: 1.0,
      });

      Alert.alert('Transfer Completed', `Successfully recorded transfer of ${parsedAmount.toLocaleString()} ETB.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Transfer Error', err.message || 'Failed to record transfer.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
        <View style={{ width: 32 }} />
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Internal Transfer</Text>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={22} color={theme.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Source Account ("From") */}
        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>From Account (Debit)</Text>
        <View style={styles.accountsGrid}>
          {accounts.map((acc) => {
            const isSelected = fromAccountId === acc.id;
            return (
              <TouchableOpacity
                key={acc.id}
                style={[
                  styles.accountTile,
                  {
                    backgroundColor: isSelected ? theme.primary + '15' : theme.surfaceHighlight,
                    borderColor: isSelected ? theme.primary : theme.surfaceBorder,
                  },
                ]}
                onPress={() => setFromAccountId(acc.id)}
              >
                <ProviderLogo providerKey={acc.providerKey} size={28} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={[styles.accTileName, { color: theme.textPrimary }]} numberOfLines={1}>
                    {acc.name}
                  </Text>
                  <Text style={[styles.accTileBalance, { color: theme.textSecondary }]}>
                    {formatAmount(acc.calculatedBalance ?? 0)}
                  </Text>
                </View>
                {isSelected && <Check size={16} color={theme.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Transfer Indicator */}
        <View style={styles.transferDividerRow}>
          <View style={[styles.transferLine, { backgroundColor: theme.surfaceBorder }]} />
          <View style={[styles.transferIconCircle, { backgroundColor: theme.surfaceHighlight, borderColor: theme.surfaceBorder }]}>
            <ArrowRightLeft size={16} color={theme.transfer} />
          </View>
          <View style={[styles.transferLine, { backgroundColor: theme.surfaceBorder }]} />
        </View>

        {/* Destination Account ("To") */}
        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>To Account (Credit)</Text>
        <View style={styles.accountsGrid}>
          {accounts.map((acc) => {
            const isSelected = toAccountId === acc.id;
            const isFrom = fromAccountId === acc.id;
            return (
              <TouchableOpacity
                key={acc.id}
                disabled={isFrom}
                style={[
                  styles.accountTile,
                  {
                    backgroundColor: isSelected ? theme.transfer + '15' : theme.surfaceHighlight,
                    borderColor: isSelected ? theme.transfer : theme.surfaceBorder,
                    opacity: isFrom ? 0.35 : 1.0,
                  },
                ]}
                onPress={() => setToAccountId(acc.id)}
              >
                <ProviderLogo providerKey={acc.providerKey} size={28} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={[styles.accTileName, { color: theme.textPrimary }]} numberOfLines={1}>
                    {acc.name}
                  </Text>
                  <Text style={[styles.accTileBalance, { color: theme.textSecondary }]}>
                    {formatAmount(acc.calculatedBalance ?? 0)}
                  </Text>
                </View>
                {isSelected && <Check size={16} color={theme.transfer} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Transfer Amount */}
        <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: spacing.md }]}>
          Transfer Amount (ETB)
        </Text>
        <TextInput
          style={[
            styles.amountInput,
            {
              backgroundColor: theme.surfaceHighlight,
              color: theme.textPrimary,
              borderColor: theme.surfaceBorder,
            },
          ]}
          placeholder="0.00"
          placeholderTextColor={theme.textMuted}
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />

        {/* Optional Notes */}
        <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: spacing.sm }]}>
          Notes (Optional)
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
          placeholder="e.g. CBE to Telebirr wallet top-up"
          placeholderTextColor={theme.textMuted}
          value={notes}
          onChangeText={setNotes}
        />

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: theme.primary }]}
          onPress={handleTransfer}
          disabled={loading}
        >
          <Text style={styles.submitButtonText}>
            {loading ? 'Recording Transfer...' : 'Complete Transfer'}
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
  accountsGrid: {
    gap: 8,
    marginBottom: spacing.xs,
  },
  accountTile: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  accTileName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  accTileBalance: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  transferDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  transferLine: {
    flex: 1,
    height: 1,
  },
  transferIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  amountInput: {
    height: 52,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
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
