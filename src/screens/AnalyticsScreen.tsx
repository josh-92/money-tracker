/**
 * AnalyticsScreen.tsx
 * Visual financial cockpit and statistical synthesis.
 * Displays local arithmetic totals, category breakdowns, spending by account,
 * top merchants, monthly budgets summary, and dynamic visual insight cards
 * powered by local-first analysis and Google Gemini AI.
 */

import React, { useState, useEffect, useCallback } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import {
  Sparkles,
  TrendingDown,
  TrendingUp,
  Calendar,
  RefreshCw,
  Eye,
  EyeOff,
  Wallet,
  PieChart,
  Copy,
  Check,
  Activity,
  Layers,
} from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { dbService } from '../database/DatabaseService';
import {
  aiService,
  VisualFinancialSummaryResult,
} from '../ai/AiService';
import { BudgetWithSpent } from '../types/database';
import { useBalanceVisibility } from '../context/BalanceVisibilityContext';
import { ingestionPipeline } from '../ingestion/IngestionPipeline';
import { GuidedTourOverlay, TourStep } from '../components/GuidedTourOverlay';

const ANALYTICS_TOUR_STEPS: TourStep[] = [
  {
    title: 'Statistics & Visual Analytics',
    description: 'Explore monthly cash-flow trends, spending distribution by category, and top merchants with 100% offline arithmetic.',
    badge: 'Insights',
  },
  {
    title: 'Financial Cockpit & Gemini Synthesis',
    description: 'Dynamic visual insight cards highlighting spending concentration, spikes, unassigned transactions, and AI-grounded observations.',
    badge: 'Cockpit',
  },
];

interface MonthConfig {
  label: string;
  month: number;
  year: number;
}

const MONTHS_CONFIG: MonthConfig[] = [
  { label: 'Oct', month: 10, year: 2026 },
  { label: 'Nov', month: 11, year: 2026 },
  { label: 'Dec', month: 12, year: 2026 },
  { label: 'Jan', month: 1, year: 2027 },
  { label: 'Feb', month: 2, year: 2027 },
  { label: 'Mar', month: 3, year: 2027 },
];

interface AnalyticsScreenProps {
  navigation?: any;
  isDark?: boolean;
}

