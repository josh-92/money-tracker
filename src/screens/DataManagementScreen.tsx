/**
 * DataManagementScreen.tsx
 * Dedicated Data Management screen.
 * - Local vault database stats (Total transactions, accounts, storage footprint)
 * - Export local backup (JSON & CSV to clipboard)
 * - Clear all transaction history
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import {
  ArrowLeft,
  Download,
  Trash2,
  FileText,
  Check,
} from 'lucide-react-native';
import { spacing, layout } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { dbService } from '../database/DatabaseService';

interface DataManagementScreenProps {
  navigation: any;
  isDark?: boolean;
}

export const DataManagementScreen: React.FC<DataManagementScreenProps> = ({
  navigation,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;

  const [stats, setStats] = useState({
    transactionCount: 0,
    accountCount: 0,
    budgetCount: 0,
    goalCount: 0,
  });

  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedCsv, setCopiedCsv] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const db = await dbService.getDb();
      const txRow = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM transactions WHERE is_deleted = 0;'
      );
      const accRow = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM accounts WHERE is_active = 1;'
      );
      const bgtRow = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM budgets;'
      );
      const goalRow = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM savings_goals;'
      );

      setStats({
        transactionCount: txRow?.count || 0,
        accountCount: accRow?.count || 0,
        budgetCount: bgtRow?.count || 0,
        goalCount: goalRow?.count || 0,
      });
    } catch (err) {
      console.warn('Error loading data management stats:', err);
    }
  };

  const handleExportJsonBackup = async () => {
    try {
      const [txs, accounts, goals] = await Promise.all([
        dbService.getTransactions(),
        dbService.getAccounts(),
        dbService.getSavingsGoals(),
      ]);

      const backup = {
        app: 'MoneyTracker',
        version: '2.0.0',
        exportDate: new Date().toISOString(),
        metadata: {
          totalAccounts: accounts.length,
          totalTransactions: txs.length,
          totalSavingsGoals: goals.length,
        },
        accounts,
        transactions: txs,
        savingsGoals: goals,
      };

      const jsonStr = JSON.stringify(backup, null, 2);
      await Clipboard.setStringAsync(jsonStr);

      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2500);

      Alert.alert(
        'Backup Copied to Clipboard',
        `Successfully exported ${txs.length} transactions, ${accounts.length} accounts, and ${goals.length} savings goals as JSON.\n\nYou can paste and save this into a secure text document, notes app, or personal offline storage.`
      );
    } catch (err: any) {
      Alert.alert('Export Error', err.message || 'Failed to export backup.');
    }
  };

  const handleExportCsvLedger = async () => {
    try {
      const txs = await dbService.getTransactions();

      const escapeCsv = (val: any) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      const headers = [
        'ID',
        'Date',
        'Account',
        'Provider',
        'Type',
        'Amount',
        'Currency',
        'Merchant',
        'Category',
        'ReferenceNumber',
        'Status',
        'Notes',
      ];

      const rows = txs.map((tx) => [
        escapeCsv(tx.id),
        escapeCsv(tx.timestamp),
        escapeCsv(tx.accountName || tx.accountId),
        escapeCsv(tx.providerKey || ''),
        escapeCsv(tx.type),
        escapeCsv(tx.amount),
        escapeCsv('ETB'),
        escapeCsv(tx.cleanMerchant || tx.merchantName),
        escapeCsv(tx.categoryName || ''),
        escapeCsv(tx.refNumber || tx.transactionNumber || ''),
        escapeCsv(tx.status),
        escapeCsv(tx.notes || ''),
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      await Clipboard.setStringAsync(csvContent);

      setCopiedCsv(true);
      setTimeout(() => setCopiedCsv(false), 2500);

      Alert.alert(
        'CSV Export Copied to Clipboard',
        `Exported ${txs.length} transactions as standard CSV format.\n\nYou can paste this directly into Microsoft Excel, Google Sheets, or any spreadsheet software.`
      );
    } catch (err: any) {
      Alert.alert('CSV Export Error', err.message || 'Failed to export CSV.');
    }
  };

  const handleClearTransactions = () => {
    Alert.alert(
      'Clear Transactions',
      'Are you sure you want to clear all transaction records? Opening balances and account profiles will remain intact.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            const db = await dbService.getDb();
            await db.runAsync("DELETE FROM transactions WHERE type != 'OPENING_BALANCE';");
            Alert.alert('Cleared', 'All transaction history has been removed.');
            loadStats();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Data Management</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Ledger Statistics */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Local Storage Footprint</Text>
        <VaultCard isDark={isDark} style={styles.card}>
          <View style={styles.statRow}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Active Accounts</Text>
            <Text style={[styles.statValue, { color: theme.textPrimary }]}>{stats.accountCount}</Text>
          </View>
          <View style={[styles.statRow, { borderTopWidth: 1, borderTopColor: theme.surfaceBorder, paddingTop: spacing.xs }]}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Recorded Transactions</Text>
            <Text style={[styles.statValue, { color: theme.textPrimary }]}>{stats.transactionCount}</Text>
          </View>
          <View style={[styles.statRow, { borderTopWidth: 1, borderTopColor: theme.surfaceBorder, paddingTop: spacing.xs }]}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Category Budgets</Text>
            <Text style={[styles.statValue, { color: theme.textPrimary }]}>{stats.budgetCount}</Text>
          </View>
          <View style={[styles.statRow, { borderTopWidth: 1, borderTopColor: theme.surfaceBorder, paddingTop: spacing.xs }]}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Savings Goals</Text>
            <Text style={[styles.statValue, { color: theme.textPrimary }]}>{stats.goalCount}</Text>
          </View>
        </VaultCard>

        {/* Backup & Portability */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Backup & Portability</Text>
        <VaultCard isDark={isDark} style={styles.card}>
          {/* JSON Export */}
          <TouchableOpacity style={styles.actionRow} onPress={handleExportJsonBackup}>
            {copiedJson ? (
              <Check size={20} color={theme.income} />
            ) : (
              <Download size={20} color={theme.primary} />
            )}
            <View style={{ marginLeft: spacing.sm, flex: 1 }}>
              <Text style={[styles.actionTitle, { color: theme.textPrimary }]}>
                {copiedJson ? 'Vault Backup Copied!' : 'Copy Vault Ledger Backup (JSON)'}
              </Text>
              <Text style={[styles.actionDesc, { color: theme.textSecondary }]}>
                Copies complete unencrypted offline JSON backup of all accounts, transactions, and savings goals to your clipboard.
              </Text>
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: theme.surfaceBorder }]} />

          {/* CSV Export */}
          <TouchableOpacity style={styles.actionRow} onPress={handleExportCsvLedger}>
            {copiedCsv ? (
              <Check size={20} color={theme.income} />
            ) : (
              <FileText size={20} color={theme.primary} />
            )}
            <View style={{ marginLeft: spacing.sm, flex: 1 }}>
              <Text style={[styles.actionTitle, { color: theme.textPrimary }]}>
                {copiedCsv ? 'Transactions CSV Copied!' : 'Export Transactions to Spreadsheet (CSV)'}
              </Text>
              <Text style={[styles.actionDesc, { color: theme.textSecondary }]}>
                Copies all ledger records formatted as CSV to clipboard for Excel, Google Sheets, or offline analysis.
              </Text>
            </View>
          </TouchableOpacity>
        </VaultCard>

        {/* Danger Zone */}
        <Text style={[styles.sectionHeader, { color: theme.expense }]}>Danger Zone</Text>
        <VaultCard isDark={isDark} style={[styles.card, { borderColor: theme.expense + '40' }]}>
          <TouchableOpacity style={styles.actionRow} onPress={handleClearTransactions}>
            <Trash2 size={20} color={theme.expense} />
            <View style={{ marginLeft: spacing.sm, flex: 1 }}>
              <Text style={[styles.actionTitle, { color: theme.expense }]}>Clear Transaction Records</Text>
              <Text style={[styles.actionDesc, { color: theme.textSecondary }]}>
                Permanently delete all non-opening transactions from this device.
              </Text>
            </View>
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
    paddingHorizontal: layout.screenPaddingHorizontal,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  scrollContent: {
    padding: layout.screenPaddingHorizontal,
    paddingBottom: spacing['4xl'],
  },
  sectionHeader: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    marginLeft: 4,
  },
  card: {
    padding: spacing.md,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  statLabel: {
    fontSize: typography.fontSize.sm,
  },
  statValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  actionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 2,
  },
  actionDesc: {
    fontSize: typography.fontSize.xs,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    marginVertical: spacing.sm,
  },
});
