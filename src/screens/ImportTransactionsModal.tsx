/**
 * ImportTransactionsModal.tsx
 * Historical SMS Statement & Multi-SMS Batch Ingestion Modal.
 * 
 * Features:
 * - Direct paste or "Paste from Clipboard" for multiple banking messages at once.
 * - Real-time pre-flight preview showing parsed amounts, merchants, and duplicate warnings.
 * - Batch execution through IngestionPipeline.
 * - Stores imported transactions into PENDING_REVIEW queue with complete audit trail.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import {
  X,
  ClipboardPaste,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Layers,
} from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { ProviderLogo } from '../components/ProviderLogo';
import { IngestionPipeline } from '../ingestion/IngestionPipeline';
import { RegexParser, ParsedBankNotification } from '../ingestion/RegexParser';
import { dbService } from '../database/DatabaseService';
import { CandidateMessage } from '../ingestion/types';

interface Props {
  navigation: any;
  isDark?: boolean;
}

interface PreviewItem {
  raw: CandidateMessage;
  parsed: ParsedBankNotification | null;
  isDuplicate: boolean;
  duplicateReason?: string;
}

export const ImportTransactionsModal: React.FC<Props> = ({
  navigation,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;

  const [rawText, setRawText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  const handlePasteClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        setRawText((prev) => (prev ? `${prev}\n\n${text}` : text));
      }
    } catch {
      Alert.alert('Clipboard Error', 'Unable to paste from device clipboard.');
    }
  };

  const handleAnalyze = async () => {
    if (!rawText.trim()) {
      Alert.alert('Empty Text', 'Please paste one or more bank SMS messages first.');
      return;
    }

    try {
      setAnalyzing(true);
      const candidates = IngestionPipeline.splitBatchSms(rawText, 'HISTORICAL_IMPORT');

      if (candidates.length === 0) {
        Alert.alert(
          'No Valid Messages',
          'Could not find any recognizable bank transaction messages in the pasted text.'
        );
        return;
      }

      const items: PreviewItem[] = [];

      for (const cand of candidates) {
        const parsed = RegexParser.parse(cand.rawText, cand.senderHint);
        let isDuplicate = false;
        let duplicateReason: string | undefined;

        if (parsed) {
          const matchResult = await dbService.findMatchingTransaction({
            amount: parsed.amount,
            timestamp: parsed.timestamp || cand.timestamp,
            refNumber: parsed.refNumber,
            transactionNumber: parsed.transactionNumber,
            cleanMerchant: parsed.cleanMerchant,
            toleranceMinutes: 120,
          });

          if (matchResult.matchFound) {
            isDuplicate = true;
            duplicateReason = matchResult.matchReason;
          }
        }

        items.push({
          raw: cand,
          parsed,
          isDuplicate,
          duplicateReason,
        });
      }

      setPreviews(items);
      setHasAnalyzed(true);
    } catch (err: any) {
      Alert.alert('Analysis Failed', err.message || 'Error parsing batch SMS.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleExecuteImport = async (directToLedger: boolean) => {
    try {
      setImporting(true);
      const candidatesToImport = previews
        .filter((p) => p.parsed && !p.isDuplicate)
        .map((p) => p.raw);

      if (candidatesToImport.length === 0) {
        Alert.alert('No New Transactions', 'All detected transactions are either already in your ledger or invalid.');
        return;
      }

      const pipeline = IngestionPipeline.getInstance();
      const batchResult = await pipeline.ingestBatch(candidatesToImport, directToLedger);

      const title = directToLedger ? 'Ledger Import Complete' : 'Inbox Staging Complete';
      const detailMessage = directToLedger
        ? `Successfully confirmed and added ${batchResult.confirmed} transaction${batchResult.confirmed !== 1 ? 's' : ''} directly to your active ledger.\n\n${batchResult.duplicatesSkipped} duplicate${batchResult.duplicatesSkipped !== 1 ? 's' : ''} skipped.`
        : `Successfully queued ${batchResult.pendingReview} transaction${batchResult.pendingReview !== 1 ? 's' : ''} into your Review Inbox.\n\n${batchResult.duplicatesSkipped} duplicate${batchResult.duplicatesSkipped !== 1 ? 's' : ''} skipped.`;

      Alert.alert(
        title,
        detailMessage,
        [
          {
            text: directToLedger ? 'View Transactions' : 'Go to Inbox',
            onPress: () => {
              navigation.goBack();
              if (directToLedger) {
                navigation.navigate('Transactions');
              } else {
                navigation.navigate('Inbox');
              }
            },
          },
          {
            text: 'Done',
            onPress: () => navigation.goBack(),
            style: 'cancel',
          },
        ]
      );
    } catch (err: any) {
      Alert.alert('Import Failed', err.message || 'Error storing transactions into vault.');
    } finally {
      setImporting(false);
    }
  };

  const validNewCount = previews.filter((p) => p.parsed && !p.isDuplicate).length;
  const duplicateCount = previews.filter((p) => p.isDuplicate).length;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
        <View style={{ width: 32 }} />
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>
          Batch SMS Import
        </Text>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={22} color={theme.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.instructions, { color: theme.textSecondary }]}>
          Copy multiple SMS messages from your SMS app (CBE, Telebirr, or Awash) and paste them here. The deterministic engine will extract transactions and skip duplicates automatically.
        </Text>

        {/* Input Box */}
        <VaultCard isDark={isDark} style={styles.inputCard}>
          <TextInput
            style={[styles.textInput, { color: theme.textPrimary }]}
            placeholder="Paste bank SMS messages here..."
            placeholderTextColor={theme.textMuted}
            multiline
            numberOfLines={6}
            value={rawText}
            onChangeText={(txt) => {
              setRawText(txt);
              setHasAnalyzed(false);
            }}
          />

          <View style={[styles.inputActions, { borderTopColor: theme.surfaceBorder }]}>
            <TouchableOpacity
              style={[styles.actionChip, { backgroundColor: theme.surfaceHighlight }]}
              onPress={handlePasteClipboard}
            >
              <ClipboardPaste size={14} color={theme.primary} />
              <Text style={[styles.actionChipText, { color: theme.primary }]}>Paste Clipboard</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryAnalyzeBtn, { backgroundColor: theme.primary }]}
              onPress={handleAnalyze}
              disabled={analyzing || !rawText.trim()}
            >
              {analyzing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Sparkles size={14} color="#FFFFFF" />
                  <Text style={styles.primaryAnalyzeText}>Analyze & Preview</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </VaultCard>

        {/* Previews List */}
        {hasAnalyzed && (
          <View style={styles.previewSection}>
            <View style={styles.summaryBar}>
              <Text style={[styles.summaryTitle, { color: theme.textPrimary }]}>
                Detected Transactions ({previews.length})
              </Text>
              <View style={styles.badgeRow}>
                {validNewCount > 0 && (
                  <View style={[styles.pillBadge, { backgroundColor: '#10B98120' }]}>
                    <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '700' }}>
                      {validNewCount} New
                    </Text>
                  </View>
                )}
                {duplicateCount > 0 && (
                  <View style={[styles.pillBadge, { backgroundColor: '#F59E0B20' }]}>
                    <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '700' }}>
                      {duplicateCount} Duplicates
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {previews.map((item, idx) => (
              <VaultCard key={idx} isDark={isDark} style={styles.previewCard}>
                {item.parsed ? (
                  <View>
                    <View style={styles.previewTopRow}>
                      <View style={styles.providerInfo}>
                        <ProviderLogo providerKey={item.parsed.provider} size={24} />
                        <Text style={[styles.previewMerchant, { color: theme.textPrimary }]}>
                          {item.parsed.cleanMerchant}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.previewAmount,
                          {
                            color:
                              item.parsed.type === 'INCOME'
                                ? theme.income
                                : theme.textPrimary,
                          },
                        ]}
                      >
                        {item.parsed.type === 'INCOME' ? '+' : '-'}
                        {item.parsed.amount.toLocaleString()} ETB
                      </Text>
                    </View>

                    <View style={styles.previewSubRow}>
                      <Text style={[styles.previewMeta, { color: theme.textMuted }]}>
                        Ref: {item.parsed.refNumber || 'N/A'} • {item.parsed.type}
                      </Text>

                      {item.isDuplicate ? (
                        <View style={[styles.statusBadge, { backgroundColor: '#F59E0B20' }]}>
                          <AlertTriangle size={12} color="#F59E0B" />
                          <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '700', marginLeft: 4 }}>
                            Duplicate
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.statusBadge, { backgroundColor: '#10B98120' }]}>
                          <CheckCircle2 size={12} color="#10B981" />
                          <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '700', marginLeft: 4 }}>
                            Ready
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                ) : (
                  <View style={styles.unparsedCard}>
                    <AlertTriangle size={16} color={theme.expense} />
                    <Text style={[styles.unparsedText, { color: theme.expense }]} numberOfLines={2}>
                      Unparsed: {item.raw.rawText.substring(0, 80)}...
                    </Text>
                  </View>
                )}
              </VaultCard>
            ))}

            {/* Dual Import Actions */}
            {validNewCount > 0 && (
              <View style={styles.actionButtonGroup}>
                <TouchableOpacity
                  style={[styles.executeButton, { backgroundColor: theme.primary }]}
                  onPress={() => handleExecuteImport(true)}
                  disabled={importing}
                >
                  {importing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <CheckCircle2 size={18} color="#FFFFFF" />
                      <Text style={styles.executeButtonText}>
                        Add {validNewCount} Directly to Ledger (Confirmed)
                      </Text>
                      <ArrowRight size={18} color="#FFFFFF" />
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.secondaryImportButton,
                    { backgroundColor: theme.surfaceHighlight, borderColor: theme.surfaceBorder },
                  ]}
                  onPress={() => handleExecuteImport(false)}
                  disabled={importing}
                >
                  <Layers size={16} color={theme.textPrimary} />
                  <Text style={[styles.secondaryImportText, { color: theme.textPrimary }]}>
                    Queue in Inbox for Review ({validNewCount})
                  </Text>
                </TouchableOpacity>
              </View>
            )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  scrollContent: {
    padding: layout.screenPadding,
    paddingBottom: spacing.xxl * 2,
  },
  instructions: {
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  inputCard: {
    padding: spacing.sm,
    marginBottom: spacing.lg,
  },
  textInput: {
    minHeight: 120,
    padding: spacing.sm,
    fontSize: typography.fontSize.sm,
    textAlignVertical: 'top',
  },
  inputActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    borderTopWidth: 1,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    gap: 6,
  },
  actionChipText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  primaryAnalyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    gap: 6,
  },
  primaryAnalyzeText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  previewSection: {
    marginTop: spacing.xs,
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  summaryTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  pillBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: borderRadius.pill,
  },
  previewCard: {
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  previewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  providerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  previewMerchant: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  previewAmount: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  previewSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  previewMeta: {
    fontSize: typography.fontSize.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: borderRadius.xs,
  },
  unparsedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  unparsedText: {
    fontSize: typography.fontSize.xs,
    flex: 1,
  },
  actionButtonGroup: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  executeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  executeButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  secondaryImportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    borderWidth: 1,
  },
  secondaryImportText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
});
