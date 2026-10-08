/**
 * BudgetsScreen.tsx
 * Local-first Category Budget Management & Tracking.
 * - Displays monthly budget health, category limits, spending, and remaining allowances
 * - Pure local SQLite arithmetic, strictly excluding internal transfers
 * - Real-time healthy, approaching limit, and exceeded status indicators
 * - Add, edit, and delete budget limits per category
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Plus,
  PieChart,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  Edit3,
  Trash2,
} from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { Category, BudgetWithSpent } from '../types/database';
import { dbService } from '../database/DatabaseService';
import { useBalanceVisibility } from '../context/BalanceVisibilityContext';

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

interface BudgetsScreenProps {
  navigation: any;
  isDark?: boolean;
}

export const BudgetsScreen: React.FC<BudgetsScreenProps> = ({
  navigation,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;
  const { formatAmount } = useBalanceVisibility();

  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0); // 'Oct'
  const selectedMonth = MONTHS_CONFIG[selectedMonthIndex] || MONTHS_CONFIG[0];

  const [budgets, setBudgets] = useState<BudgetWithSpent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetWithSpent | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [limitInput, setLimitInput] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [cats, budgetsWithSpent] = await Promise.all([
        dbService.getCategories(),
        dbService.getBudgetsWithSpent(selectedMonth.month, selectedMonth.year),
      ]);
      setCategories(cats);
      setBudgets(budgetsWithSpent);
    } catch (err) {
      console.error('[Budgets] Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth.month, selectedMonth.year]);

  useEffect(() => {
    loadData();
    const unsubscribe = navigation.addListener?.('focus', loadData);
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [loadData, navigation]);

  const activeBudgets = budgets.filter((b) => b.hasBudget);

  // Aggregate overall budget totals
  const totalBudgetLimit = activeBudgets.reduce((acc, b) => acc + b.monthlyLimit, 0);
  const totalBudgetSpent = activeBudgets.reduce((acc, b) => acc + b.spentAmount, 0);
  const totalBudgetRemaining = Math.max(0, totalBudgetLimit - totalBudgetSpent);
  const overallPct =
    totalBudgetLimit > 0
      ? Math.round((totalBudgetSpent / totalBudgetLimit) * 100)
      : 0;

  const handleOpenCreateModal = () => {
    setEditingBudget(null);
    // Default to the first category that does not have a budget yet, or first category
    const unbudgetedCat = categories.find(
      (c) => !activeBudgets.some((b) => b.category.id === c.id)
    );
    setSelectedCategoryId(unbudgetedCat ? unbudgetedCat.id : categories[0]?.id || '');
    setLimitInput('');
    setModalVisible(true);
  };

  const handleOpenEditModal = (budget: BudgetWithSpent) => {
    setEditingBudget(budget);
    setSelectedCategoryId(budget.category.id);
    setLimitInput(budget.monthlyLimit.toString());
    setModalVisible(true);
  };

  const handleSaveBudget = async () => {
    const limit = parseFloat(limitInput);
    if (!selectedCategoryId || isNaN(limit) || limit <= 0) {
      Alert.alert('Invalid Budget', 'Please select a category and enter a positive monthly spending limit.');
      return;
    }

    try {
      await dbService.setBudget({
        categoryId: selectedCategoryId,
        monthlyLimit: limit,
        month: selectedMonth.month,
        year: selectedMonth.year,
      });

      setModalVisible(false);
      setEditingBudget(null);
      setLimitInput('');
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save budget.');
    }
  };

  const handleDeleteBudget = (budget: BudgetWithSpent) => {
    if (!budget.id) return;
    Alert.alert(
      'Delete Budget',
      `Are you sure you want to remove the monthly budget for "${budget.category.name}"? Past transactions will remain untouched.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await dbService.deleteBudget(budget.id!);
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete budget.');
            }
          },
        },
      ]
    );
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
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Monthly Budgets</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.primary }]}
          onPress={handleOpenCreateModal}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Plus size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Month Selector Pills */}
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
                  fontWeight:
                    idx === selectedMonthIndex
                      ? typography.fontWeight.bold
                      : typography.fontWeight.medium,
                },
              ]}
            >
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Total Budget Overview Card */}
          {activeBudgets.length > 0 && (
            <VaultCard isDark={isDark} style={styles.summaryCard} variant="highlight">
              <View style={styles.summaryTopRow}>
                <View>
                  <Text style={[styles.summarySubtitle, { color: theme.textSecondary }]}>
                    Total Budget ({selectedMonth.label} {selectedMonth.year})
                  </Text>
                  <Text style={[styles.summaryMainNumber, { color: theme.textPrimary }]}>
                    {formatAmount(totalBudgetLimit)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.overallStatusPill,
                    {
                      backgroundColor:
                        overallPct > 100
                          ? theme.expenseBackground
                          : overallPct >= 80
                          ? theme.warningBackground
                          : theme.incomeBackground,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.overallStatusText,
                      {
                        color:
                          overallPct > 100
                            ? theme.expense
                            : overallPct >= 80
                            ? theme.warning
                            : theme.income,
                      },
                    ]}
                  >
                    {overallPct}% Used
                  </Text>
                </View>
              </View>

              {/* Progress Bar */}
              <View
                style={[
                  styles.progressBarTrack,
                  { backgroundColor: theme.surfaceHighlight },
                ]}
              >
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      backgroundColor:
                        overallPct > 100
                          ? theme.expense
                          : overallPct >= 80
                          ? theme.warning
                          : theme.primary,
                      width: `${Math.min(100, overallPct)}%`,
                    },
                  ]}
                />
              </View>

              {/* Spent & Remaining Row */}
              <View style={styles.summaryFooterRow}>
                <View>
                  <Text style={[styles.footerSublabel, { color: theme.textMuted }]}>Spent</Text>
                  <Text style={[styles.footerValue, { color: theme.textPrimary }]}>
                    {formatAmount(totalBudgetSpent)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.footerSublabel, { color: theme.textMuted }]}>
                    {totalBudgetSpent > totalBudgetLimit ? 'Over Budget' : 'Remaining'}
                  </Text>
                  <Text
                    style={[
                      styles.footerValue,
                      {
                        color:
                          totalBudgetSpent > totalBudgetLimit
                            ? theme.expense
                            : theme.income,
                      },
                    ]}
                  >
                    {totalBudgetSpent > totalBudgetLimit
                      ? `+${formatAmount(totalBudgetSpent - totalBudgetLimit)}`
                      : formatAmount(totalBudgetRemaining)}
                  </Text>
                </View>
              </View>
            </VaultCard>
          )}

          {/* Section Title */}
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
              Category Budgets ({activeBudgets.length})
            </Text>
          </View>

          {/* Budgets List */}
          {activeBudgets.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconCircle, { backgroundColor: theme.primaryGlow }]}>
                <PieChart size={40} color={theme.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
                No Budgets For {selectedMonth.label}
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                Set category spending limits to keep your expenses in check and prevent overspending.
              </Text>
              <TouchableOpacity
                style={[styles.createFirstBtn, { backgroundColor: theme.primary }]}
                onPress={handleOpenCreateModal}
              >
                <Plus size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.createFirstBtnText}>Set Your First Budget</Text>
              </TouchableOpacity>
            </View>
          ) : (
            activeBudgets.map((item) => {
              const isExceeded = item.status === 'EXCEEDED';
              const isWarning = item.status === 'WARNING';
              const statusColor = isExceeded
                ? theme.expense
                : isWarning
                ? theme.warning
                : theme.income;
              const statusBg = isExceeded
                ? theme.expenseBackground
                : isWarning
                ? theme.warningBackground
                : theme.incomeBackground;

              return (
                <VaultCard key={item.category.id} isDark={isDark} style={styles.budgetCard}>
                  {/* Category Header */}
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.categoryLeft}>
                      <View
                        style={[
                          styles.categoryColorDot,
                          { backgroundColor: item.category.colorHex || theme.primary },
                        ]}
                      />
                      <Text style={[styles.categoryName, { color: theme.textPrimary }]}>
                        {item.category.name}
                      </Text>
                    </View>

                    {/* Status Badge */}
                    <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                      {isExceeded ? (
                        <XCircle size={12} color={statusColor} style={{ marginRight: 4 }} />
                      ) : isWarning ? (
                        <AlertTriangle size={12} color={statusColor} style={{ marginRight: 4 }} />
                      ) : (
                        <CheckCircle2 size={12} color={statusColor} style={{ marginRight: 4 }} />
                      )}
                      <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                        {isExceeded
                          ? 'Exceeded'
                          : isWarning
                          ? 'Approaching Limit'
                          : 'Healthy'}
                      </Text>
                    </View>
                  </View>

                  {/* Progress Bar */}
                  <View
                    style={[
                      styles.progressBarTrack,
                      { backgroundColor: theme.surfaceHighlight },
                    ]}
                  >
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          backgroundColor: statusColor,
                          width: `${Math.min(100, item.percentageSpent)}%`,
                        },
                      ]}
                    />
                  </View>

                  {/* Financial Metrics Breakdown */}
                  <View style={styles.metricsGrid}>
                    <View style={styles.metricCol}>
                      <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Budget</Text>
                      <Text style={[styles.metricNumber, { color: theme.textPrimary }]}>
                        {formatAmount(item.monthlyLimit)}
                      </Text>
                    </View>

                    <View style={styles.metricCol}>
                      <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Spent</Text>
                      <Text style={[styles.metricNumber, { color: theme.textPrimary }]}>
                        {formatAmount(item.spentAmount)}
                      </Text>
                    </View>

                    <View style={styles.metricCol}>
                      <Text style={[styles.metricLabel, { color: theme.textMuted }]}>
                        {isExceeded ? 'Exceeded by' : 'Remaining'}
                      </Text>
                      <Text
                        style={[
                          styles.metricNumber,
                          { color: isExceeded ? theme.expense : theme.income },
                        ]}
                      >
                        {isExceeded
                          ? formatAmount(item.spentAmount - item.monthlyLimit)
                          : formatAmount(item.remainingAmount)}
                      </Text>
                    </View>

                    <View style={[styles.metricCol, { alignItems: 'flex-end' }]}>
                      <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Usage</Text>
                      <Text
                        style={[
                          styles.metricNumber,
                          { color: statusColor, fontWeight: typography.fontWeight.bold },
                        ]}
                      >
                        {item.percentageSpent}%
                      </Text>
                    </View>
                  </View>

                  {/* Action Controls */}
                  <View style={[styles.cardActionRow, { borderTopColor: theme.surfaceBorder }]}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleOpenEditModal(item)}
                    >
                      <Edit3 size={14} color={theme.textSecondary} style={{ marginRight: 4 }} />
                      <Text style={[styles.actionBtnText, { color: theme.textSecondary }]}>
                        Edit Limit
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleDeleteBudget(item)}
                    >
                      <Trash2 size={14} color={theme.expense} style={{ marginRight: 4 }} />
                      <Text style={[styles.actionBtnText, { color: theme.expense }]}>
                        Delete
                      </Text>
                    </TouchableOpacity>
                  </View>
                </VaultCard>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Add / Edit Budget Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
                {editingBudget ? 'Edit Budget' : 'Set Category Budget'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalPeriodLabel, { color: theme.textMuted }]}>
              Period: {selectedMonth.label} {selectedMonth.year}
            </Text>

            {/* Category Selector */}
            <Text style={[styles.modalFieldLabel, { color: theme.textSecondary }]}>
              Select Category
            </Text>
            {editingBudget ? (
              <View
                style={[
                  styles.categoryPillSelected,
                  {
                    backgroundColor: theme.surfaceHighlight,
                    borderColor: theme.surfaceBorder,
                    marginBottom: spacing.md,
                  },
                ]}
              >
                <View
                  style={[
                    styles.categoryColorDot,
                    { backgroundColor: editingBudget.category.colorHex },
                  ]}
                />
                <Text style={[styles.categoryPillText, { color: theme.textPrimary }]}>
                  {editingBudget.category.name}
                </Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryScroll}
              >
                {categories.map((cat) => {
                  const isSelected = selectedCategoryId === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.categorySelectPill,
                        {
                          backgroundColor: isSelected
                            ? theme.primary
                            : theme.surfaceHighlight,
                          borderColor: isSelected
                            ? theme.primary
                            : theme.surfaceBorder,
                        },
                      ]}
                      onPress={() => setSelectedCategoryId(cat.id)}
                    >
                      <View
                        style={[
                          styles.categoryColorDot,
                          {
                            backgroundColor: isSelected ? '#FFFFFF' : cat.colorHex,
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.categorySelectPillText,
                          {
                            color: isSelected ? '#FFFFFF' : theme.textPrimary,
                          },
                        ]}
                      >
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Monthly Limit Input */}
            <Text style={[styles.modalFieldLabel, { color: theme.textSecondary }]}>
              Monthly Spending Limit (ETB)
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                {
                  backgroundColor: theme.surfaceHighlight,
                  color: theme.textPrimary,
                  borderColor: theme.surfaceBorder,
                },
              ]}
              placeholder="e.g. 2,000"
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
              value={limitInput}
              onChangeText={setLimitInput}
              autoFocus
            />

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveBudgetBtn, { backgroundColor: theme.primary }]}
              onPress={handleSaveBudget}
            >
              <Text style={styles.saveBudgetBtnText}>
                {editingBudget ? 'Update Budget' : 'Set Budget'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthPillsRow: {
    flexDirection: 'row',
    paddingHorizontal: layout.screenPaddingHorizontal,
    paddingVertical: spacing.sm,
    justifyContent: 'space-between',
  },
  monthPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.pill,
  },
  monthPillText: {
    fontSize: typography.fontSize.xs,
  },
  scrollContent: {
    padding: layout.screenPaddingHorizontal,
    paddingBottom: 40,
  },
  summaryCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  summarySubtitle: {
    fontSize: typography.fontSize.xs,
    marginBottom: 2,
  },
  summaryMainNumber: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
  overallStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.pill,
  },
  overallStatusText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: borderRadius.pill,
    marginVertical: spacing.xs,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: borderRadius.pill,
  },
  summaryFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  footerSublabel: {
    fontSize: typography.fontSize.xs,
  },
  footerValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    marginTop: 2,
  },
  sectionHeaderRow: {
    marginVertical: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  budgetCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  categoryName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.pill,
  },
  statusBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  metricCol: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 10,
    marginBottom: 2,
  },
  metricNumber: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  cardActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    gap: spacing.md,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  actionBtnText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  createFirstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
  },
  createFirstBtnText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderTopWidth: 1,
    padding: layout.screenPaddingHorizontal,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  modalPeriodLabel: {
    fontSize: typography.fontSize.xs,
    marginBottom: spacing.md,
  },
  modalFieldLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing.xs,
  },
  categoryScroll: {
    marginBottom: spacing.md,
    maxHeight: 44,
  },
  categorySelectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    marginRight: spacing.xs,
  },
  categorySelectPillText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  categoryPillSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  categoryPillText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  modalInput: {
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.lg,
  },
  saveBudgetBtn: {
    height: 48,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBudgetBtnText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
});
