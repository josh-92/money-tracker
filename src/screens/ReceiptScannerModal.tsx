/**
 * ReceiptScannerModal.tsx
 * End-to-end receipt scanning pipeline matching the approved architecture:
 * Camera/Gallery -> Downsample (1024px, JPEG 80%) -> Gemini Multimodal Extraction ->
 * Review & Correction UI -> Proximity Duplicate Check -> Save / Merge.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Image as ImageIcon, CheckCircle, AlertCircle, X, Merge } from 'lucide-react-native';
import { spacing, borderRadius, layout } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { aiService, ExtractedReceiptData } from '../ai/AiService';
import { dbService } from '../database/DatabaseService';
import { Account, Transaction, MatchResult } from '../types/database';

interface ReceiptScannerModalProps {
  navigation: any;
  isDark?: boolean;
}

export const ReceiptScannerModal: React.FC<ReceiptScannerModalProps> = ({
  navigation,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedReceiptData | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('acc_telebirr');

  // 4-tier duplicate match state
  const [matchingTx, setMatchingTx] = useState<Transaction | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);

  React.useEffect(() => {
    dbService.getAccounts().then((accs) => {
      setAccounts(accs);
      if (accs.length > 0) setSelectedAccountId(accs[0].id);
    });
  }, []);

  const handlePickImage = async (fromCamera: boolean) => {
    try {
      const permission = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Permission Denied', 'Camera / Gallery access is required to scan paper receipts.');
        return;
      }

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 1, allowsEditing: false })
        : await ImagePicker.launchImageLibraryAsync({ quality: 1, allowsEditing: false });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        setImageUri(uri);
        processReceiptWithGemini(uri);
      }
    } catch (err: any) {
      Alert.alert('Image Error', err.message || 'Failed to select image.');
    }
  };

  const processReceiptWithGemini = async (uri: string) => {
    setIsProcessing(true);
    setMatchingTx(null);
    setMatchResult(null);
    try {
      const result = await aiService.parseReceipt(uri);
      if (result.status === 'SUCCESS' || (result.status === 'UNCERTAIN' && result.data)) {
        const data = result.data!;
        setExtractedData(data);

        // Check for duplicate in SQLite ledger using 4-tier matching engine
        const matchRes = await dbService.findMatchingTransaction({
          amount: data.totalAmount,
          timestamp: data.transactionDate || new Date().toISOString(),
          cleanMerchant: data.merchantName,
          toleranceMinutes: 120,
        });

        if (matchRes.matchFound && matchRes.transaction) {
          setMatchingTx(matchRes.transaction);
          setMatchResult(matchRes);
        }
      } else {
        const errDesc =
          result.errorMessage ||
          (result.validationErrors.length > 0 ? result.validationErrors.join('; ') : 'Gemini could not parse this receipt.');
        Alert.alert('Extraction Notice', errDesc);
      }
    } catch (err: any) {
      Alert.alert('Extraction Notice', err.message || 'Gemini could not parse this receipt.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveTransaction = async (mergeWithExisting = false) => {
    if (!extractedData) return;

    try {
      if (mergeWithExisting && matchingTx) {
        // Merge into existing transaction: updates merchant and attaches receipt data
        await dbService.confirmTransaction(matchingTx.id, {
          cleanMerchant: extractedData.merchantName,
          notes: `Receipt attached. Items: ${extractedData.items.map((i) => `${i.name} (${i.totalPrice} ETB)`).join(', ')}`,
        });
        Alert.alert('Merged!', `Successfully attached receipt items to ${matchingTx.accountName} transaction.`);
      } else {
        // Create new transaction with full audit trail preserved
        await dbService.createTransaction({
          accountId: selectedAccountId,
          amount: extractedData.totalAmount,
          type: 'EXPENSE',
          merchantName: extractedData.merchantName,
          cleanMerchant: extractedData.merchantName,
          source: 'RECEIPT',
          status: 'CONFIRMED',
          timestamp: new Date().toISOString(),
          rawSourceMessage: JSON.stringify(extractedData),
          confidenceScore: 0.95,
          aiOperationUsed: 'RECEIPT',
          originalAmount: extractedData.totalAmount,
          originalMerchantName: extractedData.merchantName,
          notes: `Receipt tax: ${extractedData.taxAmount} ETB. Items: ${extractedData.items.length}`,
        });
        Alert.alert('Saved!', 'New transaction recorded from receipt.');
      }
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save receipt transaction.');
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.topBar}>
        <Text style={[styles.topBarTitle, { color: theme.textPrimary }]}>Scan Receipt</Text>
        <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
          <X size={22} color={theme.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Step 1: Capture or Gallery Buttons */}
        {!imageUri && (
          <View style={styles.captureOptionsContainer}>
            <View style={[styles.scannerPlaceholder, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
              <Camera size={48} color={theme.textMuted} />
              <Text style={[styles.placeholderTitle, { color: theme.textPrimary }]}>Snap or Upload Receipt</Text>
              <Text style={[styles.placeholderSubtitle, { color: theme.textSecondary }]}>
                Takes a clear photo of your paper receipt or POS slip. Gemini automatically extracts line items and amounts.
              </Text>

              <View style={styles.buttonsRow}>
                <TouchableOpacity
                  style={[styles.cameraButton, { backgroundColor: theme.primary }]}
                  onPress={() => handlePickImage(true)}
                >
                  <Camera size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.cameraButtonText}>Take Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.galleryButton, { backgroundColor: theme.surfaceHighlight, borderColor: theme.surfaceBorder }]}
                  onPress={() => handlePickImage(false)}
                >
                  <ImageIcon size={18} color={theme.textPrimary} style={{ marginRight: 6 }} />
                  <Text style={[styles.galleryButtonText, { color: theme.textPrimary }]}>Choose Gallery</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Step 2: Processing Spinner */}
        {isProcessing && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.textPrimary }]}>
              Downsampling & Extracting with Gemini...
            </Text>
            <Text style={[styles.loadingSubtext, { color: theme.textSecondary }]}>
              Compressing image on-device to save your data and API quota.
            </Text>
          </View>
        )}

        {/* Step 3: Receipt Review & Line Item Editor */}
        {imageUri && !isProcessing && extractedData && (
          <View>
            {/* Image Thumbnail Preview */}
            <View style={styles.previewCard}>
              <Image source={{ uri: imageUri }} style={styles.thumbnailImage} />
              <TouchableOpacity
                style={[styles.retakeButton, { backgroundColor: theme.surfaceHighlight }]}
                onPress={() => setImageUri(null)}
              >
                <Text style={[styles.retakeButtonText, { color: theme.textPrimary }]}>Retake Photo</Text>
              </TouchableOpacity>
            </View>

            {/* 4-Tier Match Alert Banner */}
            {matchingTx && matchResult && (
              <VaultCard isDark={isDark} style={styles.matchCard} variant="highlight">
                <View style={styles.matchRow}>
                  <Merge size={22} color={theme.primary} style={{ marginRight: spacing.sm }} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={[styles.matchTitle, { color: theme.primary }]}>Matching Transaction Found</Text>
                      <View
                        style={{
                          backgroundColor:
                            matchResult.confidence === 'EXACT_REFERENCE'
                              ? theme.incomeBackground
                              : theme.warningBackground,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderRadius: borderRadius.pill,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: 'bold',
                            color:
                              matchResult.confidence === 'EXACT_REFERENCE'
                                ? theme.income
                                : theme.warning,
                          }}
                        >
                          {matchResult.confidence === 'EXACT_REFERENCE'
                            ? 'EXACT REF MATCH'
                            : matchResult.confidence === 'HIGH_METADATA'
                            ? 'HIGH METADATA MATCH'
                            : 'PROXIMITY (±2h)'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.matchBody, { color: theme.textSecondary }]}>
                      {matchResult.matchReason}
                    </Text>
                    <Text style={[styles.matchBody, { color: theme.textPrimary, marginTop: 4, fontWeight: '600' }]}>
                      {matchingTx.amount} ETB on {matchingTx.accountName}
                    </Text>
                    <View style={styles.matchButtonsRow}>
                      <TouchableOpacity
                        style={[styles.mergeButton, { backgroundColor: theme.primary }]}
                        onPress={() => handleSaveTransaction(true)}
                      >
                        <Text style={styles.mergeButtonText}>Merge Receipt</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.separateButton, { borderColor: theme.surfaceBorder }]}
                        onPress={() => {
                          setMatchingTx(null);
                          setMatchResult(null);
                        }}
                      >
                        <Text style={[styles.separateButtonText, { color: theme.textSecondary }]}>Keep Separate</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </VaultCard>
            )}

            {/* Editable Extracted Fields */}
            <VaultCard isDark={isDark} style={styles.reviewCard}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Merchant Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                value={extractedData.merchantName}
                onChangeText={(text) => setExtractedData({ ...extractedData, merchantName: text })}
              />

              <View style={styles.rowFields}>
                <View style={{ flex: 1, marginRight: spacing.sm }}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Total Amount (ETB)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                    keyboardType="numeric"
                    value={String(extractedData.totalAmount)}
                    onChangeText={(val) =>
                      setExtractedData({ ...extractedData, totalAmount: parseFloat(val) || 0 })
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Tax (ETB)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.surfaceHighlight, color: theme.textPrimary, borderColor: theme.surfaceBorder }]}
                    keyboardType="numeric"
                    value={String(extractedData.taxAmount)}
                    onChangeText={(val) =>
                      setExtractedData({ ...extractedData, taxAmount: parseFloat(val) || 0 })
                    }
                  />
                </View>
              </View>

              {/* Account Selector */}
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Charged Account</Text>
              <View style={styles.accountPillsRow}>
                {accounts.map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[
                      styles.accountPill,
                      {
                        backgroundColor: selectedAccountId === acc.id ? theme.primary : theme.surfaceHighlight,
                        borderColor: selectedAccountId === acc.id ? theme.primary : theme.surfaceBorder,
                      },
                    ]}
                    onPress={() => setSelectedAccountId(acc.id)}
                  >
                    <Text
                      style={[
                        styles.accountPillText,
                        { color: selectedAccountId === acc.id ? '#FFFFFF' : theme.textPrimary },
                      ]}
                    >
                      {acc.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Line Items Preview */}
              {extractedData.items.length > 0 && (
                <View style={styles.itemsSection}>
                  <Text style={[styles.itemsHeader, { color: theme.textSecondary }]}>Extracted Items</Text>
                  {extractedData.items.map((it, idx) => (
                    <View key={idx} style={[styles.itemRow, { borderBottomColor: theme.divider }]}>
                      <Text style={[styles.itemName, { color: theme.textPrimary }]}>
                        {it.name} (x{it.quantity})
                      </Text>
                      <Text style={[styles.itemPrice, { color: theme.textPrimary }]}>
                        {it.totalPrice} ETB
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </VaultCard>

            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: theme.primary }]}
              onPress={() => handleSaveTransaction(false)}
            >
              <CheckCircle size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.saveButtonText}>Confirm & Add Transaction</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: layout.screenPaddingHorizontal,
    paddingVertical: spacing.md,
  },
  topBarTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  closeButton: {
    padding: spacing.xs,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPaddingHorizontal,
    paddingBottom: spacing['4xl'],
  },
  captureOptionsContainer: {
    marginTop: spacing.xl,
  },
  scannerPlaceholder: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: borderRadius.card,
    padding: spacing['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginTop: spacing.md,
  },
  placeholderSubtitle: {
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cameraButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.pill,
  },
  cameraButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  galleryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
  },
  galleryButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  loadingContainer: {
    paddingVertical: spacing['4xl'],
    alignItems: 'center',
  },
  loadingText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    marginTop: spacing.md,
  },
  loadingSubtext: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  thumbnailImage: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.sm,
  },
  retakeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.pill,
  },
  retakeButtonText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  matchCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
    borderColor: '#0066FF',
  },
  matchRow: {
    flexDirection: 'row',
  },
  matchTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 2,
  },
  matchBody: {
    fontSize: typography.fontSize.xs,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  matchButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  mergeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.pill,
  },
  mergeButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  separateButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
  },
  separateButtonText: {
    fontSize: typography.fontSize.xs,
  },
  reviewCard: {
    padding: spacing.base,
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    height: 44,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    fontSize: typography.fontSize.sm,
    borderWidth: 1,
  },
  rowFields: {
    flexDirection: 'row',
  },
  accountPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  accountPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
  },
  accountPillText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  itemsSection: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  itemsHeader: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
  },
  itemName: {
    fontSize: typography.fontSize.xs,
  },
  itemPrice: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: borderRadius.pill,
    elevation: 3,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
});
