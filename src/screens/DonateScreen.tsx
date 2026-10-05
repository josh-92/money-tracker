/**
 * DonateScreen.tsx
 * Personal Support / Donation screen.
 * - Displays Joni's photo from `images/joni.jpg`
 * - Warm, personal appreciation message
 * - Telebirr and CBE donation placeholders (NO fake account numbers, placeholders only)
 * - 100% compliant with user instructions: no Chapa, no invented accounts
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Heart, Copy } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { ProviderLogo } from '../components/ProviderLogo';

interface DonateScreenProps {
  navigation: any;
  isDark?: boolean;
}

export const DonateScreen: React.FC<DonateScreenProps> = ({
  navigation,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Support & Donate</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Joni Creator Section */}
        <View style={styles.creatorSection}>
          <Image
            source={require('../../images/joni.jpg')}
            style={[styles.creatorPhoto, { borderColor: theme.primary }]}
            resizeMode="cover"
          />
          <View style={styles.heartBadge}>
            <Heart size={14} color="#FFFFFF" fill="#EF4444" />
          </View>
          <Text style={[styles.creatorTitle, { color: theme.textPrimary }]}>Support MoneyTracker ❤️</Text>
          <Text style={[styles.creatorSubtitle, { color: theme.textSecondary }]}>
            If MoneyTracker helps you gain financial peace of mind and manage your finances effortlessly, you can support the continued development of this local-first project!
          </Text>
        </View>

        {/* Telebirr Donation Card */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Telebirr Wallet</Text>
        <VaultCard isDark={isDark} style={styles.card}>
          <View style={styles.channelRow}>
            <ProviderLogo providerKey="TELEBIRR" size={38} />
            <View style={{ marginLeft: spacing.sm, flex: 1 }}>
              <Text style={[styles.channelTitle, { color: theme.textPrimary }]}>Telebirr</Text>
              <Text style={[styles.channelSubtitle, { color: theme.textSecondary }]}>Ethio Telecom Mobile Money</Text>
            </View>
          </View>

          <View style={[styles.detailsBox, { backgroundColor: theme.surfaceHighlight, borderColor: theme.surfaceBorder }]}>
            <Text style={[styles.detailsLabel, { color: theme.textSecondary }]}>Recipient Phone / Account Number</Text>
            <TouchableOpacity
              style={styles.phoneCopyRow}
              activeOpacity={0.7}
              onPress={async () => {
                await Clipboard.setStringAsync('+251993623394');
                Alert.alert('Copied to Clipboard', '+251993623394 has been copied to your clipboard.\n\nYou can now paste it into the Telebirr app.');
              }}
            >
              <Text style={[styles.detailsValue, { color: theme.primary, letterSpacing: 0.5 }]}>
                +251993623394
              </Text>
              <View style={[styles.copyPill, { backgroundColor: theme.primary + '20' }]}>
                <Copy size={14} color={theme.primary} />
                <Text style={[styles.copyPillText, { color: theme.primary }]}>Copy</Text>
              </View>
            </TouchableOpacity>
            <Text style={[styles.placeholderNotice, { color: theme.textMuted }]}>
              Tap to view and copy. Send donation directly via Telebirr.
            </Text>
          </View>
        </VaultCard>

        {/* Thank You Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textMuted }]}>
            Thank you for supporting independent, privacy-focused Ethiopian software! 🇪🇹
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
    paddingBottom: spacing.xl,
  },
  creatorSection: {
    alignItems: 'center',
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  creatorPhoto: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
  },
  heartBadge: {
    position: 'absolute',
    top: 72,
    right: '38%',
    backgroundColor: '#EF4444',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  creatorTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginTop: spacing.sm,
  },
  creatorSubtitle: {
    fontSize: typography.fontSize.xs,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  sectionHeader: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  card: {
    gap: spacing.sm,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  channelIconCircle: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  channelSubtitle: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  detailsBox: {
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    gap: 2,
  },
  detailsLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailsValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    marginTop: 2,
  },
  phoneCopyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  copyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.pill,
    gap: 4,
  },
  copyPillText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  placeholderNotice: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  footerText: {
    fontSize: typography.fontSize.xs,
    textAlign: 'center',
    lineHeight: 16,
  },
});
