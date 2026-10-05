/**
 * AccountCard.tsx
 * Horizontal swipeable balance card matching the Figma card style.
 * Displays provider identity, masked account, and real-time calculated balance.
 */

import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { borderRadius, spacing, layout } from '../theme/spacing';
import { typography } from '../theme/typography';
import { Account } from '../types/database';
import { useBalanceVisibility } from '../context/BalanceVisibilityContext';

import { ProviderLogo } from './ProviderLogo';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - layout.screenPaddingHorizontal * 2;

interface AccountCardProps {
  account: Account;
  isDark?: boolean;
}

export const AccountCard: React.FC<AccountCardProps> = ({ account }) => {
  const { formatAmount } = useBalanceVisibility();
  const balance = account.calculatedBalance ?? account.openingBalance ?? 0;

  return (
    <View style={[styles.card, { backgroundColor: account.colorHex }]}>
      {/* Decorative background overlay */}
      <View style={styles.overlayCircleTop} />
      <View style={styles.overlayCircleBottom} />

      <View style={styles.headerRow}>
        <View>
          <Text style={styles.accountName} numberOfLines={1}>
            {account.name}
          </Text>
          <Text style={styles.accountMask}>{account.accountMask}</Text>
        </View>
        <View style={styles.providerBadge}>
          <ProviderLogo providerKey={account.providerKey} size={20} containerBackground={false} />
          <Text style={styles.providerBadgeText}>{account.providerKey}</Text>
        </View>
      </View>

      <View style={styles.balanceContainer}>
        <Text style={styles.balanceLabel}>Current Balance</Text>
        <Text style={styles.balanceAmount}>
          {formatAmount(balance, account.currency)}
        </Text>
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.footerLabel}>STATUS: ACTIVE</Text>
        <Text style={styles.footerBrand}>MONEY TRACKER</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: layout.accountCardHeight,
    borderRadius: borderRadius.card,
    padding: spacing.xl,
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
  },
  overlayCircleTop: {
    position: 'absolute',
    top: -50,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  overlayCircleBottom: {
    position: 'absolute',
    bottom: -60,
    left: -30,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  accountName: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  accountMask: {
    color: 'rgba(255, 255, 255, 0.70)',
    fontSize: typography.fontSize.sm,
    letterSpacing: typography.letterSpacing.wide,
    marginTop: 2,
  },
  providerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.pill,
    gap: 6,
  },
  providerBadgeText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.5,
  },
  balanceContainer: {
    marginVertical: spacing.xs,
  },
  balanceLabel: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: typography.fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    letterSpacing: typography.letterSpacing.tight,
    marginTop: 2,
  },
  currency: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLabel: {
    color: 'rgba(255, 255, 255, 0.60)',
    fontSize: 10,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0.5,
  },
  footerBrand: {
    color: 'rgba(255, 255, 255, 0.50)',
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 1.0,
  },
});
