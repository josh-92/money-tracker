/**
 * ActionButton.tsx
 * 48px Circular icon button with label below.
 * Faithful reproduction of the circular action row in the Figma home screen.
 */

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { spacing, layout } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  isDark?: boolean;
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  icon,
  label,
  onPress,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: theme.iconContainer,
            borderColor: theme.surfaceBorder,
          },
        ]}
      >
        {icon}
      </View>
      <Text
        style={[
          styles.label,
          {
            color: theme.textSecondary,
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  iconCircle: {
    width: layout.actionButtonSize,
    height: layout.actionButtonSize,
    borderRadius: layout.actionButtonSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    textAlign: 'center',
  },
});
