/**
 * ProfileScreen.tsx
 * Dedicated local profile management screen.
 * Editable fields: Name, Email, Phone Number.
 * 100% local-only vault data — no external cloud or OAuth accounts.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, User, Mail, Phone, CheckCircle } from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { dbService } from '../database/DatabaseService';
import { VaultProfile } from '../types/database';

interface ProfileScreenProps {
  navigation: any;
  isDark?: boolean;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  navigation,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [profile, setProfile] = useState<VaultProfile | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const p = await dbService.getVaultProfile();
    if (p) {
      setProfile(p);
      setFullName(p.fullName);
      setEmail(p.email);
      setPhoneNumber(p.phoneNumber || '');
    }
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      Alert.alert('Required', 'Please enter your name.');
      return;
    }
    setIsSaving(true);
    try {
      await dbService.updateVaultProfile({
        fullName: fullName.trim(),
        email: email.trim(),
        phoneNumber: phoneNumber.trim() || null,
      });
      Alert.alert('Saved', 'Your local profile details have been updated.');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarSection}>
          <View style={[styles.avatarCircle, { backgroundColor: theme.primary + '20', borderColor: theme.primary }]}>
            <User size={40} color={theme.primary} />
          </View>
          <Text style={[styles.avatarName, { color: theme.textPrimary }]}>{fullName || 'Vault Owner'}</Text>
          <Text style={[styles.avatarSubtitle, { color: theme.textSecondary }]}>Local Private Storage</Text>
        </View>

        <VaultCard isDark={isDark} style={styles.card}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Full Name</Text>
          <View style={[styles.inputRow, { backgroundColor: theme.surfaceHighlight, borderColor: theme.surfaceBorder }]}>
            <User size={18} color={theme.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: theme.textPrimary }]}
              value={fullName}
              onChangeText={setFullName}
              placeholder="e.g. Tanya Abebe"
              placeholderTextColor={theme.textMuted}
            />
          </View>

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Email Address</Text>
          <View style={[styles.inputRow, { backgroundColor: theme.surfaceHighlight, borderColor: theme.surfaceBorder }]}>
            <Mail size={18} color={theme.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: theme.textPrimary }]}
              value={email}
              onChangeText={setEmail}
              placeholder="e.g. tanya@example.com"
              placeholderTextColor={theme.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Phone Number</Text>
          <View style={[styles.inputRow, { backgroundColor: theme.surfaceHighlight, borderColor: theme.surfaceBorder }]}>
            <Phone size={18} color={theme.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: theme.textPrimary }]}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="e.g. 0911223344"
              placeholderTextColor={theme.textMuted}
              keyboardType="phone-pad"
            />
          </View>
        </VaultCard>

        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: theme.primary }]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <CheckCircle size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save Changes'}</Text>
        </TouchableOpacity>
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
    gap: spacing.md,
  },
  avatarSection: {
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  avatarName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  avatarSubtitle: {
    fontSize: typography.fontSize.xs,
  },
  card: {
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    marginTop: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    height: 48,
  },
  inputIcon: {
    marginRight: spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: typography.fontSize.sm,
  },
  saveButton: {
    height: 48,
    borderRadius: borderRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
});
