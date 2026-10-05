/**
 * VaultCard.tsx
 * High-radius container matching the 24px rounded card design
 * in the BankPick / Moneet Figma UI Kit.
 */

import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { borderRadius, spacing } from '../theme/spacing';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';

interface VaultCardProps {
  children: React.ReactNode;
  isDark?: boolean;
  style?: StyleProp<ViewStyle>;
  variant?: 'surface' | 'highlight' | 'accent';
}

export const VaultCard: React.FC<VaultCardProps> = ({
  children,
  isDark = true,
  style,
  variant = 'surface',
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;

  const backgroundColor =
    variant === 'highlight'
      ? theme.surfaceHighlight
      : variant === 'accent'
      ? theme.primary
      : theme.surface;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor,
          borderColor: theme.surfaceBorder,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.card,
    padding: spacing.base,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
