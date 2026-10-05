/**
 * Spacing, Elevation and Border Radius Tokens
 * Faithfully maps the 20-24px rounded cards, 48px circular pills,
 * and component spacing from the BankPick / Moneet Figma kit.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
};

export const borderRadius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  card: 24, // Exact Figma card border radius
  pill: 9999, // For pill badges and 48px circular buttons
};

export const layout = {
  screenPadding: 20,
  screenPaddingHorizontal: 20,
  headerHeight: 60,
  bottomBarHeight: 76,
  actionButtonSize: 48, // Circular icon buttons in row
  accountCardHeight: 188, // Horizontal swipeable balance card
  transactionAvatarSize: 44, // List tile icon avatar
};

export const elevation = {
  light: {
    card: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 2,
    },
    floating: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 20,
      elevation: 6,
    },
  },
  dark: {
    card: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
      elevation: 3,
    },
    floating: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.50,
      shadowRadius: 24,
      elevation: 8,
    },
  },
};
