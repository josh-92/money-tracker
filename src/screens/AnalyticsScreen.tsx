/**
 * AnalyticsScreen.tsx
 * Reuses the Statistics and Category Chart layouts from the Figma kit.
 * Displays local arithmetic totals, category breakdowns, and the
 * End-of-Month AI Financial Analysis report.
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
import { Sparkles, TrendingDown, TrendingUp, Calendar, RefreshCw, Eye, EyeOff } from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { dbService } from '../database/DatabaseService';
import { aiService, MonthlyAnalysisResult } from '../ai/AiService';
import { useBalanceVisibility } from '../context/BalanceVisibilityContext';

const MONTHS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

interface AnalyticsScreenProps {
  isDark?: boolean;
}

export const AnalyticsScreen: React.FC<AnalyticsScreenProps> = ({ isDark = true }) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;
  const { isBalanceHidden, toggleBalanceVisibility, formatAmount } = useBalanceVisibility();

  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0); // 'Oct'
  const [metrics, setMetrics] = useState<{
    totalIncome: number;
    totalExpense: number;
    netSavings: number;
    topCategories: Array<{ name: string; amount: number; percentage: number; color: string }>;
    topMerchants: Array<{ merchant: string; amount: number; count: number }>;
  }>({
    totalIncome: 0,
    totalExpense: 0,
    netSavings: 0,
    topCategories: [],
    topMerchants: [],
  });

  const [aiReport, setAiReport] = useState<MonthlyAnalysisResult | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  const loadData = async () => {
    try {
      const data = await dbService.getMonthlyMetrics(10, 2026);
      setMetrics({
        totalIncome: data.totalIncome,
        totalExpense: data.totalExpense,
        netSavings: data.netSavings,
        topCategories: data.topCategories,
        topMerchants: data.topMerchants,
      });
    } catch (err) {
      console.error('Error loading analytics:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedMonthIndex]);

  const handleGenerateAiAnalysis = async () => {
    setIsGeneratingAi(true);
    try {
      const digest = {
        monthName: MONTHS[selectedMonthIndex],
        year: 2026,
        totalIncome: metrics.totalIncome,
        totalExpense: metrics.totalExpense,
        netSavings: metrics.netSavings,
        topCategories: metrics.topCategories.map((c) => ({
          name: c.name,
          amount: c.amount,
          percentage: c.percentage,
        })),
        topMerchants: metrics.topMerchants.map((m) => ({
          merchant: m.merchant,
          amount: m.amount,
        })),
      };

      const result = await aiService.generateMonthlyAnalysis(digest);
      setAiReport(result);
    } catch (err: any) {
      Alert.alert(
        'AI Analysis Notice',
        err.message || 'Ensure your Gemini API key is configured in Settings.'
      );
    } finally {
      setIsGeneratingAi(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.headerTitle, { color: theme.textPrimary, marginRight: 10 }]}>Statistics & Reports</Text>
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
            <Text style={[styles.datePillText, { color: theme.textSecondary }]}>2026</Text>
          </View>
        </View>

        {/* Time Selector Pills (Exact Figma design: Oct, Nov, Dec, Jan, Feb, Mar) */}
        <View style={styles.monthPillsRow}>
          {MONTHS.map((m, idx) => (
            <TouchableOpacity
              key={m}
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
                {m}
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

        {/* Category Breakdown (Figma Donut / Category style) */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Spending by Category</Text>
        </View>

        <VaultCard isDark={isDark} style={styles.categoryCard}>
          {metrics.topCategories.length > 0 ? (
            metrics.topCategories.map((cat, i) => (
              <View key={i} style={styles.categoryRow}>
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
            ))
          ) : (
            <Text style={[styles.emptyCategoryText, { color: theme.textMuted }]}>
              No categorized expenses recorded for this month.
            </Text>
          )}
        </VaultCard>

        {/* End-of-Month AI Financial Analysis Card */}
        <View style={styles.sectionHeader}>
          <View style={styles.aiTitleRow}>
            <Sparkles size={20} color={theme.primary} />
            <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginLeft: 6 }]}>
              End-of-Month AI Analysis
            </Text>
          </View>
        </View>

        <VaultCard isDark={isDark} style={styles.aiCard} variant="highlight">
          {aiReport ? (
            <View>
              <Text style={[styles.aiHeadline, { color: theme.textPrimary }]}>
                {aiReport.summaryHeadline}
              </Text>

              <Text style={[styles.aiSubheading, { color: theme.primary }]}>Key Highlights</Text>
              {aiReport.keyHighlights.map((h, idx) => (
                <Text key={idx} style={[styles.aiBullet, { color: theme.textSecondary }]}>
                  • {h}
                </Text>
              ))}

              {aiReport.anomalies.length > 0 && (
                <>
                  <Text style={[styles.aiSubheading, { color: theme.warning }]}>Observations</Text>
                  {aiReport.anomalies.map((a, idx) => (
                    <Text key={idx} style={[styles.aiBullet, { color: theme.textSecondary }]}>
                      • {a}
                    </Text>
                  ))}
                </>
              )}

              <Text style={[styles.aiSubheading, { color: theme.income }]}>Practical Suggestions</Text>
              {aiReport.actionableSavingsTips.map((tip, idx) => (
                <Text key={idx} style={[styles.aiBullet, { color: theme.textSecondary }]}>
                  💡 {tip}
                </Text>
              ))}

              <TouchableOpacity
                style={[styles.regenerateButton, { borderColor: theme.surfaceBorder }]}
                onPress={handleGenerateAiAnalysis}
              >
                <RefreshCw size={14} color={theme.textMuted} />
                <Text style={[styles.regenerateText, { color: theme.textMuted }]}>Refresh Analysis</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.aiEmptyContainer}>
              <Text style={[styles.aiEmptyTitle, { color: theme.textPrimary }]}>
                Automated Financial Summary
              </Text>
              <Text style={[styles.aiEmptySubtitle, { color: theme.textSecondary }]}>
                Generates a concise, data-grounded report analyzing your largest spending categories, unusual spikes, and practical savings suggestions.
              </Text>

              <TouchableOpacity
                style={[styles.generateButton, { backgroundColor: theme.primary }]}
                onPress={handleGenerateAiAnalysis}
                disabled={isGeneratingAi}
              >
                {isGeneratingAi ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Sparkles size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.generateButtonText}>Generate {MONTHS[selectedMonthIndex]} Analysis</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </VaultCard>
      </ScrollView>
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
    fontSize: typography.fontSize.sm,
  },
  cashFlowRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginVertical: spacing.md,
  },
  cashFlowCard: {
    flex: 1,
    padding: spacing.md,
  },
  trendIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  cardSublabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  cardMainNumber: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginTop: 2,
  },
  sectionHeader: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  categoryCard: {
    padding: spacing.base,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  categoryName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  categoryAmount: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  categoryPercentage: {
    fontSize: typography.fontSize.xs,
  },
  emptyCategoryText: {
    textAlign: 'center',
    paddingVertical: spacing.lg,
    fontSize: typography.fontSize.sm,
  },
  aiTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiCard: {
    padding: spacing.lg,
  },
  aiHeadline: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  aiSubheading: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  aiBullet: {
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
    marginBottom: 4,
  },
  regenerateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.pill,
    paddingVertical: 6,
    marginTop: spacing.md,
    gap: 6,
  },
  regenerateText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  aiEmptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  aiEmptyTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  aiEmptySubtitle: {
    fontSize: typography.fontSize.xs,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing.lg,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.pill,
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
});
