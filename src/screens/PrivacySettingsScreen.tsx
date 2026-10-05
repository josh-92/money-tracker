/**
 * PrivacySettingsScreen.tsx
 * Dedicated Privacy & Balance Visibility settings screen.
 * - Global "Hide balances by default" configuration
 * - Active screen capture / app-switcher protection status
 * - Zero analytics telemetry policy disclosure
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, EyeOff, Eye, Shield, Lock, Smartphone } from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { vaultSecurity } from '../security/VaultSecurity';
import { dbService } from '../database/DatabaseService';
import { useBalanceVisibility } from '../context/BalanceVisibilityContext';

interface PrivacySettingsScreenProps {
  navigation: any;
  isDark?: boolean;
}

export const PrivacySettingsScreen: React.FC<PrivacySettingsScreenProps> = ({
  navigation,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;
  const { setBalanceHidden } = useBalanceVisibility();

  const [hideBalancesByDefault, setHideBalancesByDefault] = useState(false);

  useEffect(() => {
    loadPreference();
  }, []);

  const loadPreference = async () => {
    const profile = await dbService.getVaultProfile();
    if (profile?.hideBalancesByDefault !== undefined) {
      setHideBalancesByDefault(Boolean(profile.hideBalancesByDefault));
    } else {
      const pref = await vaultSecurity.getHideBalancesPreference();
      setHideBalancesByDefault(pref);
    }
  };

  const handleToggleHideByDefault = async (val: boolean) => {
    setHideBalancesByDefault(val);
    setBalanceHidden(val);
    await vaultSecurity.saveHideBalancesPreference(val);
    await dbService.updateVaultProfile({ hideBalancesByDefault: val });
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Display Privacy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Balance Privacy Card */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Financial Values</Text>
        <VaultCard isDark={isDark} style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.rowLeft}>
              {hideBalancesByDefault ? (
                <EyeOff size={20} color={theme.primary} />
              ) : (
                <Eye size={20} color={theme.textPrimary} />
              )}
              <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                <Text style={[styles.itemTitle, { color: theme.textPrimary }]}>Hide balances by default</Text>
                <Text style={[styles.itemSubtitle, { color: theme.textSecondary }]}>
                  {hideBalancesByDefault
                    ? 'Balances appear as •••••••• until tapped'
                    : 'Balances visible on launch'}
                </Text>
              </View>
            </View>
            <Switch
              value={hideBalancesByDefault}
              onValueChange={handleToggleHideByDefault}
              trackColor={{ false: theme.surfaceBorder, true: theme.primary }}
            />
          </View>
        </VaultCard>

        {/* Anti-Surveillance Safeguards */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Operating System Safeguards</Text>
        <VaultCard isDark={isDark} style={styles.card}>
          <View style={styles.safeguardItem}>
            <Smartphone size={20} color={theme.income} />
            <View style={{ marginLeft: spacing.sm, flex: 1 }}>
              <Text style={[styles.itemTitle, { color: theme.textPrimary }]}>Android FLAG_SECURE Active</Text>
              <Text style={[styles.itemSubtitle, { color: theme.textSecondary }]}>
                Operating system screenshots are prevented and recent-apps preview thumbnail is masked with a blank screen.
              </Text>
            </View>
          </View>

          <View style={[styles.safeguardItem, { borderTopWidth: 1, borderTopColor: theme.surfaceBorder, paddingTop: spacing.sm }]}>
            <Lock size={20} color={theme.primary} />
            <View style={{ marginLeft: spacing.sm, flex: 1 }}>
              <Text style={[styles.itemTitle, { color: theme.textPrimary }]}>Local Private Storage</Text>
              <Text style={[styles.itemSubtitle, { color: theme.textSecondary }]}>
                100% on-device SQLite ledger. Zero external tracker telemetry, zero cloud synchronizers, zero analytics beacons.
              </Text>
            </View>
          </View>
        </VaultCard>
      </ScrollView>
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
  scrollContent: {
    padding: layout.screenPadding,
    gap: spacing.sm,
  },
  sectionHeader: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: 4,
  },
  card: {
    gap: spacing.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  itemSubtitle: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
    lineHeight: 16,
  },
  safeguardItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
