/**
 * AccountsScreen.tsx
 * Faithful adaptation of the "Cards" screen from the Figma kit.
 * Displays horizontal swipeable account cards (CBE, Telebirr, Awash, Cash),
 * account metrics, and account-specific transaction ledger.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, ArrowDownLeft, ArrowUpRight, SlidersHorizontal, Eye, EyeOff } from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { AccountCard } from '../components/AccountCard';
import { VaultCard } from '../components/VaultCard';
import { TransactionTile } from '../components/TransactionTile';
import { dbService } from '../database/DatabaseService';
import { Account, Transaction } from '../types/database';
import { useBalanceVisibility } from '../context/BalanceVisibilityContext';
import { GuidedTourOverlay, TourStep } from '../components/GuidedTourOverlay';

const ACCOUNTS_TOUR_STEPS: TourStep[] = [
  {
    title: 'Accounts & Wallets Hub',
    description: 'Manage your commercial banks (CBE, Awash), mobile wallets (Telebirr), and physical cash in one place.',
    badge: 'Accounts',
  },
  {
    title: 'Add & Reconcile Balances',
    description: 'Tap "+" at the top right to configure custom accounts or opening balances. Use the Reconcile tool to adjust for manual discrepancies anytime.',
    badge: 'Reconciliation',
  },
];

const { width } = Dimensions.get('window');

interface AccountsScreenProps {
  navigation: any;
  isDark?: boolean;
}

export const AccountsScreen: React.FC<AccountsScreenProps> = ({ navigation, isDark = true }) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;
  const { isBalanceHidden, toggleBalanceVisibility } = useBalanceVisibility();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [accountTransactions, setAccountTransactions] = useState<Transaction[]>([]);

  const loadAccounts = async () => {
    try {
      const accs = await dbService.getAccounts();
      setAccounts(accs);

      if (accs.length > 0) {
        const activeAcc = accs[activeIndex] || accs[0];
        const txs = await dbService.getTransactions({ accountId: activeAcc.id, limit: 10 });
        setAccountTransactions(txs);
      }
    } catch (err) {
      console.error('Error loading accounts:', err);
    }
  };

  useEffect(() => {
    loadAccounts();
    const unsubscribe = navigation.addListener?.('focus', loadAccounts);
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [activeIndex, navigation]);

  const activeAccount = accounts[activeIndex] || accounts[0];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.headerTitle, { color: theme.textPrimary, marginRight: 10 }]}>Accounts & Wallets</Text>
            <TouchableOpacity
              onPress={toggleBalanceVisibility}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel={isBalanceHidden ? 'Reveal balances' : 'Hide balances'}
            >
              {isBalanceHidden ? (
                <Eye size={20} color={theme.textMuted} />
              ) : (
                <EyeOff size={20} color={theme.textMuted} />
              )}
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: theme.surfaceHighlight, borderColor: theme.surfaceBorder }]}
            onPress={() => navigation.navigate('ManageAccounts')}
          >
            <Plus size={20} color={theme.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Horizontal Swipeable Cards Carousel */}
        {accounts.length > 0 ? (
          <>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carouselContainer}
              onMomentumScrollEnd={(e) => {
                const newIndex = Math.round(e.nativeEvent.contentOffset.x / (width - layout.screenPaddingHorizontal * 2));
                if (newIndex >= 0 && newIndex < accounts.length) {
                  setActiveIndex(newIndex);
                }
              }}
            >
              {accounts.map((acc) => (
                <View key={acc.id} style={styles.carouselItem}>
                  <AccountCard account={acc} isDark={isDark} />
                </View>
              ))}
            </ScrollView>

            {/* Carousel Pagination Dots */}
            <View style={styles.paginationRow}>
              {accounts.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.paginationDot,
                    {
                      backgroundColor: i === activeIndex ? theme.primary : theme.surfaceBorder,
                      width: i === activeIndex ? 20 : 6,
                    },
                  ]}
                />
              ))}
            </View>
          </>
        ) : (
          /* Empty Accounts State */
          <VaultCard isDark={isDark} style={styles.emptyAccountsCard} variant="highlight">
            <View style={styles.emptyAccountsContent}>
              <View style={[styles.emptyAccountsIconCircle, { backgroundColor: theme.primaryGlow }]}>
                <Plus size={28} color={theme.primary} />
              </View>
              <Text style={[styles.emptyAccountsTitle, { color: theme.textPrimary }]}>
                No Accounts Added Yet
              </Text>
              <Text style={[styles.emptyAccountsSubtitle, { color: theme.textSecondary }]}>
                Add your Ethiopian bank or mobile wallet account (CBE, Telebirr, Awash, or Cash) to begin tracking your balances and cash flow.
              </Text>
              <TouchableOpacity
                style={[styles.emptyAddButton, { backgroundColor: theme.primary }]}
                onPress={() => navigation.navigate('ManageAccounts')}
              >
                <Plus size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.emptyAddButtonText}>Add Your First Account</Text>
              </TouchableOpacity>
            </View>
          </VaultCard>
        )}

        {/* Active Account Quick Metrics */}
        {activeAccount && (
          <View style={styles.metricsRow}>
            <VaultCard isDark={isDark} style={styles.metricCard}>
              <View style={[styles.metricIconCircle, { backgroundColor: theme.incomeBackground }]}>
                <ArrowDownLeft size={16} color={theme.income} />
              </View>
              <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Account Inflow</Text>
              <Text style={[styles.metricValue, { color: theme.textPrimary }]}>+ 0.00 ETB</Text>
            </VaultCard>

            <VaultCard isDark={isDark} style={styles.metricCard}>
              <View style={[styles.metricIconCircle, { backgroundColor: theme.expenseBackground }]}>
                <ArrowUpRight size={16} color={theme.textPrimary} />
              </View>
              <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Account Outflow</Text>
              <Text style={[styles.metricValue, { color: theme.textPrimary }]}>- 0.00 ETB</Text>
            </VaultCard>
          </View>
        )}

        {/* Account Activity Section */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
            {activeAccount?.name || 'Account'} Activity
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Reconcile', { accountId: activeAccount?.id })}>
            <View style={[styles.reconcilePill, { backgroundColor: theme.surfaceHighlight }]}>
              <SlidersHorizontal size={14} color={theme.primary} />
              <Text style={[styles.reconcileText, { color: theme.primary }]}>Reconcile</Text>
            </View>
          </TouchableOpacity>
        </View>

        <VaultCard isDark={isDark} style={styles.ledgerCard}>
          {accountTransactions.length > 0 ? (
            accountTransactions.map((tx) => (
              <TransactionTile
                key={tx.id}
                transaction={tx}
                onPress={() => navigation.navigate('TransactionDetail', { transaction: tx, id: tx.id })}
                isDark={isDark}
              />
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                No transactions recorded for this account.
              </Text>
            </View>
          )}
        </VaultCard>
      </ScrollView>

      {/* First-Use Guided Tour */}
      <GuidedTourOverlay tourKey="accounts" steps={ACCOUNTS_TOUR_STEPS} isDark={isDark} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPaddingHorizontal,
    paddingBottom: spacing['4xl'],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselContainer: {
    paddingVertical: spacing.sm,
  },
  carouselItem: {
    width: width - layout.screenPaddingHorizontal * 2,
    marginRight: spacing.md,
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: spacing.md,
    gap: 6,
  },
  paginationDot: {
    height: 6,
    borderRadius: 3,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  metricCard: {
    flex: 1,
    padding: spacing.md,
  },
  metricIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  metricLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  metricValue: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  reconcilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.pill,
    gap: 4,
  },
  reconcileText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  ledgerCard: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
  },
  emptyContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
  },
  emptyAccountsCard: {
    marginBottom: spacing.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyAccountsContent: {
    alignItems: 'center',
    width: '100%',
  },
  emptyAccountsIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyAccountsTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  emptyAccountsSubtitle: {
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  emptyAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
  },
  emptyAddButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
});