export const AnalyticsScreen: React.FC<AnalyticsScreenProps> = ({ navigation, isDark = true }) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;
  const { isBalanceHidden, toggleBalanceVisibility, formatAmount } = useBalanceVisibility();

  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0); // 'Oct'
  const selectedMonth = MONTHS_CONFIG[selectedMonthIndex] || MONTHS_CONFIG[0];

  const [metrics, setMetrics] = useState<{
    totalIncome: number;
    totalExpense: number;
    netSavings: number;
    momExpenseChangePct?: number;
    expenseCount: number;
    incomeCount: number;
    transferCount: number;
    averageExpenseAmount: number;
    topCategories: { name: string; amount: number; percentage: number; color: string }[];
    accountBreakdown: { id: string; name: string; providerKey: string; spentAmount: number; txCount: number }[];
    topMerchants: { merchant: string; amount: number; count: number }[];
  }>({
    totalIncome: 0,
    totalExpense: 0,
    netSavings: 0,
    momExpenseChangePct: undefined,
    expenseCount: 0,
    incomeCount: 0,
    transferCount: 0,
    averageExpenseAmount: 0,
    topCategories: [],
    accountBreakdown: [],
    topMerchants: [],
  });

  const [budgets, setBudgets] = useState<BudgetWithSpent[]>([]);
  const [visualSummary, setVisualSummary] = useState<VisualFinancialSummaryResult | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  const loadData = useCallback(async (forceRefreshAi = false) => {
    try {
      // 1. Fetch factual financial digest and budgets directly from local SQLite
      const [summaryDigest, budgetList] = await Promise.all([
        dbService.getFinancialSummaryDigest(selectedMonth.month, selectedMonth.year),
        dbService.getBudgetsWithSpent(selectedMonth.month, selectedMonth.year),
      ]);

      setMetrics({
        totalIncome: summaryDigest.totalIncome,
        totalExpense: summaryDigest.totalExpense,
        netSavings: summaryDigest.netSavings,
        momExpenseChangePct: summaryDigest.momExpenseChangePct,
        expenseCount: summaryDigest.expenseCount,
        incomeCount: summaryDigest.incomeCount,
        transferCount: summaryDigest.transferCount,
        averageExpenseAmount: summaryDigest.averageExpenseAmount,
        topCategories: summaryDigest.topCategories,
        accountBreakdown: summaryDigest.accountBreakdown,
        topMerchants: summaryDigest.topMerchants,
      });

      setBudgets(budgetList);

      // 2. Load or generate visual summary (checks SQLite cache first)
      const summary = await aiService.generateVisualFinancialSummary(
        summaryDigest,
        forceRefreshAi
      );
      setVisualSummary(summary);
    } catch (err) {
      console.error('[Analytics] Error loading data:', err);
    }
  }, [selectedMonth.month, selectedMonth.year]);

  useFocusEffect(
    useCallback(() => {
      loadData(false);
    }, [loadData])
  );

  useEffect(() => {
    const unsubscribeIngestion = ingestionPipeline.subscribe(() => {
      loadData(false);
    });
    return () => {
      unsubscribeIngestion();
    };
  }, [loadData]);

  const handleRefreshAnalysis = async () => {
    setIsGeneratingAi(true);
    try {
      // 1. Explicitly invalidate SQLite cached report for this month/year
      await dbService.clearMonthlyReportCache(selectedMonth.month, selectedMonth.year);

      // 2. Query fresh financial digest directly from local SQLite
      const freshDigest = await dbService.getFinancialSummaryDigest(
        selectedMonth.month,
        selectedMonth.year
      );

      setMetrics({
        totalIncome: freshDigest.totalIncome,
        totalExpense: freshDigest.totalExpense,
        netSavings: freshDigest.netSavings,
        momExpenseChangePct: freshDigest.momExpenseChangePct,
        expenseCount: freshDigest.expenseCount,
        incomeCount: freshDigest.incomeCount,
        transferCount: freshDigest.transferCount,
        averageExpenseAmount: freshDigest.averageExpenseAmount,
        topCategories: freshDigest.topCategories,
        accountBreakdown: freshDigest.accountBreakdown,
        topMerchants: freshDigest.topMerchants,
      });

      // 3. Force-refresh Gemini synthesis using the fresh digest
      const refreshed = await aiService.generateVisualFinancialSummary(freshDigest, true);
      setVisualSummary(refreshed);
    } catch (err: any) {
      Alert.alert(
        'Analysis Notice',
        err.message || 'Ensure your Gemini API key is configured in Settings.'
      );
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleCopyMonthlyReport = async () => {
    const activeBudgets = budgets.filter((b) => b.hasBudget);
    const reportText = [
      `📊 MONEY TRACKER — MONTHLY FINANCIAL REPORT`,
      `Period: ${selectedMonth.label} ${selectedMonth.year}`,
      `Generated: ${new Date().toLocaleDateString()}`,
      `----------------------------------------`,
      `CASH FLOW:`,
      `• Total Income: +${metrics.totalIncome.toLocaleString()} ETB`,
      `• Total Outflows: -${metrics.totalExpense.toLocaleString()} ETB`,
      `• Net Cash Flow: ${metrics.netSavings >= 0 ? '+' : ''}${metrics.netSavings.toLocaleString()} ETB`,
      metrics.momExpenseChangePct !== undefined
        ? `• MoM Spending Trend: ${metrics.momExpenseChangePct <= 0 ? 'Decreased' : 'Increased'} by ${Math.abs(metrics.momExpenseChangePct)}% vs previous month`
        : '',
      `• Transaction Volume: ${metrics.expenseCount + metrics.incomeCount + metrics.transferCount} total (${metrics.expenseCount} out, ${metrics.incomeCount} in, ${metrics.transferCount} transfers)`,
      `• Average Expense Ticket: ${metrics.averageExpenseAmount.toLocaleString()} ETB`,
      `----------------------------------------`,
      `TOP SPENDING CATEGORIES:`,
      metrics.topCategories.length > 0
        ? metrics.topCategories.map((c) => `• ${c.name}: ${c.amount.toLocaleString()} ETB (${c.percentage}%)`).join('\n')
        : '• No categorized expenses',
      `----------------------------------------`,
      `TOP MERCHANTS:`,
      metrics.topMerchants.length > 0
        ? metrics.topMerchants.map((m, i) => `• #${i + 1} ${m.merchant}: ${m.amount.toLocaleString()} ETB (${m.count} txs)`).join('\n')
        : '• No merchant expenses',
      `----------------------------------------`,
      `BUDGET ADHERENCE:`,
      activeBudgets.length > 0
        ? activeBudgets.map((b) => `• ${b.category.name}: ${b.spentAmount.toLocaleString()} / ${b.monthlyLimit.toLocaleString()} ETB (${b.percentageSpent}% - ${b.status})`).join('\n')
        : '• No monthly budgets set',
      `----------------------------------------`,
      `Local-First & Private — Stored on Device Vault.`,
    ].filter(Boolean).join('\n');

    await Clipboard.setStringAsync(reportText);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2500);
    Alert.alert('Report Copied', 'Your monthly financial summary has been copied to your clipboard.');
  };

  const totalTransactionsCount =
    metrics.expenseCount + metrics.incomeCount + metrics.transferCount;
  const activeBudgetsCount = budgets.filter((b) => b.hasBudget).length;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.headerTitle, { color: theme.textPrimary, marginRight: 10 }]}>
              Statistics & Reports
            </Text>
            <TouchableOpacity
              onPress={toggleBalanceVisibility}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel={isBalanceHidden ? 'Reveal numbers' : 'Hide numbers'}
            >
              {isBalanceHidden ? (
                <Eye size={20} color={theme.textMuted} />
              ) : (
                <EyeOff size={20} color={theme.textMuted} />
              )}
            </TouchableOpacity>
          </View>
          <View style={[styles.datePill, { backgroundColor: theme.surfaceHighlight }]}>
            <Calendar size={14} color={theme.textSecondary} />
            <Text style={[styles.datePillText, { color: theme.textSecondary }]}>
              {selectedMonth.year}
            </Text>
          </View>
        </View>

        {/* Time Selector Pills (Oct, Nov, Dec, Jan, Feb, Mar) */}
        <View style={styles.monthPillsRow}>
          {MONTHS_CONFIG.map((m, idx) => (
            <TouchableOpacity
              key={m.label}
              style={[
                styles.monthPill,
                {
                  backgroundColor: idx === selectedMonthIndex ? theme.primary : 'transparent',
                },
              ]}
              onPress={() => setSelectedMonthIndex(idx)}
            >
              <Text
                style={[
                  styles.monthPillText,
                  {
                    color: idx === selectedMonthIndex ? '#FFFFFF' : theme.textMuted,
                    fontWeight: idx === selectedMonthIndex ? typography.fontWeight.bold : typography.fontWeight.medium,
                  },
                ]}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Cash Flow Summary Cards */}
        <View style={styles.cashFlowRow}>
          <VaultCard isDark={isDark} style={styles.cashFlowCard}>
            <View style={[styles.trendIconCircle, { backgroundColor: theme.expenseBackground }]}>
              <TrendingDown size={16} color={theme.textPrimary} />
            </View>
            <Text style={[styles.cardSublabel, { color: theme.textSecondary }]}>Total Spent</Text>
            <Text style={[styles.cardMainNumber, { color: theme.textPrimary }]}>
              {isBalanceHidden ? '•••••••• ETB' : `${metrics.totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB`}
            </Text>
          </VaultCard>

          <VaultCard isDark={isDark} style={styles.cashFlowCard}>
            <View style={[styles.trendIconCircle, { backgroundColor: theme.incomeBackground }]}>
              <TrendingUp size={16} color={theme.income} />
            </View>
            <Text style={[styles.cardSublabel, { color: theme.textSecondary }]}>Total Income</Text>
            <Text style={[styles.cardMainNumber, { color: theme.income }]}>
              {isBalanceHidden ? '•••••••• ETB' : `+${metrics.totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB`}
            </Text>
          </VaultCard>
        </View>

        {/* Net Cash Flow & Trend Banner */}
        <VaultCard isDark={isDark} style={styles.netCashFlowCard} variant="highlight">
          <View style={styles.netCashFlowRow}>
            <View>
              <Text style={[styles.netCashFlowLabel, { color: theme.textSecondary }]}>
                Net Cash Flow
              </Text>
              <Text
                style={[
                  styles.netCashFlowAmount,
                  { color: metrics.netSavings >= 0 ? theme.income : theme.expense },
                ]}
              >
                {isBalanceHidden
                  ? '•••••••• ETB'
                  : `${metrics.netSavings >= 0 ? '+' : ''}${metrics.netSavings.toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB`}
              </Text>
            </View>

            {metrics.momExpenseChangePct !== undefined && (
              <View
                style={[
                  styles.momPill,
                  {
                    backgroundColor:
                      metrics.momExpenseChangePct <= 0
                        ? theme.incomeBackground
                        : theme.expenseBackground,
                  },
                ]}
              >
                {metrics.momExpenseChangePct <= 0 ? (
                  <TrendingDown size={12} color={theme.income} style={{ marginRight: 4 }} />
                ) : (
                  <TrendingUp size={12} color={theme.expense} style={{ marginRight: 4 }} />
                )}
                <Text
                  style={[
                    styles.momPillText,
                    {
                      color:
                        metrics.momExpenseChangePct <= 0
                          ? theme.income
                          : theme.expense,
                    },
                  ]}
                >
                  {Math.abs(metrics.momExpenseChangePct)}% {metrics.momExpenseChangePct <= 0 ? 'lower MoM' : 'higher MoM'}
                </Text>
              </View>
            )}
          </View>
        </VaultCard>

        {/* Transaction Volume & Ticket Averages */}
        <View style={styles.volumeRow}>
          <VaultCard isDark={isDark} style={styles.volumeCard}>
            <View style={styles.volumeIconRow}>
              <Activity size={16} color={theme.primary} />
              <Text style={[styles.volumeLabel, { color: theme.textSecondary }]}>Activity Volume</Text>
            </View>
            <Text style={[styles.volumeMainText, { color: theme.textPrimary }]}>
              {totalTransactionsCount} Transactions
            </Text>
            <Text style={[styles.volumeSubText, { color: theme.textMuted }]}>
              {metrics.expenseCount} out • {metrics.incomeCount} in • {metrics.transferCount} transfers
            </Text>
          </VaultCard>

          <VaultCard isDark={isDark} style={styles.volumeCard}>
            <View style={styles.volumeIconRow}>
              <Layers size={16} color={theme.warning} />
              <Text style={[styles.volumeLabel, { color: theme.textSecondary }]}>Average Ticket</Text>
            </View>
            <Text style={[styles.volumeMainText, { color: theme.textPrimary }]}>
              {isBalanceHidden ? '•••• ETB' : `${metrics.averageExpenseAmount.toLocaleString()} ETB`}
            </Text>
            <Text style={[styles.volumeSubText, { color: theme.textMuted }]}>
              Per outbound transaction
            </Text>
          </VaultCard>
        </View>

        {/* Category Breakdown */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Spending by Category</Text>
        </View>

        <VaultCard isDark={isDark} style={styles.categoryCard}>
          {metrics.topCategories.length > 0 ? (
            metrics.topCategories.map((cat, i) => (
              <View key={i} style={styles.categoryItemBlock}>
                <View style={styles.categoryRow}>
                  <View style={styles.categoryLeft}>
                    <View style={[styles.categoryColorDot, { backgroundColor: cat.color }]} />
                    <Text style={[styles.categoryName, { color: theme.textPrimary }]}>{cat.name}</Text>
                  </View>

                  <View style={styles.categoryRight}>
                    <Text style={[styles.categoryAmount, { color: theme.textPrimary }]}>
                      {isBalanceHidden ? '•••••••• ETB' : `${cat.amount.toLocaleString()} ETB`}
                    </Text>
                    <Text style={[styles.categoryPercentage, { color: theme.textMuted }]}>
                      ({cat.percentage}%)
                    </Text>
                  </View>
                </View>

                {/* Progress bar */}
                <View style={[styles.categoryBarTrack, { backgroundColor: theme.surfaceHighlight }]}>
                  <View
                    style={[
                      styles.categoryBarFill,
                      { backgroundColor: cat.color, width: `${Math.min(100, cat.percentage)}%` },
                    ]}
                  />
                </View>
              </View>
            ))
          ) : (
            <Text style={[styles.emptySectionText, { color: theme.textMuted }]}>
              No categorized expenses recorded for {selectedMonth.label} {selectedMonth.year}.
            </Text>
          )}
        </VaultCard>

        {/* Spending by Account / Wallet */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Spending by Account & Wallet</Text>
        </View>

        <VaultCard isDark={isDark} style={styles.accountBreakdownCard}>
          {metrics.accountBreakdown.length > 0 ? (
            metrics.accountBreakdown.map((acc) => {
              const accountSharePct =
                metrics.totalExpense > 0
                  ? Math.round((acc.spentAmount / metrics.totalExpense) * 100)
                  : 0;

              return (
                <View key={acc.id} style={styles.accountItemRow}>
                  <View style={styles.accountLeft}>
                    <View style={[styles.accountIconCircle, { backgroundColor: theme.surfaceHighlight }]}>
                      <Wallet size={16} color={theme.primary} />
                    </View>
                    <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                      <Text style={[styles.accountName, { color: theme.textPrimary }]}>
                        {acc.name}
                      </Text>
                      <Text style={[styles.accountMeta, { color: theme.textMuted }]}>
                        {acc.txCount} outflow {acc.txCount === 1 ? 'transaction' : 'transactions'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.accountRight}>
                    <Text style={[styles.accountSpentAmount, { color: theme.textPrimary }]}>
                      {isBalanceHidden ? '•••••••• ETB' : `${acc.spentAmount.toLocaleString()} ETB`}
                    </Text>
                    <Text style={[styles.accountSharePct, { color: theme.textSecondary }]}>
                      {accountSharePct}% of total
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={[styles.emptySectionText, { color: theme.textMuted }]}>
              No account activity recorded for this period.
            </Text>
          )}
        </VaultCard>

        {/* Top Merchants Breakdown */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Top Outflow Merchants</Text>
        </View>

        <VaultCard isDark={isDark} style={styles.merchantsCard}>
          {metrics.topMerchants.length > 0 ? (
            metrics.topMerchants.map((m, index) => (
              <View key={index} style={styles.merchantItemRow}>
                <View style={styles.merchantLeft}>
                  <View style={[styles.rankBadge, { backgroundColor: theme.surfaceHighlight }]}>
                    <Text style={[styles.rankText, { color: theme.textSecondary }]}>
                      #{index + 1}
                    </Text>
                  </View>
                  <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                    <Text style={[styles.merchantName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {m.merchant}
                    </Text>
                    <Text style={[styles.merchantCount, { color: theme.textMuted }]}>
                      {m.count} {m.count === 1 ? 'purchase' : 'purchases'}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.merchantAmount, { color: theme.textPrimary }]}>
                  {isBalanceHidden ? '•••••••• ETB' : `${m.amount.toLocaleString()} ETB`}
                </Text>
              </View>
            ))
          ) : (
            <Text style={[styles.emptySectionText, { color: theme.textMuted }]}>
              No merchant transactions recorded for this period.
            </Text>
          )}
        </VaultCard>

        {/* Monthly Budgets Adherence Widget */}
        <View style={styles.sectionHeader}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Category Budgets</Text>
            {navigation && (
              <TouchableOpacity
                style={styles.manageBudgetsLink}
                onPress={() => navigation.navigate('Budgets')}
              >
                <Text style={[styles.manageBudgetsText, { color: theme.primary }]}>
                  Manage Budgets →
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <VaultCard isDark={isDark} style={styles.budgetsWidgetCard}>
          {activeBudgetsCount > 0 ? (
            <View>
              <View style={styles.budgetWidgetTopRow}>
                <View>
                  <Text style={[styles.budgetWidgetLabel, { color: theme.textSecondary }]}>
                    Active Category Budgets
                  </Text>
                  <Text style={[styles.budgetWidgetNumber, { color: theme.textPrimary }]}>
                    {activeBudgetsCount} Categories Tracked
                  </Text>
                </View>
                {navigation && (
                  <TouchableOpacity
                    style={[styles.budgetDetailsBtn, { backgroundColor: theme.primaryGlow }]}
                    onPress={() => navigation.navigate('Budgets')}
                  >
                    <Text style={[styles.budgetDetailsBtnText, { color: theme.primary }]}>
                      View All
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {budgets
                .filter((b) => b.hasBudget)
                .slice(0, 3)
                .map((b) => {
                  const isExceeded = b.status === 'EXCEEDED';
                  const isWarning = b.status === 'WARNING';
                  const barColor = isExceeded
                    ? theme.expense
                    : isWarning
                    ? theme.warning
                    : theme.income;

                  return (
                    <View key={b.category.id} style={styles.budgetWidgetMiniRow}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={[styles.budgetMiniName, { color: theme.textPrimary }]}>
                          {b.category.name}
                        </Text>
                        <Text style={[styles.budgetMiniUsage, { color: barColor }]}>
                          {formatAmount(b.spentAmount)} / {formatAmount(b.monthlyLimit)} ({b.percentageSpent}%)
                        </Text>
                      </View>
                      <View style={[styles.budgetMiniTrack, { backgroundColor: theme.surfaceHighlight }]}>
                        <View
                          style={[
                            styles.budgetMiniFill,
                            { backgroundColor: barColor, width: `${Math.min(100, b.percentageSpent)}%` },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })}
            </View>
          ) : (
            <View style={styles.emptyBudgetBox}>
              <PieChart size={32} color={theme.textMuted} style={{ marginBottom: spacing.xs }} />
              <Text style={[styles.emptyBudgetTitle, { color: theme.textPrimary }]}>
                No budgets set for {selectedMonth.label} {selectedMonth.year}
              </Text>
              <Text style={[styles.emptyBudgetSubtitle, { color: theme.textMuted }]}>
                Define category spending limits to keep track of allowances and stay within budget.
              </Text>
              {navigation && (
                <TouchableOpacity
                  style={[styles.setBudgetBtn, { backgroundColor: theme.primary }]}
                  onPress={() => navigation.navigate('Budgets')}
                >
                  <Text style={styles.setBudgetBtnText}>Set Monthly Budget →</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </VaultCard>

        {/* Visual Financial Cockpit & Gemini Synthesis */}
        <View style={styles.cockpitHeaderRow}>
          <View style={styles.aiTitleRow}>
            <Sparkles size={20} color={theme.primary} />
            <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginLeft: 6 }]}>
              Visual Financial Cockpit
            </Text>
          </View>

          <View style={styles.headerRightControls}>
            {visualSummary && (
              <View
                style={[
                  styles.engineBadge,
                  {
                    backgroundColor: visualSummary.isStale
                      ? (isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7')
                      : visualSummary.isAiGenerated
                      ? (isDark ? 'rgba(99, 102, 241, 0.15)' : '#EEF2FF')
                      : theme.surfaceHighlight,
                    borderColor: visualSummary.isStale
                      ? theme.warning
                      : visualSummary.isAiGenerated
                      ? theme.primary
                      : theme.surfaceBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.engineBadgeText,
                    {
                      color: visualSummary.isStale
                        ? theme.warning
                        : visualSummary.isAiGenerated
                        ? theme.primary
                        : theme.textSecondary,
                    },
                  ]}
                >
                  {visualSummary.isStale
                    ? '⚠️ Data Updated'
                    : visualSummary.isAiGenerated
                    ? '✦ Gemini Intelligence'
                    : '🛡 Local Engine'}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.refreshIconButton, { backgroundColor: theme.surfaceHighlight }]}
              onPress={handleRefreshAnalysis}
              disabled={isGeneratingAi}
              accessibilityLabel="Refresh Analysis"
            >
              {isGeneratingAi ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <RefreshCw size={14} color={theme.textSecondary} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Cockpit Snapshot Summary Card */}
        {visualSummary && (
          <VaultCard isDark={isDark} style={styles.cockpitCard} variant="highlight">
            {/* Headline */}
            <Text style={[styles.cockpitHeadline, { color: theme.textPrimary }]}>
              {visualSummary.summaryHeadline}
            </Text>

            {/* Outflows and MoM trend */}
            <View style={styles.cockpitStatsRow}>
              <View>
                <Text style={[styles.cockpitSubtext, { color: theme.textSecondary }]}>
                  Monthly Outflows
                </Text>
                <Text style={[styles.cockpitAmount, { color: theme.textPrimary }]}>
                  {isBalanceHidden ? '•••••••• ETB' : visualSummary.totalExpenseFormatted}
                </Text>
              </View>

              {visualSummary.momChangeText && (
                <View
                  style={[
                    styles.momBadge,
                    {
                      backgroundColor:
                        visualSummary.momChangeDirection === 'DOWN'
                          ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5')
                          : visualSummary.momChangeDirection === 'UP'
                          ? (isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2')
                          : theme.surfaceHighlight,
                    },
                  ]}
                >
                  {visualSummary.momChangeDirection === 'DOWN' ? (
                    <TrendingDown size={14} color={theme.income} style={{ marginRight: 4 }} />
                  ) : visualSummary.momChangeDirection === 'UP' ? (
                    <TrendingUp size={14} color={theme.expense} style={{ marginRight: 4 }} />
                  ) : null}
                  <Text
                    style={[
                      styles.momBadgeText,
                      {
                        color:
                          visualSummary.momChangeDirection === 'DOWN'
                            ? theme.income
                            : visualSummary.momChangeDirection === 'UP'
                            ? theme.expense
                            : theme.textSecondary,
                      },
                    ]}
                  >
                    {visualSummary.momChangeText}
                  </Text>
                </View>
              )}
            </View>

            {/* Observation Callout: 💡 What stands out */}
            <View
              style={[
                styles.observationCallout,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F9FAFB',
                  borderColor: theme.surfaceBorder,
                },
              ]}
            >
              <Text style={[styles.observationTitle, { color: theme.primary }]}>
                💡 What stands out
              </Text>
              <Text style={[styles.observationBody, { color: theme.textSecondary }]}>
                {visualSummary.observationSummary}
              </Text>
            </View>
          </VaultCard>
        )}

        {/* Dynamic Visual Insight Cards */}
        {visualSummary && visualSummary.insightCards.length > 0 && (
          <View style={styles.insightCardsSection}>
            <Text style={[styles.insightCardsTitle, { color: theme.textSecondary }]}>
              Key Financial Highlights
            </Text>

            <View style={styles.cardsGrid}>
              {visualSummary.insightCards.map((card) => {
                const badgeColor =
                  card.badgeVariant === 'income'
                    ? theme.income
                    : card.badgeVariant === 'expense'
                    ? theme.expense
                    : card.badgeVariant === 'warning'
                    ? theme.warning
                    : card.badgeVariant === 'primary'
                    ? theme.primary
                    : theme.textSecondary;

                return (
                  <VaultCard key={card.id} isDark={isDark} style={styles.insightCardItem}>
                    {/* Header Row: Title & Badge */}
                    <View style={styles.cardHeaderRow}>
                      <Text style={[styles.cardTitleText, { color: theme.textMuted }]}>
                        {card.title}
                      </Text>
                      {card.badgeText && (
                        <View
                          style={[
                            styles.cardBadge,
                            {
                              backgroundColor: badgeColor + '20',
                              borderColor: badgeColor + '40',
                            },
                          ]}
                        >
                          <Text style={[styles.cardBadgeText, { color: badgeColor }]}>
                            {card.badgeText}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Metrics Row */}
                    <View style={styles.cardMetricsRow}>
                      <Text style={[styles.primaryMetricText, { color: theme.textPrimary }]}>
                        {isBalanceHidden && card.primaryMetric.includes('ETB')
                          ? '•••••••• ETB'
                          : card.primaryMetric}
                      </Text>
                      {card.secondaryMetric && (
                        <Text style={[styles.secondaryMetricText, { color: theme.textSecondary }]}>
                          {isBalanceHidden && card.secondaryMetric.includes('ETB')
                            ? '•••••••• ETB'
                            : card.secondaryMetric}
                        </Text>
                      )}
                    </View>

                    {/* Factual Explanation */}
                    <Text style={[styles.cardExplanationText, { color: theme.textSecondary }]}>
                      {card.explanation}
                    </Text>
                  </VaultCard>
                );
              })}
            </View>
          </View>
        )}

        {/* Export Monthly Financial Report Button */}
        <TouchableOpacity
          style={[styles.exportReportBtn, { backgroundColor: theme.surfaceHighlight, borderColor: theme.surfaceBorder }]}
          onPress={handleCopyMonthlyReport}
        >
          {copiedReport ? (
            <Check size={16} color={theme.income} style={{ marginRight: 8 }} />
          ) : (
            <Copy size={16} color={theme.primary} style={{ marginRight: 8 }} />
          )}
          <Text style={[styles.exportReportBtnText, { color: copiedReport ? theme.income : theme.textPrimary }]}>
            {copiedReport ? 'Report Copied to Clipboard!' : 'Copy Monthly Report (Text Summary)'}
          </Text>
        </TouchableOpacity>

        {/* Footer: Manual Refresh & Timestamp */}
        {visualSummary && (
          <TouchableOpacity
            style={[
              styles.refreshFooterButton,
              {
                borderColor: visualSummary.isStale ? theme.warning : theme.surfaceBorder,
                backgroundColor: visualSummary.isStale
                  ? (isDark ? 'rgba(245, 158, 11, 0.08)' : '#FFFBEB')
                  : 'transparent',
              },
            ]}
            onPress={handleRefreshAnalysis}
            disabled={isGeneratingAi}
          >
            {isGeneratingAi ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <>
                <RefreshCw
                  size={14}
                  color={visualSummary.isStale ? theme.warning : theme.textMuted}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.refreshFooterText,
                    { color: visualSummary.isStale ? theme.warning : theme.textMuted },
                  ]}
                >
                  {visualSummary.isStale
                    ? 'Re-synthesize Analysis (Data updated)'
                    : visualSummary.cachedAt
                    ? 'Re-synthesize Analysis (Cached)'
                    : 'Re-synthesize Analysis'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* First-Use Guided Tour */}
      <GuidedTourOverlay tourKey="analytics" steps={ANALYTICS_TOUR_STEPS} isDark={isDark} />
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
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.pill,
    gap: 4,
  },
  datePillText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  monthPillsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: spacing.md,
  },
  monthPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: borderRadius.pill,
  },
  monthPillText: {
    fontSize: typography.fontSize.xs,
  },
  cashFlowRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  cashFlowCard: {
    flex: 1,
    padding: spacing.md,
  },
  trendIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  cardSublabel: {
    fontSize: typography.fontSize.xs,
    marginBottom: 4,
  },
  cardMainNumber: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  netCashFlowCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  netCashFlowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  netCashFlowLabel: {
    fontSize: typography.fontSize.xs,
    marginBottom: 2,
  },
  netCashFlowAmount: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  momPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.pill,
  },
  momPillText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  volumeRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  volumeCard: {
    flex: 1,
    padding: spacing.md,
  },
  volumeIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.xs,
  },
  volumeLabel: {
    fontSize: typography.fontSize.xs,
  },
  volumeMainText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 2,
  },
  volumeSubText: {
    fontSize: 10,
  },
  sectionHeader: {
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  categoryCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  categoryItemBlock: {
    marginBottom: spacing.sm,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  categoryName: {
    fontSize: typography.fontSize.sm,
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryAmount: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  categoryPercentage: {
    fontSize: typography.fontSize.xs,
  },
  categoryBarTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  categoryBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  emptySectionText: {
    fontSize: typography.fontSize.xs,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  accountBreakdownCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  accountItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  accountLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  accountIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  accountMeta: {
    fontSize: 10,
    marginTop: 1,
  },
  accountRight: {
    alignItems: 'flex-end',
  },
  accountSpentAmount: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  accountSharePct: {
    fontSize: 10,
    marginTop: 1,
  },
  merchantsCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  merchantItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  merchantLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  merchantName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  merchantCount: {
    fontSize: 10,
    marginTop: 1,
  },
  merchantAmount: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  manageBudgetsLink: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  manageBudgetsText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  budgetsWidgetCard: {
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  budgetWidgetTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  budgetWidgetLabel: {
    fontSize: typography.fontSize.xs,
  },
  budgetWidgetNumber: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    marginTop: 2,
  },
  budgetDetailsBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.pill,
  },
  budgetDetailsBtnText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  budgetWidgetMiniRow: {
    marginBottom: spacing.xs,
  },
  budgetMiniName: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  budgetMiniUsage: {
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  budgetMiniTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  budgetMiniFill: {
    height: '100%',
    borderRadius: 2,
  },
  emptyBudgetBox: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  emptyBudgetTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 4,
  },
  emptyBudgetSubtitle: {
    fontSize: typography.fontSize.xs,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  setBudgetBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
  },
  setBudgetBtnText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  cockpitHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  aiTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  engineBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
  },
  engineBadgeText: {
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  refreshIconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cockpitCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cockpitHeadline: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  cockpitStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cockpitSubtext: {
    fontSize: typography.fontSize.xs,
    marginBottom: 2,
  },
  cockpitAmount: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
  momBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.pill,
  },
  momBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  observationCallout: {
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  observationTitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 4,
  },
  observationBody: {
    fontSize: typography.fontSize.xs,
    lineHeight: 18,
  },
  insightCardsSection: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  insightCardsTitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  cardsGrid: {
    gap: spacing.sm,
  },
  insightCardItem: {
    padding: spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  cardTitleText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  cardBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
  },
  cardBadgeText: {
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  cardMetricsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    marginBottom: 4,
  },
  primaryMetricText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  secondaryMetricText: {
    fontSize: typography.fontSize.xs,
  },
  cardExplanationText: {
    fontSize: typography.fontSize.xs,
    lineHeight: 16,
  },
  exportReportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  exportReportBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  refreshFooterButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginTop: spacing.xs,
  },
  refreshFooterText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
});
