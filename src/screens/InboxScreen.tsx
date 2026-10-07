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
  Modal,
  Platform,
  AppState,
  TextInput,
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
  Wallet,
  Plus,
  BellRing,
  Tag,
  FileText,
  Check,
} from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { ProviderLogo } from '../components/ProviderLogo';
import { Transaction, Account, Category } from '../types/database';
import { dbService } from '../database/DatabaseService';
import { useBalanceVisibility } from '../context/BalanceVisibilityContext';
import { ingestionPipeline } from '../ingestion/IngestionPipeline';
import { notificationSource } from '../ingestion/sources/NotificationSource';
import { clipboardSource } from '../ingestion/sources/ClipboardSource';

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
  const [userAccounts, setUserAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningTx, setAssigningTx] = useState<Transaction | null>(null);
  const [categoryModalTx, setCategoryModalTx] = useState<Transaction | null>(null);
  const [remarkModalTx, setRemarkModalTx] = useState<Transaction | null>(null);
  const [remarkInput, setRemarkInput] = useState('');
  const [isPermissionGranted, setIsPermissionGranted] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      if (Platform.OS === 'android') {
        setIsPermissionGranted(notificationSource.isPermissionGranted());
        // Auto-check clipboard when viewing review inbox
        await clipboardSource.checkClipboard().catch(() => {});
      }
      const [items, accounts, cats] = await Promise.all([
        dbService.getTransactions({ status: 'PENDING_REVIEW', limit: 50 }),
        dbService.getAccounts(),
        dbService.getCategories(),
      ]);
      setPendingTransactions(items);
      setUserAccounts(accounts);
      setCategories(cats);
    } catch (err) {
      console.error('Error loading inbox data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsubscribeFocus = navigation.addListener?.('focus', loadData);
    const unsubscribeIngestion = ingestionPipeline.subscribe(() => {
      loadData();
    });
    const subAppState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        loadData();
      }
    });

    return () => {
      if (typeof unsubscribeFocus === 'function') unsubscribeFocus();
      unsubscribeIngestion();
      subAppState.remove();
    };
  }, [navigation]);

  const handleConfirm = async (tx: Transaction) => {
    if (!tx.accountId) {
      // Transaction has no matched account
      if (userAccounts.length === 0) {
        Alert.alert(
          'No Account Available',
          'You have not created any accounts yet. Please create an account in the Accounts tab before confirming this transaction into your ledger.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Manage Accounts',
              onPress: () => navigation.navigate('ManageAccountsModal'),
            },
          ]
        );
        return;
      }
      // Prompt user to select an account
      setAssigningTx(tx);
      return;
    }

    try {
      await dbService.confirmTransaction(tx.id);
      setPendingTransactions((prev) => prev.filter((item) => item.id !== tx.id));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to confirm transaction.');
    }
  };

  const handleAssignAndConfirm = async (account: Account) => {
    if (!assigningTx) return;
    try {
      await dbService.assignAccountToTransaction(assigningTx.id, account.id);
      await dbService.confirmTransaction(assigningTx.id);
      setPendingTransactions((prev) => prev.filter((item) => item.id !== assigningTx.id));
      setAssigningTx(null);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to assign account and confirm transaction.');
    }
  };

  const handleSelectCategory = async (category: Category) => {
    if (!categoryModalTx) return;
    try {
      await dbService.updateTransaction(categoryModalTx.id, { categoryId: category.id });
      setPendingTransactions((prev) =>
        prev.map((item) =>
          item.id === categoryModalTx.id
            ? {
                ...item,
                categoryId: category.id,
                categoryName: category.name,
                categoryColor: category.colorHex,
              }
            : item
        )
      );
      setCategoryModalTx(null);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update category.');
    }
  };

  const handleSaveRemark = async () => {
    if (!remarkModalTx) return;
    try {
      const trimmed = remarkInput.trim() || null;
      await dbService.updateTransaction(remarkModalTx.id, { notes: trimmed });
      setPendingTransactions((prev) =>
        prev.map((item) =>
          item.id === remarkModalTx.id
            ? { ...item, notes: trimmed }
            : item
        )
      );
      setRemarkModalTx(null);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update remark.');
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
          onPress={async () => {
            clipboardSource.resetCache();
            await loadData();
          }}
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
          {!isPermissionGranted && Platform.OS === 'android' && (
            <VaultCard isDark={isDark} style={styles.permissionBanner} variant="highlight">
              <View style={styles.permissionBannerRow}>
                <View style={[styles.permissionIconCircle, { backgroundColor: '#F59E0B20' }]}>
                  <BellRing size={20} color="#F59E0B" />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={[styles.permissionBannerTitle, { color: theme.textPrimary }]}>
                    Android Notification Access Disabled
                  </Text>
                  <Text style={[styles.permissionBannerBody, { color: theme.textSecondary }]}>
                    Enable access to automatically capture alerts from CBE, Telebirr, and Awash.
                  </Text>
                  <TouchableOpacity
                    style={styles.enableAccessButton}
                    onPress={() => notificationSource.openNotificationAccessSettings()}
                  >
                    <Text style={[styles.enableAccessButtonText, { color: theme.primary }]}>
                      Enable Notification Access →
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </VaultCard>
          )}
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
          {!isPermissionGranted && Platform.OS === 'android' && (
            <VaultCard isDark={isDark} style={[styles.permissionBanner, { marginBottom: spacing.md }]} variant="highlight">
              <View style={styles.permissionBannerRow}>
                <View style={[styles.permissionIconCircle, { backgroundColor: '#F59E0B20' }]}>
                  <BellRing size={20} color="#F59E0B" />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={[styles.permissionBannerTitle, { color: theme.textPrimary }]}>
                    Android Notification Access Disabled
                  </Text>
                  <Text style={[styles.permissionBannerBody, { color: theme.textSecondary }]}>
                    Enable access to automatically capture alerts from CBE, Telebirr, and Awash.
                  </Text>
                  <TouchableOpacity
                    style={styles.enableAccessButton}
                    onPress={() => notificationSource.openNotificationAccessSettings()}
                  >
                    <Text style={[styles.enableAccessButtonText, { color: theme.primary }]}>
                      Enable Notification Access →
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </VaultCard>
          )}
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
                    <ProviderLogo providerKey={tx.accountId ? (tx.accountName || 'CBE') : 'CUSTOM'} size={24} />
                    <View style={{ flexDirection: 'column' }}>
                      <Text style={[styles.accountLabel, { color: theme.textSecondary }]}>
                        {tx.accountId ? (tx.accountName || 'Primary Account') : 'Unassigned Account'}
                      </Text>
                      {!tx.accountId && (
                        <Text style={{ fontSize: 10, color: theme.warning, fontWeight: typography.fontWeight.medium }}>
                          Tap Confirm to assign
                        </Text>
                      )}
                    </View>
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

                {/* Category & Remark Quick Edit Badges */}
                <View style={styles.metaBadgeRow}>
                  <TouchableOpacity
                    style={[
                      styles.categoryBadge,
                      {
                        backgroundColor: (tx.categoryColor || theme.income) + '15',
                        borderColor: (tx.categoryColor || theme.income) + '35',
                      },
                    ]}
                    onPress={() => setCategoryModalTx(tx)}
                    activeOpacity={0.7}
                  >
                    <Tag size={12} color={tx.categoryColor || theme.income} />
                    <Text
                      style={[styles.categoryBadgeText, { color: tx.categoryColor || theme.income }]}
                      numberOfLines={1}
                    >
                      {tx.categoryName || 'Uncategorized'}
                    </Text>
                    <Edit3 size={10} color={tx.categoryColor || theme.income} style={{ marginLeft: 2 }} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.remarkBadge,
                      {
                        backgroundColor: theme.surfaceHighlight,
                        borderColor: theme.surfaceBorder,
                      },
                    ]}
                    onPress={() => {
                      setRemarkModalTx(tx);
                      setRemarkInput(tx.notes || '');
                    }}
                    activeOpacity={0.7}
                  >
                    <FileText size={12} color={theme.textMuted} />
                    <Text
                      style={[
                        styles.remarkBadgeText,
                        { color: tx.notes ? theme.textPrimary : theme.textMuted },
                      ]}
                      numberOfLines={1}
                    >
                      {tx.notes ? tx.notes : 'Add Remark'}
                    </Text>
                    <Edit3 size={10} color={theme.textMuted} style={{ marginLeft: 2 }} />
                  </TouchableOpacity>
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

      {/* Account Selection Modal for Unassigned Transactions */}
      <Modal
        visible={assigningTx !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setAssigningTx(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIconCircle, { backgroundColor: theme.primaryGlow }]}>
                <Wallet size={22} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Assign to Account</Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                  Select which account this {assigningTx?.cleanMerchant || 'transaction'} belongs to:
                </Text>
              </View>
            </View>

            <ScrollView style={styles.accountList} showsVerticalScrollIndicator={false}>
              {userAccounts.map((acc) => (
                <TouchableOpacity
                  key={acc.id}
                  style={[styles.accountOption, { borderColor: theme.surfaceBorder, backgroundColor: theme.surfaceHighlight }]}
                  onPress={() => handleAssignAndConfirm(acc)}
                >
                  <ProviderLogo providerKey={acc.providerKey} size={28} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.accountOptionName, { color: theme.textPrimary }]}>{acc.name}</Text>
                    <Text style={[styles.accountOptionMask, { color: theme.textMuted }]}>{acc.accountMask}</Text>
                  </View>
                  <Text style={[styles.assignActionText, { color: theme.primary }]}>Select</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalCancelBtn, { borderColor: theme.surfaceBorder }]}
              onPress={() => setAssigningTx(null)}
            >
              <Text style={[styles.modalCancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Category Selection Modal */}
      <Modal
        visible={categoryModalTx !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryModalTx(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIconCircle, { backgroundColor: theme.incomeBackground }]}>
                <Tag size={22} color={theme.income} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Assign Category</Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                  Select category for {categoryModalTx?.cleanMerchant || categoryModalTx?.merchantName || 'transaction'}
                </Text>
              </View>
            </View>

            <ScrollView style={styles.categoryList} showsVerticalScrollIndicator={false}>
              {categories.map((cat) => {
                const isSelected = categoryModalTx?.categoryId === cat.id;
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
              onPress={() => setCategoryModalTx(null)}
            >
              <Text style={[styles.modalCancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Remark / Notes Modal */}
      <Modal
        visible={remarkModalTx !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRemarkModalTx(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIconCircle, { backgroundColor: theme.primaryGlow }]}>
                <FileText size={22} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Transaction Remark</Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                  Add personal notes, counterparty reference, or purpose:
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
                onPress={() => setRemarkModalTx(null)}
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: layout.screenPaddingHorizontal,
  },
  modalContent: {
    width: '100%',
    maxHeight: '80%',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  modalSubtitle: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
    lineHeight: 16,
  },
  accountList: {
    maxHeight: 260,
    marginVertical: spacing.sm,
  },
  accountOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  accountOptionName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  accountOptionMask: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  assignActionText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  modalCancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginTop: spacing.sm,
  },
  modalCancelBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  permissionBanner: {
    marginBottom: spacing.md,
    width: '100%',
  },
  permissionBannerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  permissionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionBannerTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  permissionBannerBody: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
    lineHeight: 16,
  },
  enableAccessButton: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  enableAccessButtonText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  metaBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: spacing.xs,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    gap: 4,
    maxWidth: '48%',
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
  },
  remarkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    gap: 4,
    maxWidth: '48%',
  },
  remarkBadgeText: {
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
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
});
