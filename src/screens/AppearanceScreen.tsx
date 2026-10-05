/**
 * AppearanceScreen.tsx
 * Dedicated Appearance & Theme management screen.
 * Options: Obsidian Dark, Crisp Light, System Default.
 * Both themes intentionally grounded in the Figma design system.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Moon, Sun, Monitor, CheckCircle } from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { dbService } from '../database/DatabaseService';

interface AppearanceScreenProps {
  navigation: any;
  isDark: boolean;
  onToggleTheme: () => void;
}

export const AppearanceScreen: React.FC<AppearanceScreenProps> = ({
  navigation,
  isDark,
  onToggleTheme,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;
  const [selectedPref, setSelectedPref] = useState<'dark' | 'light' | 'system'>('dark');

  useEffect(() => {
    dbService.getVaultProfile().then((p) => {
      if (p?.themePreference) {
        setSelectedPref(p.themePreference);
      }
    });
  }, []);

  const handleSelect = async (pref: 'dark' | 'light' | 'system') => {
    setSelectedPref(pref);
    await dbService.updateVaultProfile({ themePreference: pref });
    if ((pref === 'dark' && !isDark) || (pref === 'light' && isDark)) {
      onToggleTheme();
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Appearance</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Theme Selection</Text>

        <VaultCard isDark={isDark} style={styles.card}>
          {/* Obsidian Dark */}
          <TouchableOpacity
            style={[
              styles.optionRow,
              {
                borderColor: selectedPref === 'dark' ? theme.primary : theme.surfaceBorder,
                backgroundColor: selectedPref === 'dark' ? theme.surfaceHighlight : 'transparent',
              },
            ]}
            onPress={() => handleSelect('dark')}
          >
            <View style={styles.optionLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#1E293B' }]}>
                <Moon size={20} color="#00D09E" />
              </View>
              <View style={{ marginLeft: spacing.sm }}>
                <Text style={[styles.optionTitle, { color: theme.textPrimary }]}>Obsidian Dark</Text>
                <Text style={[styles.optionDesc, { color: theme.textSecondary }]}>Deep blacks with emerald & neon accents</Text>
              </View>
            </View>
            {selectedPref === 'dark' && <CheckCircle size={18} color={theme.primary} />}
          </TouchableOpacity>

          {/* Crisp Light */}
          <TouchableOpacity
            style={[
              styles.optionRow,
              {
                borderColor: selectedPref === 'light' ? theme.primary : theme.surfaceBorder,
                backgroundColor: selectedPref === 'light' ? theme.surfaceHighlight : 'transparent',
              },
            ]}
            onPress={() => handleSelect('light')}
          >
            <View style={styles.optionLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#F1F5F9' }]}>
                <Sun size={20} color="#F59E0B" />
              </View>
              <View style={{ marginLeft: spacing.sm }}>
                <Text style={[styles.optionTitle, { color: theme.textPrimary }]}>Crisp Light</Text>
                <Text style={[styles.optionDesc, { color: theme.textSecondary }]}>High contrast surfaces & crisp readability</Text>
              </View>
            </View>
            {selectedPref === 'light' && <CheckCircle size={18} color={theme.primary} />}
          </TouchableOpacity>

          {/* System Default */}
          <TouchableOpacity
            style={[
              styles.optionRow,
              {
                borderColor: selectedPref === 'system' ? theme.primary : theme.surfaceBorder,
                backgroundColor: selectedPref === 'system' ? theme.surfaceHighlight : 'transparent',
              },
            ]}
            onPress={() => handleSelect('system')}
          >
            <View style={styles.optionLeft}>
              <View style={[styles.iconCircle, { backgroundColor: theme.surfaceHighlight }]}>
                <Monitor size={20} color={theme.primary} />
              </View>
              <View style={{ marginLeft: spacing.sm }}>
                <Text style={[styles.optionTitle, { color: theme.textPrimary }]}>System Default</Text>
                <Text style={[styles.optionDesc, { color: theme.textSecondary }]}>Follow device display mode</Text>
              </View>
            </View>
            {selectedPref === 'system' && <CheckCircle size={18} color={theme.primary} />}
          </TouchableOpacity>
        </VaultCard>
      </View>
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
  content: {
    padding: layout.screenPadding,
  },
  sectionHeader: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  card: {
    gap: spacing.xs,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  optionDesc: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
});
