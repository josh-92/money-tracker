/**
 * TransactionsScreen.tsx
 * Full ledger search and exploration screen.
 * - Search by merchant, category, notes, or amount
 * - Type filter pills: All, Expense, Income, Transfer
 * - Renders transactions using TransactionTile matching Figma style
 * - Seamless navigation to TransactionDetail
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Search,
  X,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
} from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { TransactionTile } from '../components/TransactionTile';
import { Transaction, TransactionType } from '../types/database';
import { dbService } from '../database/DatabaseService';

interface TransactionsScreenProps {
  route?: {
    params?: {
      autoFocusSearch?: boolean;
    };
  };
  navigation: any;
  isDark?: boolean;
}

type FilterType = 'ALL' | 'EXPENSE' | 'INCOME' | 'TRANSFER';

export const TransactionsScreen: React.FC<TransactionsScreenProps> = ({
  route,
  navigation,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const items = await dbService.getTransactions({ limit: 200 });
      setTransactions(items);
    } catch (err) {
      console.error('Error loading all transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
    const unsubscribe = navigation.addListener?.('focus', loadTransactions);
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [navigation]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Type filter
      if (activeFilter !== 'ALL' && tx.type !== activeFilter) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.toLowerCase().trim();
        const merchant = (tx.cleanMerchant || tx.merchantName || '').toLowerCase();
        const category = (tx.categoryName || '').toLowerCase();
        const notes = (tx.notes || '').toLowerCase();
        const amountStr = tx.amount.toString();

        return (
          merchant.includes(query) ||
          category.includes(query) ||
          notes.includes(query) ||
          amountStr.includes(query)
        );
      }

      return true;
    });
  }, [transactions, activeFilter, searchQuery]);

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
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>All Transactions</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: theme.surfaceHighlight,
              borderColor: theme.surfaceBorder,
            },
          ]}
        >
          <Search size={18} color={theme.textMuted} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: theme.textPrimary }]}
            placeholder="Search merchant, category, notes, amount..."
            placeholderTextColor={theme.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus={route?.params?.autoFocusSearch ?? false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={16} color={theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Chips Row */}
      <View style={styles.filterRow}>
        {(['ALL', 'EXPENSE', 'INCOME', 'TRANSFER'] as FilterType[]).map((tab) => {
          const isSelected = activeFilter === tab;
          const label =
            tab === 'ALL'
              ? 'All'
              : tab === 'EXPENSE'
              ? 'Expenses'
              : tab === 'INCOME'
              ? 'Income'
              : 'Transfers';

          return (
            <TouchableOpacity
              key={tab}
              style={[
                styles.filterChip,
                {
                  backgroundColor: isSelected ? theme.primary : theme.surfaceHighlight,
                  borderColor: isSelected ? theme.primary : theme.surfaceBorder,
                },
              ]}
              onPress={() => setActiveFilter(tab)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: isSelected ? '#FFFFFF' : theme.textSecondary },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Transactions List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : filteredTransactions.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>
            {searchQuery
              ? `No transactions matching "${searchQuery}"`
              : 'No transactions found in this category.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <VaultCard isDark={isDark} style={styles.ledgerCard}>
            {filteredTransactions.map((tx) => (
              <TransactionTile
                key={tx.id}
                transaction={tx}
                onPress={() =>
                  navigation.navigate('TransactionDetail', {
                    transaction: tx,
                    id: tx.id,
                  })
                }
                isDark={isDark}
              />
            ))}
          </VaultCard>
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
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  searchContainer: {
    paddingHorizontal: layout.screenPaddingHorizontal,
    paddingVertical: spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
  },
  searchIcon: {
    marginRight: spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    height: '100%',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: layout.screenPaddingHorizontal,
    paddingBottom: spacing.sm,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPaddingHorizontal,
    paddingBottom: 40,
  },
  ledgerCard: {
    padding: 0,
    overflow: 'hidden',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    fontSize: typography.fontSize.md,
    textAlign: 'center',
  },
});
