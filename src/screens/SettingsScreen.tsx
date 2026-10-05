/**
 * SettingsScreen.tsx
 * Modular Settings Navigation Hub matching the approved information architecture:
 *
 * ACCOUNT
 *   Profile
 *   Account Security
 *
 * AI & GEMINI
 *   Manage AI APIs
 *   AI Usage / Controls
 *
 * APPEARANCE
 *   Theme
 *
 * DATA & PRIVACY
 *   Data Management
 *   Privacy
 *
 * SUPPORT
 *   Donate
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  User,
  Shield,
  Cpu,
  BarChart3,
  Moon,
  Database,
  Lock,
  Heart,
  ChevronRight,
  EyeOff,
  BellRing,
} from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { dbService } from '../database/DatabaseService';
import { vaultSecurity } from '../security/VaultSecurity';
import { VaultProfile } from '../types/database';

interface SettingsScreenProps {
  navigation: any;
  isDark: boolean;
  onToggleTheme: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  navigation,
  isDark,
  onToggleTheme,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;
  const [profile, setProfile] = useState<VaultProfile | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      dbService.getVaultProfile().then(setProfile);
      vaultSecurity.getGeminiApiKey().then((k) => setHasApiKey(Boolean(k)));
    });
    return unsubscribe;
  }, [navigation]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Card Header */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Profile')}
        >
          <VaultCard isDark={isDark} variant="highlight" style={styles.profileCard}>
            <View style={styles.profileRow}>
              <View style={[styles.avatarCircle, { backgroundColor: theme.primary + '25', borderColor: theme.primary }]}>
                <User size={26} color={theme.primary} />
              </View>
              <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                <Text style={[styles.profileName, { color: theme.textPrimary }]}>
                  {profile?.fullName || 'Vault Owner'}
                </Text>
                <Text style={[styles.profileSubtitle, { color: theme.textSecondary }]}>
                  {profile?.email || 'Local Storage Vault'}
                </Text>
              </View>
              <ChevronRight size={18} color={theme.textMuted} />
            </View>
          </VaultCard>
        </TouchableOpacity>

        {/* --- ACCOUNT SECTION --- */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Account</Text>
        <VaultCard isDark={isDark} style={styles.groupCard}>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => navigation.navigate('Profile')}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#3B82F620' }]}>
              <User size={18} color="#3B82F6" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={[styles.menuTitle, { color: theme.textPrimary }]}>Profile</Text>
              <Text style={[styles.menuSubtitle, { color: theme.textSecondary }]}>Name, email, phone number</Text>
            </View>
            <ChevronRight size={16} color={theme.textMuted} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: theme.surfaceBorder }]} />

          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => navigation.navigate('AccountSecurity')}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#10B98120' }]}>
              <Shield size={18} color="#10B981" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={[styles.menuTitle, { color: theme.textPrimary }]}>Account Security</Text>
              <Text style={[styles.menuSubtitle, { color: theme.textSecondary }]}>Password, PIN, Biometrics, Auto-Lock</Text>
            </View>
            <ChevronRight size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </VaultCard>

        {/* --- AI & GEMINI SECTION --- */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>AI & Gemini</Text>
        <VaultCard isDark={isDark} style={styles.groupCard}>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => navigation.navigate('ManageAiApis')}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#8B5CF620' }]}>
              <Cpu size={18} color="#8B5CF6" />
            </View>
            <View style={styles.menuTextContainer}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.menuTitle, { color: theme.textPrimary }]}>Manage AI APIs</Text>
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: hasApiKey ? theme.incomeBackground : theme.warningBackground },
                  ]}
                >
                  <Text style={[styles.statusPillText, { color: hasApiKey ? theme.income : theme.warning }]}>
                    {hasApiKey ? 'Active' : 'Unset'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.menuSubtitle, { color: theme.textSecondary }]}>Gemini keys, models, feature permissions</Text>
            </View>
            <ChevronRight size={16} color={theme.textMuted} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: theme.surfaceBorder }]} />

          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => navigation.navigate('AiUsage')}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#F59E0B20' }]}>
              <BarChart3 size={18} color="#F59E0B" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={[styles.menuTitle, { color: theme.textPrimary }]}>AI Usage & Controls</Text>
              <Text style={[styles.menuSubtitle, { color: theme.textSecondary }]}>Local request logs & token audit</Text>
            </View>
            <ChevronRight size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </VaultCard>

        {/* --- APPEARANCE SECTION --- */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Appearance</Text>
        <VaultCard isDark={isDark} style={styles.groupCard}>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => navigation.navigate('Appearance')}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#EC489920' }]}>
              <Moon size={18} color="#EC4899" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={[styles.menuTitle, { color: theme.textPrimary }]}>Theme</Text>
              <Text style={[styles.menuSubtitle, { color: theme.textSecondary }]}>
                {isDark ? 'Obsidian Dark (Active)' : 'Crisp Light (Active)'}
              </Text>
            </View>
            <ChevronRight size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </VaultCard>

        {/* --- DATA & PRIVACY SECTION --- */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Data & Privacy</Text>
        <VaultCard isDark={isDark} style={styles.groupCard}>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => navigation.navigate('DataManagement')}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#00D09E20' }]}>
              <Database size={18} color="#00D09E" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={[styles.menuTitle, { color: theme.textPrimary }]}>Data Management</Text>
              <Text style={[styles.menuSubtitle, { color: theme.textSecondary }]}>Export backup, storage footprint, ledger resets</Text>
            </View>
            <ChevronRight size={16} color={theme.textMuted} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: theme.surfaceBorder }]} />

          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => navigation.navigate('PrivacySettings')}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#6366F120' }]}>
              <EyeOff size={18} color="#6366F1" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={[styles.menuTitle, { color: theme.textPrimary }]}>Privacy & Balances</Text>
              <Text style={[styles.menuSubtitle, { color: theme.textSecondary }]}>Hide balances by default, OS protection</Text>
            </View>
            <ChevronRight size={16} color={theme.textMuted} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: theme.surfaceBorder }]} />

          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => navigation.navigate('TransactionDetection')}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#3B82F620' }]}>
              <BellRing size={18} color="#3B82F6" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={[styles.menuTitle, { color: theme.textPrimary }]}>Transaction Detection</Text>
              <Text style={[styles.menuSubtitle, { color: theme.textSecondary }]}>
                Live notifications, clipboard, CBE, Telebirr & Awash
              </Text>
            </View>
            <ChevronRight size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </VaultCard>

        {/* --- SUPPORT SECTION --- */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Support</Text>
        <VaultCard isDark={isDark} style={styles.groupCard}>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => navigation.navigate('Donate')}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#EF444420' }]}>
              <Heart size={18} color="#EF4444" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={[styles.menuTitle, { color: theme.textPrimary }]}>Support & Donate</Text>
              <Text style={[styles.menuSubtitle, { color: theme.textSecondary }]}>Support continued development ❤️</Text>
            </View>
            <ChevronRight size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </VaultCard>

        <View style={styles.appFooter}>
          <Text style={[styles.appVersion, { color: theme.textMuted }]}>
            MoneyTracker v1.0.0 • Offline Private Vault
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  scrollContent: {
    padding: layout.screenPadding,
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  profileCard: {
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  profileSubtitle: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  sectionHeader: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
    marginBottom: 2,
    marginLeft: 4,
  },
  groupCard: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextContainer: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  menuTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  menuSubtitle: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  statusPill: {
    marginLeft: spacing.xs,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.pill,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  divider: {
    height: 1,
    marginLeft: 48,
  },
  appFooter: {
    alignItems: 'center',
    marginTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  appVersion: {
    fontSize: 11,
  },
});
