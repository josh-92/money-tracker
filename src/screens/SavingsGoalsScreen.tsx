/**
 * SavingsGoalsScreen.tsx
 * Local-first savings goals tracker.
 * - Displays active and completed savings goals
 * - Progress tracking towards target amounts
 * - Add new savings goal form
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
  CheckCircle2,
  Calendar,
  X,
  TrendingUp,
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
  const [modalVisible, setModalVisible] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [savedAmount, setSavedAmount] = useState('');
  const [targetDate, setTargetDate] = useState('2026-12-31');

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

  const handleCreateGoal = async () => {
    const target = parseFloat(targetAmount);
    const initialSaved = parseFloat(savedAmount) || 0;

    if (!title.trim() || isNaN(target) || target <= 0) {
      Alert.alert('Invalid Goal', 'Please enter a goal title and target amount.');
      return;
    }

    try {
      await dbService.createSavingsGoal({
        title: title.trim(),
        targetAmount: target,
        savedAmount: initialSaved,
        targetDate: targetDate || '2026-12-31',
        iconName: 'Target',
        colorHex: '#10B981',
      });

      setTitle('');
      setTargetAmount('');
      setSavedAmount('');
      setModalVisible(false);
      loadGoals();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create savings goal.');
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
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Savings Goals</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.primary }]}
          onPress={() => setModalVisible(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Plus size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : goals.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={[styles.emptyIconCircle, { backgroundColor: theme.primaryGlow }]}>
            <Target size={44} color={theme.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No Savings Goals Yet</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            Set clear savings milestones (Emergency fund, vacation, electronics) to stay financially focused.
          </Text>
          <TouchableOpacity
            style={[styles.createGoalBtn, { backgroundColor: theme.primary }]}
            onPress={() => setModalVisible(true)}
          >
            <Plus size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.createGoalBtnText}>Set Your First Goal</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {goals.map((goal) => {
            const progress = Math.min(
              1,
              Math.max(0, goal.savedAmount / (goal.targetAmount || 1))
            );
            const progressPercent = Math.round(progress * 100);
            const isFinished = progressPercent >= 100;

            return (
              <VaultCard key={goal.id} isDark={isDark} style={styles.goalCard}>
                <View style={styles.goalHeaderRow}>
                  <View style={styles.goalTitleContainer}>
                    <Text style={[styles.goalTitle, { color: theme.textPrimary }]}>
                      {goal.title}
                    </Text>
                    <Text style={[styles.goalTargetDate, { color: theme.textMuted }]}>
                      Target: {goal.targetDate}
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

                {/* Amounts Breakdown */}
                <View style={styles.amountsRow}>
                  <Text style={[styles.savedAmount, { color: theme.textPrimary }]}>
                    {formatAmount(goal.savedAmount)}
                  </Text>
                  <Text style={[styles.targetAmount, { color: theme.textSecondary }]}>
                    of {formatAmount(goal.targetAmount)}
                  </Text>
                </View>
              </VaultCard>
            );
          })}
        </ScrollView>
      )}

      {/* Add Goal Modal */}
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
                New Savings Goal
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
              onPress={handleCreateGoal}
            >
              <Text style={styles.saveGoalBtnText}>Save Goal</Text>
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
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  savedAmount: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  targetAmount: {
    fontSize: typography.fontSize.xs,
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
  modalInput: {
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: typography.fontSize.sm,
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
