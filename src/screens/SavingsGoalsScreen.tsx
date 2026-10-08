/**
 * SavingsGoalsScreen.tsx
 * Local-first savings goals tracker.
 * - Displays active and completed savings goals
 * - Progress tracking towards target amounts with explicit remaining calculations
 * - Add new savings goal form, edit existing goal
 * - Add manual savings contributions
 * - Pure local storage, no remote telemetry
 */

import React, { useState, useEffect } from 'react';
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
  Target,
  X,
  Coins,
  Edit3,
  Trash2,
  Check,
  RotateCcw,
} from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { SavingsGoal } from '../types/database';
import { dbService } from '../database/DatabaseService';
import { useBalanceVisibility } from '../context/BalanceVisibilityContext';

interface SavingsGoalsScreenProps {
  navigation: any;
  isDark?: boolean;
}

export const SavingsGoalsScreen: React.FC<SavingsGoalsScreenProps> = ({
  navigation,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;
  const { formatAmount } = useBalanceVisibility();

  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'ACTIVE' | 'COMPLETED'>('ACTIVE');

  // Create / Edit Goal Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [savedAmount, setSavedAmount] = useState('');
  const [targetDate, setTargetDate] = useState('2026-12-31');

  // Contribute Modal
  const [contributeModalVisible, setContributeModalVisible] = useState(false);
  const [contributeGoal, setContributeGoal] = useState<SavingsGoal | null>(null);
  const [contributionInput, setContributionInput] = useState('');

  const loadGoals = async () => {
    try {
      setLoading(true);
      const items = await dbService.getSavingsGoals();
      setGoals(items);
    } catch (err) {
      console.error('Error loading savings goals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGoals();
    const unsubscribe = navigation.addListener?.('focus', loadGoals);
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [navigation]);

  const handleOpenCreateModal = () => {
    setEditingGoal(null);
    setTitle('');
    setTargetAmount('');
    setSavedAmount('');
    setTargetDate('2026-12-31');
    setModalVisible(true);
  };

  const handleOpenEditModal = (goal: SavingsGoal) => {
    setEditingGoal(goal);
    setTitle(goal.title);
    setTargetAmount(goal.targetAmount.toString());
    setSavedAmount(goal.savedAmount.toString());
    setTargetDate(goal.targetDate || '2026-12-31');
    setModalVisible(true);
  };

  const handleSaveGoal = async () => {
    const target = parseFloat(targetAmount);
    const saved = parseFloat(savedAmount) || 0;

    if (!title.trim() || isNaN(target) || target <= 0) {
      Alert.alert('Invalid Goal', 'Please enter a goal title and target amount.');
      return;
    }

    try {
      if (editingGoal) {
        await dbService.updateSavingsGoal(editingGoal.id, {
          title: title.trim(),
          targetAmount: target,
          savedAmount: saved,
          targetDate: targetDate || '2026-12-31',
        });
      } else {
        await dbService.createSavingsGoal({
          title: title.trim(),
          targetAmount: target,
          savedAmount: saved,
          targetDate: targetDate || '2026-12-31',
          iconName: 'Target',
          colorHex: '#10B981',
        });
      }

      setModalVisible(false);
      setEditingGoal(null);
      loadGoals();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save savings goal.');
    }
  };

  const handleOpenContributeModal = (goal: SavingsGoal) => {
    setContributeGoal(goal);
    setContributionInput('');
    setContributeModalVisible(true);
  };

  const handleSaveContribution = async () => {
    const amount = parseFloat(contributionInput);
    if (!contributeGoal || isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid contribution amount.');
      return;
    }

    try {
      await dbService.addSavingsContribution(contributeGoal.id, amount);
      setContributeModalVisible(false);
      setContributeGoal(null);
      setContributionInput('');
      loadGoals();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add contribution.');
    }
  };

  const handleToggleCompleted = async (goal: SavingsGoal) => {
    try {
      await dbService.updateSavingsGoal(goal.id, {
        isCompleted: !goal.isCompleted,
      });
      loadGoals();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update goal.');
    }
  };

  const handleDeleteGoal = (goal: SavingsGoal) => {
    Alert.alert(
      'Delete Goal',
      `Are you sure you want to delete "${goal.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await dbService.deleteSavingsGoal(goal.id);
              loadGoals();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete goal.');
            }
          },
        },
      ]
    );
  };

  const filteredGoals = goals.filter((g) =>
    filterTab === 'ACTIVE' ? !g.isCompleted : g.isCompleted
  );

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
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Savings Goals</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.primary }]}
          onPress={handleOpenCreateModal}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Plus size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs (Active vs Completed) */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[
            styles.tabButton,
            {
              backgroundColor: filterTab === 'ACTIVE' ? theme.primary : 'transparent',
            },
          ]}
          onPress={() => setFilterTab('ACTIVE')}
        >
          <Text
            style={[
              styles.tabText,
              {
                color: filterTab === 'ACTIVE' ? '#FFFFFF' : theme.textMuted,
                fontWeight:
                  filterTab === 'ACTIVE'
                    ? typography.fontWeight.bold
                    : typography.fontWeight.medium,
              },
            ]}
          >
            Active Goals ({goals.filter((g) => !g.isCompleted).length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabButton,
            {
              backgroundColor: filterTab === 'COMPLETED' ? theme.primary : 'transparent',
            },
          ]}
          onPress={() => setFilterTab('COMPLETED')}
        >
          <Text
            style={[
              styles.tabText,
              {
                color: filterTab === 'COMPLETED' ? '#FFFFFF' : theme.textMuted,
                fontWeight:
                  filterTab === 'COMPLETED'
                    ? typography.fontWeight.bold
                    : typography.fontWeight.medium,
              },
            ]}
          >
            Completed ({goals.filter((g) => g.isCompleted).length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : filteredGoals.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={[styles.emptyIconCircle, { backgroundColor: theme.primaryGlow }]}>
            <Target size={44} color={theme.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
            {filterTab === 'ACTIVE' ? 'No Active Goals' : 'No Completed Goals Yet'}
          </Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            {filterTab === 'ACTIVE'
              ? 'Set clear savings milestones (Emergency fund, vacation, electronics) to stay financially focused.'
              : 'Goals you complete or reach 100% will appear here for your financial history.'}
          </Text>
          {filterTab === 'ACTIVE' && (
            <TouchableOpacity
              style={[styles.createGoalBtn, { backgroundColor: theme.primary }]}
              onPress={handleOpenCreateModal}
            >
              <Plus size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.createGoalBtnText}>Set Your First Goal</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredGoals.map((goal) => {
            const progress = Math.min(
              1,
              Math.max(0, goal.savedAmount / (goal.targetAmount || 1))
            );
            const progressPercent = Math.round(progress * 100);
            const isFinished = progressPercent >= 100 || goal.isCompleted;
            const remaining = Math.max(0, goal.targetAmount - goal.savedAmount);

            return (
              <VaultCard key={goal.id} isDark={isDark} style={styles.goalCard}>
                {/* Header */}
                <View style={styles.goalHeaderRow}>
                  <View style={styles.goalTitleContainer}>
                    <Text style={[styles.goalTitle, { color: theme.textPrimary }]}>
                      {goal.title}
                    </Text>
                    <Text style={[styles.goalTargetDate, { color: theme.textMuted }]}>
                      Target Date: {goal.targetDate}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.percentPill,
                      {
                        backgroundColor: isFinished
                          ? theme.incomeBackground
                          : theme.surfaceHighlight,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.percentText,
                        { color: isFinished ? theme.income : theme.primary },
                      ]}
                    >
                      {progressPercent}%
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
                        backgroundColor: isFinished ? theme.income : theme.primary,
                        width: `${progressPercent}%`,
                      },
                    ]}
                  />
                </View>

                {/* Amounts Breakdown (Saved, Target, Remaining) */}
                <View style={styles.amountsRow}>
                  <View>
                    <Text style={[styles.amountLabel, { color: theme.textMuted }]}>Saved</Text>
                    <Text style={[styles.savedAmount, { color: theme.textPrimary }]}>
                      {formatAmount(goal.savedAmount)}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'center' }}>
                    <Text style={[styles.amountLabel, { color: theme.textMuted }]}>Target</Text>
                    <Text style={[styles.targetAmount, { color: theme.textSecondary }]}>
                      {formatAmount(goal.targetAmount)}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.amountLabel, { color: theme.textMuted }]}>
                      {isFinished ? 'Status' : 'Remaining'}
                    </Text>
                    <Text
                      style={[
                        styles.remainingAmount,
                        { color: isFinished ? theme.income : theme.warning },
                      ]}
                    >
                      {isFinished ? 'Completed 🎉' : formatAmount(remaining)}
                    </Text>
                  </View>
                </View>

                {/* Action Controls */}
                <View style={[styles.actionsRow, { borderTopColor: theme.surfaceBorder }]}>
                  {!goal.isCompleted && (
                    <TouchableOpacity
                      style={[styles.contributeBtn, { backgroundColor: theme.primaryGlow }]}
                      onPress={() => handleOpenContributeModal(goal)}
                    >
                      <Coins size={14} color={theme.primary} style={{ marginRight: 4 }} />
                      <Text style={[styles.contributeBtnText, { color: theme.primary }]}>
                        + Add Funds
                      </Text>
                    </TouchableOpacity>
                  )}

                  <View style={styles.rightActionsRow}>
                    <TouchableOpacity
                      style={styles.iconAction}
                      onPress={() => handleOpenEditModal(goal)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Edit3 size={15} color={theme.textSecondary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.iconAction}
                      onPress={() => handleToggleCompleted(goal)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      {goal.isCompleted ? (
                        <RotateCcw size={15} color={theme.primary} />
                      ) : (
                        <Check size={15} color={theme.income} />
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.iconAction}
                      onPress={() => handleDeleteGoal(goal)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Trash2 size={15} color={theme.expense} />
                    </TouchableOpacity>
                  </View>
                </View>
              </VaultCard>
            );
          })}
        </ScrollView>
      )}

      {/* Create / Edit Goal Modal */}
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
                {editingGoal ? 'Edit Savings Goal' : 'New Savings Goal'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalFieldLabel, { color: theme.textSecondary }]}>
              Goal Title
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
              placeholder="e.g. Emergency Fund"
              placeholderTextColor={theme.textMuted}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={[styles.modalFieldLabel, { color: theme.textSecondary }]}>
              Target Amount (ETB)
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
              placeholder="50,000"
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
              value={targetAmount}
              onChangeText={setTargetAmount}
            />

            <Text style={[styles.modalFieldLabel, { color: theme.textSecondary }]}>
              Already Saved (ETB, Optional)
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
              placeholder="0.00"
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
              value={savedAmount}
              onChangeText={setSavedAmount}
            />

            <Text style={[styles.modalFieldLabel, { color: theme.textSecondary }]}>
              Target Date (YYYY-MM-DD)
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
              placeholder="2026-12-31"
              placeholderTextColor={theme.textMuted}
              value={targetDate}
              onChangeText={setTargetDate}
            />

            <TouchableOpacity
              style={[styles.saveGoalBtn, { backgroundColor: theme.primary }]}
              onPress={handleSaveGoal}
            >
              <Text style={styles.saveGoalBtnText}>
                {editingGoal ? 'Update Goal' : 'Save Goal'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Contribution Modal */}
      <Modal visible={contributeModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
                Add Funds to {contributeGoal?.title}
              </Text>
              <TouchableOpacity onPress={() => setContributeModalVisible(false)}>
                <X size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalFieldLabel, { color: theme.textSecondary }]}>
              Quick Contribution (ETB)
            </Text>
            <View style={styles.quickChipsRow}>
              {[500, 1000, 2500, 5000].map((chip) => (
                <TouchableOpacity
                  key={chip}
                  style={[
                    styles.quickChip,
                    {
                      backgroundColor:
                        contributionInput === chip.toString()
                          ? theme.primary
                          : theme.surfaceHighlight,
                      borderColor: theme.surfaceBorder,
                    },
                  ]}
                  onPress={() => setContributionInput(chip.toString())}
                >
                  <Text
                    style={[
                      styles.quickChipText,
                      {
                        color:
                          contributionInput === chip.toString()
                            ? '#FFFFFF'
                            : theme.textPrimary,
                      },
                    ]}
                  >
                    +{chip.toLocaleString()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.modalFieldLabel, { color: theme.textSecondary }]}>
              Contribution Amount (ETB)
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
              placeholder="e.g. 1,000"
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
              value={contributionInput}
              onChangeText={setContributionInput}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.saveGoalBtn, { backgroundColor: theme.primary }]}
              onPress={handleSaveContribution}
            >
              <Text style={styles.saveGoalBtnText}>Deposit Funds</Text>
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
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: layout.screenPaddingHorizontal,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: borderRadius.pill,
  },
  tabText: {
    fontSize: typography.fontSize.xs,
  },
  scrollContent: {
    padding: layout.screenPaddingHorizontal,
    paddingBottom: 40,
  },
  goalCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  goalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  goalTitleContainer: {
    flex: 1,
  },
  goalTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  goalTargetDate: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  percentPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.pill,
  },
  percentText: {
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
  amountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  amountLabel: {
    fontSize: 10,
    marginBottom: 2,
  },
  savedAmount: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  targetAmount: {
    fontSize: typography.fontSize.sm,
  },
  remainingAmount: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    marginTop: spacing.md,
    paddingTop: spacing.xs,
  },
  contributeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.pill,
  },
  contributeBtnText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  rightActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconAction: {
    padding: 6,
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
    marginBottom: spacing.lg,
  },
  createGoalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
  },
  createGoalBtnText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
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
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  modalFieldLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    marginTop: spacing.xs,
    marginBottom: 4,
  },
  quickChipsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  quickChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    borderWidth: 1,
  },
  quickChipText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  modalInput: {
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.xs,
  },
  saveGoalBtn: {
    height: 48,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  saveGoalBtnText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
});
