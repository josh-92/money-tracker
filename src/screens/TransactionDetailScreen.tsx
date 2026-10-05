/**
 * TransactionDetailScreen.tsx
 * Comprehensive transaction inspector with 3-stage audit trail representation.
 * - Primary Clean View: Merchant, Amount, Category, Account, Date
 * - Expandable "More Details & Audit Trail" section for technical/source metadata
 * - Displays Raw Source Message, Provider Refs, Counterparties, Balance-After,
 *   Parser Version, Confidence Score, and User Edit History.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Calendar,
  Wallet,
  Tag,
  ChevronDown,
  ChevronUp,
  FileText,
  Hash,
  User,
  ShieldCheck,
  Cpu,
  History,
  Info,
} from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { Transaction } from '../types/database';
import { useBalanceVisibility } from '../context/BalanceVisibilityContext';
import { dbService } from '../database/DatabaseService';
import { ProviderLogo } from '../components/ProviderLogo';
import { ActivityIndicator } from 'react-native';

interface TransactionDetailScreenProps {
  route: {
    params?: {
      transaction?: Transaction;
      id?: string;
    };
  };
  navigation: any;
  isDark?: boolean;
}

export const TransactionDetailScreen: React.FC<TransactionDetailScreenProps> = ({
  route,
  navigation,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;
  const [transaction, setTransaction] = useState<Transaction | null>(
    route.params?.transaction || null
  );
  const { formatAmount } = useBalanceVisibility();
  const [showMoreDetails, setShowMoreDetails] = useState(false);

  useEffect(() => {
    if (!transaction && route.params?.id) {
      dbService.getTransactionById(route.params.id).then(setTransaction);
    }
  }, [route.params]);

  if (!transaction) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  const isExpense = transaction.type === 'EXPENSE';
  const isIncome = transaction.type === 'INCOME';
  const isTransfer = transaction.type === 'TRANSFER';

  const amountColor = isIncome
    ? theme.income
    : isExpense
    ? theme.expense
    : theme.primary;

  const amountPrefix = isIncome ? '+' : isExpense ? '-' : '';

  const formattedDate = new Date(transaction.timestamp).toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const formattedTime = new Date(transaction.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Transaction Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Primary Hero Card */}
        <VaultCard isDark={isDark} style={styles.heroCard}>
          <Text style={[styles.merchantTitle, { color: theme.textPrimary }]}>
            {transaction.cleanMerchant || transaction.merchantName}
          </Text>

          <Text style={[styles.heroAmount, { color: amountColor }]}>
            {amountPrefix}{formatAmount(transaction.amount)}
          </Text>

          <View style={styles.badgeRow}>
            <View style={[styles.typeBadge, { backgroundColor: amountColor + '20' }]}>
              <Text style={[styles.typeBadgeText, { color: amountColor }]}>{transaction.type}</Text>
            </View>

            <View style={[styles.statusBadge, { backgroundColor: theme.surfaceHighlight }]}>
              <Text style={[styles.statusBadgeText, { color: theme.textSecondary }]}>{transaction.status}</Text>
            </View>
          </View>
        </VaultCard>

        {/* Primary Transaction Attributes */}
        <VaultCard isDark={isDark} style={styles.card}>
          <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
              <Wallet size={16} color={theme.primary} />
              <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Account</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ProviderLogo providerKey={transaction.accountName || 'CBE'} size={18} containerBackground={false} />
              <Text style={[styles.detailValue, { color: theme.textPrimary }]}>
                {transaction.accountName || 'Primary Account'}
              </Text>
            </View>
          </View>

          <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: theme.surfaceBorder, paddingTop: spacing.xs }]}>
            <View style={styles.detailLeft}>
              <Tag size={16} color={theme.income} />
              <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Category</Text>
            </View>
            <Text style={[styles.detailValue, { color: theme.textPrimary }]}>
              {transaction.categoryName || 'Uncategorized'}
            </Text>
          </View>

          <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: theme.surfaceBorder, paddingTop: spacing.xs }]}>
            <View style={styles.detailLeft}>
              <Calendar size={16} color={theme.warning} />
              <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Date & Time</Text>
            </View>
            <Text style={[styles.detailValue, { color: theme.textPrimary }]}>
              {formattedDate} • {formattedTime}
            </Text>
          </View>

          {transaction.notes && (
            <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: theme.surfaceBorder, paddingTop: spacing.xs }]}>
              <View style={styles.detailLeft}>
                <Info size={16} color={theme.textMuted} />
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Notes</Text>
              </View>
              <Text style={[styles.detailValue, { color: theme.textPrimary, flex: 1, textAlign: 'right' }]}>
                {transaction.notes}
              </Text>
            </View>
          )}
        </VaultCard>

        {/* Expandable Technical / Audit Details Button */}
        <TouchableOpacity
          style={[styles.expandToggle, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}
          onPress={() => setShowMoreDetails((prev) => !prev)}
        >
          <View style={styles.expandLeft}>
            <ShieldCheck size={18} color={theme.primary} style={{ marginRight: spacing.xs }} />
            <Text style={[styles.expandTitle, { color: theme.textPrimary }]}>
              Source Metadata & Audit Trail
            </Text>
          </View>
          {showMoreDetails ? (
            <ChevronUp size={18} color={theme.textSecondary} />
          ) : (
            <ChevronDown size={18} color={theme.textSecondary} />
          )}
        </TouchableOpacity>

        {/* Expandable Section */}
        {showMoreDetails && (
          <View style={styles.auditSection}>
            {/* Raw Source Message */}
            {transaction.rawSourceMessage && (
              <VaultCard isDark={isDark} style={styles.card}>
                <View style={styles.rawHeader}>
                  <FileText size={16} color={theme.primary} />
                  <Text style={[styles.subSectionTitle, { color: theme.textPrimary }]}>
                    Original Untouched Bank Notification
                  </Text>
                </View>
                <View style={[styles.rawBox, { backgroundColor: theme.surfaceHighlight, borderColor: theme.surfaceBorder }]}>
                  <Text style={[styles.rawText, { color: theme.textSecondary }]}>
                    {transaction.rawSourceMessage}
                  </Text>
                </View>
              </VaultCard>
            )}

            {/* Provider & Technical Identifiers */}
            <VaultCard isDark={isDark} style={styles.card}>
              <Text style={[styles.subSectionTitle, { color: theme.textPrimary }]}>Technical Identifiers</Text>

              {transaction.refNumber && (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Provider Reference</Text>
                  <Text style={[styles.monoValue, { color: theme.textPrimary }]}>{transaction.refNumber}</Text>
                </View>
              )}

              {transaction.transactionNumber && (
                <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: theme.surfaceBorder, paddingTop: spacing.xs }]}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Transaction Number</Text>
                  <Text style={[styles.monoValue, { color: theme.textPrimary }]}>{transaction.transactionNumber}</Text>
                </View>
              )}

              {transaction.balanceAfterTransaction !== null && transaction.balanceAfterTransaction !== undefined && (
                <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: theme.surfaceBorder, paddingTop: spacing.xs }]}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Balance After Txn</Text>
                  <Text style={[styles.detailValue, { color: theme.income, fontWeight: 'bold' }]}>
                    {formatAmount(transaction.balanceAfterTransaction)}
                  </Text>
                </View>
              )}

              {transaction.sender && (
                <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: theme.surfaceBorder, paddingTop: spacing.xs }]}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Counterparty Sender</Text>
                  <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{transaction.sender}</Text>
                </View>
              )}

              {transaction.recipient && (
                <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: theme.surfaceBorder, paddingTop: spacing.xs }]}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Counterparty Recipient</Text>
                  <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{transaction.recipient}</Text>
                </View>
              )}

              <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: theme.surfaceBorder, paddingTop: spacing.xs }]}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Ingestion Source</Text>
                <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{transaction.source}</Text>
              </View>

              {transaction.parserVersion && (
                <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: theme.surfaceBorder, paddingTop: spacing.xs }]}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Parser Version</Text>
                  <Text style={[styles.detailValue, { color: theme.textSecondary }]}>{transaction.parserVersion}</Text>
                </View>
              )}

              {transaction.confidenceScore !== null && transaction.confidenceScore !== undefined && (
                <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: theme.surfaceBorder, paddingTop: spacing.xs }]}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Extraction Confidence</Text>
                  <Text style={[styles.detailValue, { color: theme.primary, fontWeight: 'bold' }]}>
                    {Math.round(transaction.confidenceScore * 100)}%
                  </Text>
                </View>
              )}
            </VaultCard>

            {/* 3-Stage Audit Trail */}
            <VaultCard isDark={isDark} style={styles.card}>
              <View style={styles.rawHeader}>
                <History size={16} color={theme.primary} />
                <Text style={[styles.subSectionTitle, { color: theme.textPrimary }]}>Audit Trail History</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Original Parsed Amount</Text>
                <Text style={[styles.detailValue, { color: theme.textPrimary }]}>
                  {transaction.originalAmount !== null && transaction.originalAmount !== undefined
                    ? formatAmount(transaction.originalAmount)
                    : formatAmount(transaction.amount)}
                </Text>
              </View>

              <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: theme.surfaceBorder, paddingTop: spacing.xs }]}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Original Parsed Merchant</Text>
                <Text style={[styles.detailValue, { color: theme.textPrimary }]}>
                  {transaction.originalMerchantName || transaction.merchantName}
                </Text>
              </View>

              {transaction.userEditedAt && (
                <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: theme.surfaceBorder, paddingTop: spacing.xs }]}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>User Last Modified</Text>
                  <Text style={[styles.detailValue, { color: theme.warning }]}>
                    {new Date(transaction.userEditedAt).toLocaleString()}
                  </Text>
                </View>
              )}

              <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: theme.surfaceBorder, paddingTop: spacing.xs }]}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Created In Ledger</Text>
                <Text style={[styles.detailValue, { color: theme.textMuted }]}>
                  {new Date(transaction.createdAt).toLocaleString()}
                </Text>
              </View>
            </VaultCard>
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
  heroCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  merchantTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
  },
  heroAmount: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    marginVertical: spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: 4,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: borderRadius.pill,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: typography.fontWeight.bold,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: borderRadius.pill,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
  },
  card: {
    gap: spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  detailLabel: {
    fontSize: typography.fontSize.xs,
  },
  detailValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  monoValue: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  expandToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginVertical: 4,
  },
  expandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expandTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  auditSection: {
    gap: spacing.sm,
  },
  rawHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 4,
  },
  subSectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  rawBox: {
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  rawText: {
    fontSize: 11,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});
