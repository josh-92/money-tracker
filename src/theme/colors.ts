/**
 * Color Design Tokens
 * Reused and adapted strictly from the BankPick / Moneet 43+ Screen Figma UI Kit.
 * Features intentional, high-contrast Obsidian Dark and Crisp Light palettes.
 */

export interface ColorTheme {
  // Backgrounds
  background: string;
  backgroundSecondary: string;
  surface: string;
  surfaceHighlight: string;
  surfaceBorder: string;

  // Typography
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Accents & Actions
  primary: string;
  primaryLight: string;
  primaryGlow: string;

  // Financial Semantics
  income: string;
  incomeBackground: string;
  expense: string;
  expenseBackground: string;
  transfer: string;
  transferBackground: string;
  warning: string;
  warningBackground: string;

  // UI Components
  cardOverlay: string;
  iconContainer: string;
  iconContainerActive: string;
  pillInactive: string;
  pillActive: string;
  divider: string;
  backdrop: string;
}

export const darkTheme: ColorTheme = {
  // Deep Obsidian Dark from Figma inspiration
  background: '#161622',
  backgroundSecondary: '#12121A',
  surface: '#1E1E2D',
  surfaceHighlight: '#232533',
  surfaceBorder: '#2B2B3E',

  textPrimary: '#FFFFFF',
  textSecondary: '#A2A8B0',
  textMuted: '#7E848D',

  // Electric Blue Accent
  primary: '#0066FF',
  primaryLight: '#3385FF',
  primaryGlow: 'rgba(0, 102, 255, 0.25)',

  // Financial Semantics
  income: '#22C55E',
  incomeBackground: 'rgba(34, 197, 94, 0.12)',
  expense: '#FFFFFF', // In Figma kit, expenses are clean white with "-" prefix
  expenseBackground: 'rgba(255, 255, 255, 0.05)',
  transfer: '#38BDF8',
  transferBackground: 'rgba(56, 189, 248, 0.12)',
  warning: '#F59E0B',
  warningBackground: 'rgba(245, 158, 11, 0.12)',

  cardOverlay: 'rgba(255, 255, 255, 0.03)',
  iconContainer: '#232533',
  iconContainerActive: '#0066FF',
  pillInactive: '#1E1E2D',
  pillActive: '#0066FF',
  divider: '#2B2B3E',
  backdrop: 'rgba(10, 10, 15, 0.75)',
};

export const lightTheme: ColorTheme = {
  // Clean Crisp Light from Figma inspiration
  background: '#FAFAFA',
  backgroundSecondary: '#F4F5F7',
  surface: '#FFFFFF',
  surfaceHighlight: '#F0F2F5',
  surfaceBorder: '#E5E7EB',

  textPrimary: '#1E1E2D',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',

  // Electric Blue Accent
  primary: '#0066FF',
  primaryLight: '#3385FF',
  primaryGlow: 'rgba(0, 102, 255, 0.15)',

  // Financial Semantics
  income: '#16A34A',
  incomeBackground: 'rgba(22, 163, 74, 0.10)',
  expense: '#1E1E2D',
  expenseBackground: 'rgba(30, 30, 45, 0.05)',
  transfer: '#0284C7',
  transferBackground: 'rgba(2, 132, 199, 0.10)',
  warning: '#D97706',
  warningBackground: 'rgba(217, 119, 6, 0.10)',

  cardOverlay: 'rgba(0, 0, 0, 0.02)',
  iconContainer: '#F0F2F5',
  iconContainerActive: '#0066FF',
  pillInactive: '#F0F2F5',
  pillActive: '#0066FF',
  divider: '#E5E7EB',
  backdrop: 'rgba(0, 0, 0, 0.50)',
};

// Ethiopian Provider Brand Colors
export const providerBrands = {
  cbe: {
    primary: '#7B1FA2', // CBE Purple / Gold identity
    secondary: '#F59E0B',
    badge: 'CBE',
    fullName: 'Commercial Bank of Ethiopia',
  },
  telebirr: {
    primary: '#00A3E0', // Telebirr Cyan / Blue identity
    secondary: '#FFCC00',
    badge: 'telebirr',
    fullName: 'Ethio Telecom Telebirr',
  },
  awash: {
    primary: '#006A4E', // Awash Forest Green identity
    secondary: '#F59E0B',
    badge: 'Awash',
    fullName: 'Awash Bank',
  },
  cash: {
    primary: '#10B981', // Emerald green
    secondary: '#059669',
    badge: 'Cash',
    fullName: 'Physical Cash Wallet',
  },
};
