/**
 * TransactionTile.tsx
 * Transaction list row matching the Figma kit item styling.
 * 44px Circular category avatar, bold clean typography, right-aligned amount.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { Transaction } from '../types/database';
import { useBalanceVisibility } from '../context/BalanceVisibilityContext';

interface TransactionTileProps {
  transaction: Transaction;
  onPress?: () => void;
  isDark?: boolean;
}

export const TransactionTile: React.FC<TransactionTileProps> = ({
  transaction,
  onPress,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;
  const { isBalanceHidden } = useBalanceVisibility();

  const isIncome = transaction.type === 'INCOME';
  const isTransfer = transaction.type === 'TRANSFER';
  const isOpening = transaction.type === 'OPENING_BALANCE';

  const amountPrefix = isIncome ? '+ ' : isTransfer ? '⇄ ' : isOpening ? '' : '- ';
  const amountColor = isIncome
    ? theme.primary
    : isTransfer
    ? theme.transfer
    : isOpening
    ? theme.income
    : theme.expense;

  const formattedAmount = isBalanceHidden
    ? `${amountPrefix}•••••••• ETB`
    : `${amountPrefix}${transaction.amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} ETB`;

  const dateObj = new Date(transaction.timestamp);
  const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <TouchableOpacity
      style={[styles.container, { borderBottomColor: theme.divider }]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
    >
      <View
        style={[
          styles.avatar,
          {
            backgroundColor: transaction.categoryColor || theme.iconContainer,
          },
        ]}
      >
        <Text style={styles.avatarInitial}>
          {(transaction.cleanMerchant || transaction.merchantName).charAt(0).toUpperCase()}
        </Text>
      </View>

      <View style={styles.infoContainer}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
            {transaction.cleanMerchant || transaction.merchantName}
          </Text>
          {transaction.status === 'PENDING_REVIEW' && (
            <View style={[styles.statusBadge, { backgroundColor: theme.warningBackground }]}>
              <Text style={[styles.statusText, { color: theme.warning }]}>Review</Text>
            </View>
          )}
        </View>

        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {transaction.categoryName || 'Uncategorized'} • {timeStr}
        </Text>
      </View>

      <View style={styles.amountContainer}>
        <Text style={[styles.amount, { color: amountColor }]}>{formattedAmount}</Text>
        <Text style={[styles.sourceText, { color: theme.textMuted }]}>
          {transaction.source.toLowerCase()}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  avatar: {
    width: layout.transactionAvatarSize,
    height: layout.transactionAvatarSize,
    borderRadius: layout.transactionAvatarSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    marginRight: spacing.xs,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.xs,
  },
  statusText: {
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  amountContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  amount: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  sourceText: {
    fontSize: typography.fontSize.xs,
    textTransform: 'capitalize',
    marginTop: 2,
  },
});
