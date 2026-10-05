/**
 * InboxScreen.tsx
 * Ingestion review queue and notification inbox.
 * - Displays pending transactions needing user confirmation (e.g. from SMS, receipts)
 * - Preserves complete source audit trail
 * - Actions: Confirm, Edit & Inspect, Ignore
 * - Shows confidence score & raw snippet
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Edit3,
  ShieldCheck,
  AlertCircle,
  Inbox,
  RefreshCw,
} from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { ProviderLogo } from '../components/ProviderLogo';
import { Transaction } from '../types/database';
import { dbService } from '../database/DatabaseService';
import { useBalanceVisibility } from '../context/BalanceVisibilityContext';
import { ingestionPipeline } from '../ingestion/IngestionPipeline';

interface InboxScreenProps {
  navigation: any;
  isDark?: boolean;
}

export const InboxScreen: React.FC<InboxScreenProps> = ({
  navigation,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;
  const { formatAmount } = useBalanceVisibility();
  const [pendingTransactions, setPendingTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPending = async () => {
    try {
      setLoading(true);
      const items = await dbService.getTransactions({ status: 'PENDING_REVIEW', limit: 50 });
      setPendingTransactions(items);
    } catch (err) {
      console.error('Error loading pending transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPending();
    const unsubscribeFocus = navigation.addListener?.('focus', loadPending);
    const unsubscribeIngestion = ingestionPipeline.subscribe(() => {
      loadPending();
    });

    return () => {
      if (typeof unsubscribeFocus === 'function') unsubscribeFocus();
      unsubscribeIngestion();
    };
  }, [navigation]);

  const handleConfirm = async (tx: Transaction) => {
    try {
      await dbService.confirmTransaction(tx.id);
      setPendingTransactions((prev) => prev.filter((item) => item.id !== tx.id));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to confirm transaction.');
    }
  };

  const handleIgnore = async (tx: Transaction) => {
    try {
      await dbService.ignoreTransaction(tx.id);
      setPendingTransactions((prev) => prev.filter((item) => item.id !== tx.id));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to dismiss transaction.');
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Inbox & Review Queue</Text>
          {pendingTransactions.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: theme.primary }]}>
              <Text style={styles.countBadgeText}>{pendingTransactions.length}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={loadPending}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <RefreshCw size={18} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : pendingTransactions.length === 0 ? (
        /* Empty State */
        <View style={styles.centerContainer}>
          <View style={[styles.emptyIconCircle, { backgroundColor: theme.incomeBackground }]}>
            <CheckCircle2 size={44} color={theme.income} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>All Caught Up!</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            No pending transactions waiting for review. When new bank notifications, SMS, or receipts are detected, they will appear here for your verification.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.noticeText, { color: theme.textSecondary }]}>
            Verify and confirm detected transactions below to update your ledger.
          </Text>

          {pendingTransactions.map((tx) => {
            const isIncome = tx.type === 'INCOME';
            const amountPrefix = isIncome ? '+' : '-';
            const amountColor = isIncome ? theme.income : theme.expense;
            const confidencePercent = tx.confidenceScore
              ? Math.round(tx.confidenceScore * 100)
              : 85;

            return (
              <VaultCard key={tx.id} isDark={isDark} style={styles.txCard}>
                {/* Provider and Confidence Row */}
                <View style={styles.cardTopRow}>
                  <View style={styles.providerRow}>
                    <ProviderLogo providerKey={tx.accountName || 'CBE'} size={24} />
                    <Text style={[styles.accountLabel, { color: theme.textSecondary }]}>
                      {tx.accountName || 'Primary Account'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.confidencePill,
                      {
                        backgroundColor:
                          confidencePercent >= 90
                            ? theme.incomeBackground
                            : theme.warningBackground,
                      },
                    ]}
                  >
                    <ShieldCheck
                      size={12}
                      color={confidencePercent >= 90 ? theme.income : theme.warning}
                    />
                    <Text
                      style={[
                        styles.confidenceText,
                        {
                          color:
                            confidencePercent >= 90 ? theme.income : theme.warning,
                        },
                      ]}
                    >
                      {confidencePercent}% Match
                    </Text>
                  </View>
                </View>

                {/* Merchant and Amount Row */}
                <View style={styles.merchantAmountRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.merchantName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {tx.cleanMerchant || tx.merchantName}
                    </Text>
                    <Text style={[styles.categorySubtitle, { color: theme.textSecondary }]}>
                      {tx.categoryName || 'Uncategorized'} • {new Date(tx.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                  <Text style={[styles.amountText, { color: amountColor }]}>
                    {amountPrefix} {formatAmount(tx.amount)}
                  </Text>
                </View>

                {/* Raw Snippet Box */}
                {tx.rawSourceMessage && (
                  <View
                    style={[
                      styles.rawBox,
                      {
                        backgroundColor: theme.surfaceHighlight,
                        borderColor: theme.surfaceBorder,
                      },
                    ]}
                  >
                    <Text style={[styles.rawLabel, { color: theme.textMuted }]}>
                      RAW DETECTED PAYLOAD:
                    </Text>
                    <Text
                      style={[styles.rawText, { color: theme.textSecondary }]}
                      numberOfLines={2}
                    >
                      {tx.rawSourceMessage}
                    </Text>
                  </View>
                )}

                {/* Action Buttons */}
                <View style={[styles.actionsRow, { borderTopColor: theme.surfaceBorder }]}>
                  <TouchableOpacity
                    style={[styles.ignoreBtn, { borderColor: theme.surfaceBorder }]}
                    onPress={() => handleIgnore(tx)}
                  >
                    <XCircle size={15} color={theme.textMuted} />
                    <Text style={[styles.ignoreBtnText, { color: theme.textMuted }]}>Ignore</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.editBtn, { borderColor: theme.surfaceBorder }]}
                    onPress={() =>
                      navigation.navigate('TransactionDetail', {
                        transaction: tx,
                        id: tx.id,
                      })
                    }
                  >
                    <Edit3 size={15} color={theme.textPrimary} />
                    <Text style={[styles.editBtnText, { color: theme.textPrimary }]}>Details</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.confirmBtn, { backgroundColor: theme.primary }]}
                    onPress={() => handleConfirm(tx)}
                  >
                    <CheckCircle2 size={15} color="#FFFFFF" />
                    <Text style={styles.confirmBtnText}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </VaultCard>
            );
          })}
        </ScrollView>
      )}
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
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.pill,
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  refreshButton: {
    padding: spacing.xs,
  },
  scrollContent: {
    padding: layout.screenPaddingHorizontal,
    paddingBottom: 40,
  },
  noticeText: {
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  txCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accountLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  confidencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.pill,
    gap: 4,
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  merchantAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: spacing.xs,
  },
  merchantName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  categorySubtitle: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  amountText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  rawBox: {
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    padding: spacing.xs,
    marginVertical: spacing.xs,
  },
  rawLabel: {
    fontSize: 9,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  rawText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.mono,
    lineHeight: 15,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    paddingTop: spacing.xs,
    marginTop: spacing.xs,
    gap: 8,
  },
  ignoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  ignoreBtnText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  editBtnText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});
