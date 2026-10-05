/**
 * Typography Tokens
 * Reused from the Figma UI Kit.
 * Focuses on clean geometric sans-serif styling with prominent financial metrics.
 */

export const typography = {
  fontFamily: {
    regular: 'System',
    medium: 'System',
    semibold: 'System',
    bold: 'System',
    mono: 'monospace',
  },

  fontSize: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 19,
    xl: 22,
    xxl: 26,
    '2xl': 26,
    '3xl': 30,
    currencyHero: 36,
  },

  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },

  lineHeight: {
    tight: 1.15,
    normal: 1.35,
    relaxed: 1.5,
  },

  letterSpacing: {
    normal: 0,
    tight: -0.5,
    tighter: -1.0,
    wide: 0.5,
  },
};
