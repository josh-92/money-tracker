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
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
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
  Edit3,
  Check,
} from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { Transaction, Category } from '../types/database';
import { useBalanceVisibility } from '../context/BalanceVisibilityContext';
import { dbService } from '../database/DatabaseService';
import { ProviderLogo } from '../components/ProviderLogo';

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
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [remarkModalVisible, setRemarkModalVisible] = useState(false);
  const [remarkInput, setRemarkInput] = useState('');

  useEffect(() => {
    dbService.getCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (!transaction && route.params?.id) {
      dbService.getTransactionById(route.params.id).then(setTransaction);
    }
  }, [route.params]);

  const handleSelectCategory = async (category: Category) => {
    if (!transaction) return;
    try {
      await dbService.updateTransaction(transaction.id, { categoryId: category.id });
      setTransaction((prev) =>
        prev
          ? {
              ...prev,
              categoryId: category.id,
              categoryName: category.name,
              categoryColor: category.colorHex,
              userEditedAt: new Date().toISOString(),
            }
          : null
      );
      setCategoryModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update category.');
    }
  };

  const handleSaveRemark = async () => {
    if (!transaction) return;
    try {
      const trimmed = remarkInput.trim() || null;
      await dbService.updateTransaction(transaction.id, { notes: trimmed });
      setTransaction((prev) =>
        prev
          ? {
              ...prev,
              notes: trimmed,
              userEditedAt: new Date().toISOString(),
            }
          : null
      );
      setRemarkModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update remark.');
    }
  };

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

          <TouchableOpacity
            style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: theme.surfaceBorder, paddingTop: spacing.xs }]}
            onPress={() => setCategoryModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.detailLeft}>
              <Tag size={16} color={theme.income} />
              <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Category</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.detailValue, { color: theme.textPrimary }]}>
                {transaction.categoryName || 'Uncategorized'}
              </Text>
              <Edit3 size={13} color={theme.textMuted} />
            </View>
          </TouchableOpacity>

          <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: theme.surfaceBorder, paddingTop: spacing.xs }]}>
            <View style={styles.detailLeft}>
              <Calendar size={16} color={theme.warning} />
              <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Date & Time</Text>
            </View>
            <Text style={[styles.detailValue, { color: theme.textPrimary }]}>
              {formattedDate} • {formattedTime}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: theme.surfaceBorder, paddingTop: spacing.xs }]}
            onPress={() => {
              setRemarkInput(transaction.notes || '');
              setRemarkModalVisible(true);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.detailLeft}>
              <Info size={16} color={theme.textMuted} />
              <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Notes / Remark</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end' }}>
              <Text style={[styles.detailValue, { color: transaction.notes ? theme.textPrimary : theme.textMuted, maxWidth: '75%' }]} numberOfLines={1}>
                {transaction.notes || 'None (tap to add)'}
              </Text>
              <Edit3 size={13} color={theme.textMuted} />
            </View>
          </TouchableOpacity>
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

      {/* Category Selection Modal */}
      <Modal
        visible={categoryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIconCircle, { backgroundColor: theme.incomeBackground }]}>
                <Tag size={22} color={theme.income} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Change Category</Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                  Select category for this transaction
                </Text>
              </View>
            </View>

            <ScrollView style={styles.categoryList} showsVerticalScrollIndicator={false}>
              {categories.map((cat) => {
                const isSelected = transaction.categoryId === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryOption,
                      {
                        borderColor: isSelected ? theme.primary : theme.surfaceBorder,
                        backgroundColor: isSelected ? theme.primaryGlow : theme.surfaceHighlight,
                      },
                    ]}
                    onPress={() => handleSelectCategory(cat)}
                  >
                    <View
                      style={[
                        styles.categoryOptionCircle,
                        { backgroundColor: cat.colorHex + '25' },
                      ]}
                    >
                      <Tag size={16} color={cat.colorHex} />
                    </View>
                    <Text style={[styles.categoryOptionName, { color: theme.textPrimary, flex: 1 }]}>
                      {cat.name}
                    </Text>
                    {isSelected && <Check size={18} color={theme.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalCancelBtn, { borderColor: theme.surfaceBorder }]}
              onPress={() => setCategoryModalVisible(false)}
            >
              <Text style={[styles.modalCancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Remark / Notes Modal */}
      <Modal
        visible={remarkModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRemarkModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIconCircle, { backgroundColor: theme.primaryGlow }]}>
                <FileText size={22} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Transaction Remark / Notes</Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                  Personal notes, counterparty, or transaction purpose:
                </Text>
              </View>
            </View>

            <TextInput
              style={[
                styles.remarkInput,
                {
                  backgroundColor: theme.surfaceHighlight,
                  borderColor: theme.surfaceBorder,
                  color: theme.textPrimary,
                },
              ]}
              placeholder="e.g. Lunch with Abebe, Electricity bill, Salary transfer"
              placeholderTextColor={theme.textMuted}
              value={remarkInput}
              onChangeText={setRemarkInput}
              multiline
              numberOfLines={3}
              maxLength={200}
            />

            <View style={styles.modalActionButtonsRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: theme.surfaceBorder, flex: 1 }]}
                onPress={() => setRemarkModalVisible(false)}
              >
                <Text style={[styles.modalCancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: theme.primary, flex: 1 }]}
                onPress={handleSaveRemark}
              >
                <Text style={styles.modalSaveBtnText}>Save Remark</Text>
              </TouchableOpacity>
            </View>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: layout.screenPadding,
  },
  modalContent: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: spacing.md,
  },
  modalIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  modalSubtitle: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
    lineHeight: 16,
  },
  categoryList: {
    maxHeight: 280,
    marginVertical: spacing.sm,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  categoryOptionCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryOptionName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  remarkInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.fontSize.sm,
    minHeight: 80,
    textAlignVertical: 'top',
    marginVertical: spacing.md,
  },
  modalActionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalSaveBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: borderRadius.md,
  },
  modalSaveBtnText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  modalCancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginTop: spacing.xs,
  },
  modalCancelBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
});
