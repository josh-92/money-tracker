/**
 * HomeScreen.tsx
 * Faithful reproduction of the BankPick / Moneet Dark & Light Home Dashboard.
 * Displays Net Worth, quick action buttons, budget bar, contextual insights,
 * and recent ledger transactions.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Plus,
  SlidersHorizontal,
  ArrowRightLeft,
  Target,
  Search,
  Bell,
  TrendingUp,
  AlertTriangle,
  Eye,
  EyeOff,
  ShieldAlert,
} from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { ActionButton } from '../components/ActionButton';
import { TransactionTile } from '../components/TransactionTile';
import { dbService } from '../database/DatabaseService';
import { Transaction, VaultProfile } from '../types/database';
import { useBalanceVisibility } from '../context/BalanceVisibilityContext';
import { ingestionPipeline } from '../ingestion/IngestionPipeline';
import { GuidedTourOverlay, TourStep } from '../components/GuidedTourOverlay';

const HOME_TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to Your Private Vault',
    description: 'Money Tracker runs 100% locally on your phone. Your balances and transaction history are stored in an encrypted offline vault.',
    badge: 'Privacy First',
  },
  {
    title: 'Total Net Worth & Balance Visibility',
    description: 'Your combined balance across all active accounts is calculated here. Tap the eye icon anytime to hide or reveal your sensitive figures.',
    badge: 'Balance Control',
  },
  {
    title: 'Instant Capture & Review Inbox',
    description: 'Use the quick action buttons to log cash, scan paper receipts, or transfer funds. The top notification bell flags new SMS or bank notifications waiting for your review.',
    badge: 'Smart Tracking',
  },
];

interface HomeScreenProps {
  navigation: any;
  isDark?: boolean;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation, isDark = true }) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;
  const { isBalanceHidden, toggleBalanceVisibility } = useBalanceVisibility();

  const [netWorth, setNetWorth] = useState(0);
  const [profile, setProfile] = useState<VaultProfile | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [unconfirmedCount, setUnconfirmedCount] = useState(0);
  const [monthlyMetrics, setMonthlyMetrics] = useState<{
    totalExpense: number;
    topCategories: Array<{ name: string; amount: number; percentage: number }>;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Request sequence counter to discard stale snapshots from out-of-order queries
  const loadSeqRef = useRef(0);

  const loadData = async () => {
    const seq = ++loadSeqRef.current;
    try {
      const p = await dbService.getVaultProfile();
      const nw = await dbService.getTotalNetWorth();
      const txs = await dbService.getTransactions({ limit: 5 });
      const pending = await dbService.getTransactions({ status: 'PENDING_REVIEW' });
      const now = new Date();
      const metrics = await dbService.getMonthlyMetrics(now.getMonth() + 1, now.getFullYear());

      // If a newer loadData call has started, discard this older query result
      if (seq !== loadSeqRef.current) {
        return;
      }

      setProfile(p);
      setNetWorth(nw.total);
      setRecentTransactions(txs);
      setUnconfirmedCount(pending.length);
      setMonthlyMetrics(metrics);
    } catch (err) {
      console.error('Error loading home data:', err);
    }
  };

  useEffect(() => {
    loadData();
    const unsubscribeFocus = navigation.addListener?.('focus', loadData);
    const unsubscribeIngestion = ingestionPipeline.subscribe(() => {
      loadData();
    });

    return () => {
      if (typeof unsubscribeFocus === 'function') unsubscribeFocus();
      unsubscribeIngestion();
    };
  }, [navigation]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.profileSection}>
            <View style={[styles.avatarBadge, { backgroundColor: theme.primaryGlow, borderColor: theme.primary }]}>
              <Text style={[styles.avatarInitial, { color: theme.primary }]}>
                {profile?.fullName ? profile.fullName.charAt(0).toUpperCase() : 'U'}
              </Text>
            </View>
            <View style={styles.greetingContainer}>
              <Text style={[styles.greetingLabel, { color: theme.textSecondary }]}>Welcome back,</Text>
              <Text style={[styles.profileName, { color: theme.textPrimary }]} numberOfLines={1}>
                {profile?.fullName || 'Private Vault'}
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: theme.surfaceHighlight, borderColor: theme.surfaceBorder }]}
              onPress={() => navigation.navigate('Inbox')}
            >
              <Bell size={20} color={theme.textPrimary} />
              {unconfirmedCount > 0 && (
                <View style={[styles.badgeIndicator, { backgroundColor: theme.primary }]}>
                  <Text style={styles.badgeText}>{unconfirmedCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: theme.surfaceHighlight, borderColor: theme.surfaceBorder }]}
              onPress={() => navigation.navigate('Search', { autoFocusSearch: true })}
            >
              <Search size={20} color={theme.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Passcode Security Reminder Banner (if user skipped passcode during onboarding) */}
        {profile && !profile.passcodeHash && (
          <VaultCard isDark={isDark} style={styles.securityWarningCard} variant="highlight">
            <View style={styles.securityWarningRow}>
              <View style={[styles.warningIconCircle, { backgroundColor: '#F59E0B20' }]}>
                <ShieldAlert size={22} color="#F59E0B" />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={[styles.securityWarningTitle, { color: theme.textPrimary }]}>
                  Vault Security Reminder
                </Text>
                <Text style={[styles.securityWarningBody, { color: theme.textSecondary }]}>
                  Your private ledger does not require a passcode. Set a 4-digit PIN to secure your financial records.
                </Text>
                <TouchableOpacity
                  style={styles.setPinButton}
                  onPress={() => navigation.navigate('AccountSecurity')}
                >
                  <Text style={[styles.setPinButtonText, { color: theme.primary }]}>
                    Set 4-Digit Passcode →
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </VaultCard>
        )}

        {/* Hero Total Balance / Net Worth Card */}
        <VaultCard isDark={isDark} style={styles.netWorthCard}>
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.cardLabel, { color: theme.textSecondary, marginRight: 8 }]}>Total Net Worth</Text>
              <TouchableOpacity
                onPress={toggleBalanceVisibility}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel={isBalanceHidden ? 'Reveal balance' : 'Hide balance'}
              >
                {isBalanceHidden ? (
                  <Eye size={18} color={theme.textMuted} />
                ) : (
                  <EyeOff size={18} color={theme.textMuted} />
                )}
              </TouchableOpacity>
            </View>
            <View style={[styles.trendPill, { backgroundColor: theme.incomeBackground }]}>
              <TrendingUp size={14} color={theme.income} />
              <Text style={[styles.trendText, { color: theme.income }]}>+4.8%</Text>
            </View>
          </View>

          <Text style={[styles.heroAmount, { color: theme.textPrimary }]}>
            {isBalanceHidden ? (
              '•••••••• '
            ) : (
              `${netWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} `
            )}
            <Text style={[styles.heroCurrency, { color: theme.primary }]}>ETB</Text>
          </Text>

          <View style={[styles.cardFooter, { borderTopColor: theme.surfaceBorder }]}>
            <Text style={[styles.cardFooterText, { color: theme.textSecondary }]}>
              Across your active accounts
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Accounts')}>
              <Text style={[styles.viewDetailsText, { color: theme.primary }]}>View Accounts →</Text>
            </TouchableOpacity>
          </View>
        </VaultCard>

        {/* Quick Actions Row */}
        <View style={styles.actionsRow}>
          <ActionButton
            icon={<Plus size={22} color={theme.textPrimary} />}
            label="Add Cash"
            onPress={() => navigation.navigate('AddTransaction')}
            isDark={isDark}
          />
          <ActionButton
            icon={<SlidersHorizontal size={22} color={theme.primary} />}
            label="Reconcile"
            onPress={() => navigation.navigate('Reconcile')}
            isDark={isDark}
          />
          <ActionButton
            icon={<ArrowRightLeft size={22} color={theme.transfer} />}
            label="Transfer"
            onPress={() => navigation.navigate('Transfer')}
            isDark={isDark}
          />
          <ActionButton
            icon={<Target size={22} color={theme.warning} />}
            label="Goals"
            onPress={() => navigation.navigate('Goals')}
            isDark={isDark}
          />
        </View>

        {/* Contextual Spending Insight */}
        {monthlyMetrics && monthlyMetrics.totalExpense > 0 && monthlyMetrics.topCategories.length > 0 ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Budgets')}
          >
            <VaultCard isDark={isDark} style={styles.insightCard} variant="highlight">
              <View style={styles.insightRow}>
                <View style={[styles.insightIconCircle, { backgroundColor: theme.warningBackground }]}>
                  <AlertTriangle size={18} color={theme.warning} />
                </View>
                <View style={styles.insightTextContainer}>
                  <Text style={[styles.insightTitle, { color: theme.textPrimary }]}>
                    {new Date().toLocaleString('en-US', { month: 'long' })} Spending Update
                  </Text>
                  <Text style={[styles.insightBody, { color: theme.textSecondary }]}>
                    {monthlyMetrics.topCategories[0].name} is your largest category ({monthlyMetrics.topCategories[0].amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB). Total monthly spend: {monthlyMetrics.totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB. Tap to view budgets →
                  </Text>
                </View>
              </View>
            </VaultCard>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Budgets')}
          >
            <VaultCard isDark={isDark} style={styles.insightCard} variant="highlight">
              <View style={styles.insightRow}>
                <View style={[styles.insightIconCircle, { backgroundColor: theme.incomeBackground }]}>
                  <TrendingUp size={18} color={theme.income} />
                </View>
                <View style={styles.insightTextContainer}>
                  <Text style={[styles.insightTitle, { color: theme.textPrimary }]}>
                    {new Date().toLocaleString('en-US', { month: 'long' })} Spending Update
                  </Text>
                  <Text style={[styles.insightBody, { color: theme.textSecondary }]}>
                    No expense transactions recorded this month. Your budget is intact. Tap to manage budgets →
                  </Text>
                </View>
              </View>
            </VaultCard>
          </TouchableOpacity>
        )}

        {/* Recent Transactions Section */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Recent Activity</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Transactions')}>
            <Text style={[styles.seeAllText, { color: theme.primary }]}>See All</Text>
          </TouchableOpacity>
        </View>

        <VaultCard isDark={isDark} style={styles.transactionCard}>
          {recentTransactions.length > 0 ? (
            recentTransactions.map((tx) => (
              <TransactionTile
                key={tx.id}
                transaction={tx}
                onPress={() => navigation.navigate('TransactionDetail', { transaction: tx, id: tx.id })}
                isDark={isDark}
              />
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>No transactions recorded yet.</Text>
              <TouchableOpacity
                style={[styles.emptyButton, { backgroundColor: theme.primary }]}
                onPress={() => navigation.navigate('AddTransaction')}
              >
                <Text style={styles.emptyButtonText}>Add First Expense</Text>
              </TouchableOpacity>
            </View>
          )}
        </VaultCard>
      </ScrollView>

      {/* First-Use Guided Tour */}
      <GuidedTourOverlay tourKey="home" steps={HOME_TOUR_STEPS} isDark={isDark} />
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
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarInitial: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  greetingContainer: {
    justifyContent: 'center',
  },
  greetingLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  profileName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badgeIndicator: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: typography.fontWeight.bold,
  },
  netWorthCard: {
    marginTop: spacing.md,
    padding: spacing.xl,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  trendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.pill,
    gap: 4,
  },
  trendText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  heroAmount: {
    fontSize: typography.fontSize.currencyHero,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: typography.letterSpacing.tight,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  heroCurrency: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  cardFooterText: {
    fontSize: typography.fontSize.xs,
  },
  viewDetailsText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginVertical: spacing.xl,
  },
  insightCard: {
    marginBottom: spacing.xl,
    padding: spacing.md,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  insightIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  insightTextContainer: {
    flex: 1,
  },
  insightTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 2,
  },
  insightBody: {
    fontSize: typography.fontSize.xs,
    lineHeight: 18,
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
  seeAllText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  transactionCard: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.base,
  },
  emptyContainer: {
    paddingVertical: spacing['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.md,
  },
  emptyButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.pill,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  securityWarningCard: {
    marginBottom: spacing.md,
    borderColor: '#F59E0B',
    padding: spacing.md,
  },
  securityWarningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  warningIconCircle: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityWarningTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  securityWarningBody: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
    lineHeight: 18,
  },
  setPinButton: {
    marginTop: spacing.xs,
  },
  setPinButtonText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
});
