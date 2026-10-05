/**
 * ManageAiApisScreen.tsx
 * Dedicated AI API configuration and operation permissions management.
 * - Multi-provider capable architecture (Google Gemini active)
 * - Safe key masking (never displays full key; e.g. `••••••••••••91K4`)
 * - Android Keystore-backed secure storage exclusively
 * - Model selector: gemini-3.8-flash, gemini-3.5-flash-lite, gemini-3.7-flash
 * - Granular internal AI feature permissions (Receipt, SMS fallback, Category, etc.)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Cpu,
  Key,
  CheckCircle,
  Plus,
  Trash2,
  Sliders,
  ShieldCheck,
} from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { vaultSecurity, AiFeatureSettings } from '../security/VaultSecurity';
import { aiService } from '../ai/AiService';
import {
  SUPPORTED_GEMINI_MODELS,
  DEFAULT_GEMINI_MODEL_ID,
  GeminiModelDefinition,
} from '../ai/GeminiConfig';

interface ManageAiApisScreenProps {
  navigation: any;
  isDark?: boolean;
}

export const ManageAiApisScreen: React.FC<ManageAiApisScreenProps> = ({
  navigation,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;

  const [hasApiKey, setHasApiKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState('');
  const [inputKey, setInputKey] = useState('');
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_GEMINI_MODEL_ID);
  const [isTesting, setIsTesting] = useState(false);

  const [aiSettings, setAiSettings] = useState<AiFeatureSettings>({
    receiptAiEnabled: true,
    unknownSmsFallbackEnabled: true,
    merchantNormalizationEnabled: true,
    categoryInferenceEnabled: true,
    spendingAnomalyEnabled: true,
    dashboardInsightsEnabled: true,
    monthlyAnalysisEnabled: true,
    monthlyRequestThreshold: 50,
  });

  useEffect(() => {
    loadAiConfig();
  }, []);

  const loadAiConfig = async () => {
    const key = await vaultSecurity.getGeminiApiKey();
    setHasApiKey(Boolean(key));
    if (key) {
      setMaskedKey(vaultSecurity.maskApiKey(key));
    }

    const model = await vaultSecurity.getGeminiModel();
    setSelectedModel(model);

    const settings = await vaultSecurity.getAiSettings();
    setAiSettings(settings);
  };

  const handleSaveKey = async () => {
    if (!inputKey.trim()) {
      Alert.alert('Required', 'Please enter your Google Gemini API key.');
      return;
    }
    await vaultSecurity.saveGeminiApiKey(inputKey.trim());
    await vaultSecurity.saveGeminiModel(selectedModel);
    setMaskedKey(vaultSecurity.maskApiKey(inputKey.trim()));
    setHasApiKey(true);
    setIsEditingKey(false);
    setInputKey('');
    Alert.alert('Key Saved', 'API key stored in Android Keystore-backed storage.');
    handleTestConnection();
  };

  const handleRemoveKey = () => {
    Alert.alert('Remove API Key', 'Are you sure you want to remove your Gemini API key from this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await vaultSecurity.deleteGeminiApiKey();
          setHasApiKey(false);
          setMaskedKey('');
          Alert.alert('Removed', 'Gemini API key has been securely removed.');
        },
      },
    ]);
  };

  const handleTestConnection = async () => {
    const key = await vaultSecurity.getGeminiApiKey();
    if (!key) {
      Alert.alert('No Key', 'Please configure an API key first.');
      return;
    }
    setIsTesting(true);
    const result = await aiService.testConnection(key, selectedModel);
    setIsTesting(false);

    if (result.success) {
      Alert.alert('Connection Successful', `Connected to ${selectedModel} in ${result.latencyMs}ms.`);
    } else {
      Alert.alert('Connection Failed', result.error || 'Check internet connection and API key validity.');
    }
  };

  const handleSelectModel = async (modelId: string) => {
    setSelectedModel(modelId);
    await vaultSecurity.saveGeminiModel(modelId);
  };

  const handleTogglePermission = async (key: keyof AiFeatureSettings, val: boolean) => {
    const updated = { ...aiSettings, [key]: val };
    setAiSettings(updated);
    await vaultSecurity.saveAiSettings(updated);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Manage AI APIs</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Provider Overview Card */}
        <VaultCard isDark={isDark} style={styles.card}>
          <View style={styles.providerRow}>
            <View style={styles.providerLeft}>
              <View style={[styles.providerIconContainer, { backgroundColor: theme.primary + '20' }]}>
                <Cpu size={24} color={theme.primary} />
              </View>
              <View style={{ marginLeft: spacing.sm }}>
                <Text style={[styles.providerName, { color: theme.textPrimary }]}>Google Gemini</Text>
                <Text style={[styles.providerStatus, { color: hasApiKey ? theme.income : theme.warning }]}>
                  ● {hasApiKey ? 'Active & Configured' : 'Key Needed'}
                </Text>
              </View>
            </View>

            <View style={styles.actionsRight}>
              {hasApiKey && (
                <TouchableOpacity
                  style={[styles.testButton, { borderColor: theme.surfaceBorder }]}
                  onPress={handleTestConnection}
                  disabled={isTesting}
                >
                  {isTesting ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <Text style={[styles.testButtonText, { color: theme.primary }]}>Test</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Masked Key Display */}
          <View style={[styles.keyDisplayRow, { backgroundColor: theme.surfaceHighlight, borderColor: theme.surfaceBorder }]}>
            <Key size={16} color={theme.textMuted} />
            <Text style={[styles.keyDisplayText, { color: theme.textPrimary }]}>
              {hasApiKey ? maskedKey : 'No key configured'}
            </Text>
            {hasApiKey && (
              <TouchableOpacity onPress={() => setIsEditingKey(true)}>
                <Text style={[styles.changeKeyText, { color: theme.primary }]}>Change</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* New / Edit Key Input */}
          {(!hasApiKey || isEditingKey) && (
            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Enter Google AI Studio Key</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                secureTextEntry
                placeholder="AIzaSy..."
                placeholderTextColor={theme.textMuted}
                value={inputKey}
                onChangeText={setInputKey}
              />
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.saveKeyBtn, { backgroundColor: theme.primary }]}
                  onPress={handleSaveKey}
                >
                  <Text style={styles.saveKeyText}>Save Key to Keystore</Text>
                </TouchableOpacity>
                {isEditingKey && (
                  <TouchableOpacity
                    style={[styles.cancelBtn, { borderColor: theme.surfaceBorder }]}
                    onPress={() => setIsEditingKey(false)}
                  >
                    <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {hasApiKey && !isEditingKey && (
            <TouchableOpacity style={styles.removeKeyLink} onPress={handleRemoveKey}>
              <Trash2 size={14} color={theme.expense} style={{ marginRight: 4 }} />
              <Text style={[styles.removeKeyText, { color: theme.expense }]}>Remove API Key</Text>
            </TouchableOpacity>
          )}
        </VaultCard>

        {/* Model Selection */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Active Gemini Model</Text>
        <View style={styles.modelsContainer}>
          {SUPPORTED_GEMINI_MODELS.map((m: GeminiModelDefinition) => {
            const isSelected = selectedModel === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                style={[
                  styles.modelCard,
                  {
                    backgroundColor: isSelected ? theme.surfaceHighlight : theme.surface,
                    borderColor: isSelected ? theme.primary : theme.surfaceBorder,
                  },
                ]}
                onPress={() => handleSelectModel(m.id)}
              >
                <View style={styles.modelHeader}>
                  <Text style={[styles.modelTitle, { color: isSelected ? theme.primary : theme.textPrimary }]}>
                    {m.name}
                  </Text>
                  {isSelected && <CheckCircle size={16} color={theme.primary} />}
                </View>
                <Text style={[styles.modelDesc, { color: theme.textSecondary }]}>{m.description}</Text>
                <View style={styles.tagRow}>
                  <Text style={[styles.tagText, { color: theme.primary }]}>🎯 {m.recommendedFor}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Internal AI Operation Permissions */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Controlled AI Feature Permissions</Text>
        <VaultCard isDark={isDark} style={styles.card}>
          <View style={styles.infoBanner}>
            <ShieldCheck size={16} color={theme.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.infoBannerText, { color: theme.textSecondary }]}>
              These controls restrict internal AI processing. AI has zero banking permissions and cannot access banking passwords, OTPs, or send money.
            </Text>
          </View>

          <View style={styles.permissionRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.permTitle, { color: theme.textPrimary }]}>Receipt AI Extraction</Text>
              <Text style={[styles.permDesc, { color: theme.textSecondary }]}>Multimodal extraction of paper receipts & invoices</Text>
            </View>
            <Switch
              value={aiSettings.receiptAiEnabled}
              onValueChange={(val) => handleTogglePermission('receiptAiEnabled', val)}
              trackColor={{ false: theme.surfaceBorder, true: theme.primary }}
            />
          </View>

          <View style={styles.permissionRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.permTitle, { color: theme.textPrimary }]}>Unknown SMS Parsing Fallback</Text>
              <Text style={[styles.permDesc, { color: theme.textSecondary }]}>Only calls Gemini when local regex patterns fail</Text>
            </View>
            <Switch
              value={aiSettings.unknownSmsFallbackEnabled}
              onValueChange={(val) => handleTogglePermission('unknownSmsFallbackEnabled', val)}
              trackColor={{ false: theme.surfaceBorder, true: theme.primary }}
            />
          </View>

          <View style={styles.permissionRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.permTitle, { color: theme.textPrimary }]}>Merchant Normalization</Text>
              <Text style={[styles.permDesc, { color: theme.textSecondary }]}>Cleans cryptic POS tags (e.g. Total Bole → TotalEnergies)</Text>
            </View>
            <Switch
              value={aiSettings.merchantNormalizationEnabled}
              onValueChange={(val) => handleTogglePermission('merchantNormalizationEnabled', val)}
              trackColor={{ false: theme.surfaceBorder, true: theme.primary }}
            />
          </View>

          <View style={styles.permissionRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.permTitle, { color: theme.textPrimary }]}>Category Inference</Text>
              <Text style={[styles.permDesc, { color: theme.textSecondary }]}>Auto-suggests category for unassigned transactions</Text>
            </View>
            <Switch
              value={aiSettings.categoryInferenceEnabled}
              onValueChange={(val) => handleTogglePermission('categoryInferenceEnabled', val)}
              trackColor={{ false: theme.surfaceBorder, true: theme.primary }}
            />
          </View>

          <View style={styles.permissionRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.permTitle, { color: theme.textPrimary }]}>Spending Anomaly Detection</Text>
              <Text style={[styles.permDesc, { color: theme.textSecondary }]}>Detects unusual expense spikes locally</Text>
            </View>
            <Switch
              value={aiSettings.spendingAnomalyEnabled}
              onValueChange={(val) => handleTogglePermission('spendingAnomalyEnabled', val)}
              trackColor={{ false: theme.surfaceBorder, true: theme.primary }}
            />
          </View>

          <View style={styles.permissionRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.permTitle, { color: theme.textPrimary }]}>End-of-Month Analysis</Text>
              <Text style={[styles.permDesc, { color: theme.textSecondary }]}>Concise monthly report based on pre-computed local numbers</Text>
            </View>
            <Switch
              value={aiSettings.monthlyAnalysisEnabled}
              onValueChange={(val) => handleTogglePermission('monthlyAnalysisEnabled', val)}
              trackColor={{ false: theme.surfaceBorder, true: theme.primary }}
            />
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
    paddingBottom: spacing.xl,
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
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  providerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerIconContainer: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  providerStatus: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  actionsRight: {
    flexDirection: 'row',
  },
  testButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
  },
  testButtonText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  keyDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    marginTop: spacing.xs,
  },
  keyDisplayText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: typography.fontSize.xs,
    flex: 1,
    marginHorizontal: spacing.xs,
  },
  changeKeyText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  inputContainer: {
    marginTop: spacing.xs,
  },
  inputLabel: {
    fontSize: typography.fontSize.xs,
    marginBottom: 4,
  },
  input: {
    height: 44,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    fontSize: typography.fontSize.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  saveKeyBtn: {
    flex: 1,
    height: 40,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveKeyText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  cancelBtn: {
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  removeKeyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
    paddingVertical: 4,
  },
  removeKeyText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  modelsContainer: {
    gap: spacing.xs,
  },
  modelCard: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  modelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  modelDesc: {
    fontSize: typography.fontSize.xs,
    marginTop: 4,
    lineHeight: 16,
  },
  tagRow: {
    marginTop: 6,
  },
  tagText: {
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
  },
  infoBanner: {
    flexDirection: 'row',
    padding: spacing.xs,
    backgroundColor: '#0066FF10',
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xs,
  },
  infoBannerText: {
    fontSize: 11,
    flex: 1,
    lineHeight: 15,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#33333315',
  },
  permTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  permDesc: {
    fontSize: 11,
    marginTop: 2,
  },
});
