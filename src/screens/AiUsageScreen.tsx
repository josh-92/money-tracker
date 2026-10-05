/**
 * AiUsageScreen.tsx
 * Honest, local-first AI usage audit and token consumption dashboard.
 * - Displays this month's discrete request count by feature
 * - Differentiates exact token metrics vs estimated metrics
 * - Zero fabricated quota: shows honest device-local audit logs
 * - Success/failure latency tracking
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
  ArrowLeft,
  Activity,
  Receipt,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react-native';
import { spacing, layout, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { VaultCard } from '../components/VaultCard';
import { dbService } from '../database/DatabaseService';
import { AiUsageLog } from '../types/database';

interface AiUsageScreenProps {
  navigation: any;
  isDark?: boolean;
}

export const AiUsageScreen: React.FC<AiUsageScreenProps> = ({
  navigation,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;

  const [usageStats, setUsageStats] = useState({
    totalRequests: 0,
    receiptScans: 0,
    smsFallbacks: 0,
    merchantAnalysis: 0,
    monthlyAnalysis: 0,
  });

  const [recentLogs, setRecentLogs] = useState<AiUsageLog[]>([]);

  useEffect(() => {
    loadUsageData();
  }, []);

  const loadUsageData = async () => {
    const stats = await dbService.getAiUsageSummary();
    setUsageStats(stats);

    const db = await dbService.getDb();
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM ai_usage_log ORDER BY timestamp DESC LIMIT 20;'
    );
    setRecentLogs(
      rows.map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        operationType: r.operation_type,
        modelId: r.model_id,
        promptTokensRecorded: r.prompt_tokens_recorded,
        responseTokensRecorded: r.response_tokens_recorded,
        estimatedCategory: r.estimated_category,
        latencyMs: r.latency_ms,
        status: r.status,
      }))
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>AI Usage & Audit</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Month Summary Card */}
        <VaultCard isDark={isDark} style={styles.card}>
          <Text style={[styles.cardHeadline, { color: theme.textSecondary }]}>This Month's Consumption</Text>
          <View style={styles.totalRow}>
            <Text style={[styles.totalNumber, { color: theme.primary }]}>{usageStats.totalRequests}</Text>
            <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>Total AI Requests</Text>
          </View>

          <View style={[styles.grid, { borderTopColor: theme.surfaceBorder }]}>
            <View style={styles.gridItem}>
              <View style={styles.iconTitleRow}>
                <Receipt size={16} color={theme.primary} />
                <Text style={[styles.gridTitle, { color: theme.textSecondary }]}>Receipts</Text>
              </View>
              <Text style={[styles.gridNumber, { color: theme.textPrimary }]}>{usageStats.receiptScans}</Text>
            </View>

            <View style={styles.gridItem}>
              <View style={styles.iconTitleRow}>
                <MessageSquare size={16} color={theme.income} />
                <Text style={[styles.gridTitle, { color: theme.textSecondary }]}>SMS Fallback</Text>
              </View>
              <Text style={[styles.gridNumber, { color: theme.textPrimary }]}>{usageStats.smsFallbacks}</Text>
            </View>

            <View style={styles.gridItem}>
              <View style={styles.iconTitleRow}>
                <Sparkles size={16} color={theme.warning} />
                <Text style={[styles.gridTitle, { color: theme.textSecondary }]}>Insights</Text>
              </View>
              <Text style={[styles.gridNumber, { color: theme.textPrimary }]}>{usageStats.monthlyAnalysis}</Text>
            </View>
          </View>
        </VaultCard>

        {/* Honest Policy Notice */}
        <VaultCard isDark={isDark} variant="highlight" style={styles.card}>
          <View style={styles.policyRow}>
            <Activity size={20} color={theme.primary} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={[styles.policyTitle, { color: theme.textPrimary }]}>Local Audit Principle</Text>
              <Text style={[styles.policyDesc, { color: theme.textSecondary }]}>
                Data is logged strictly on your device. We never fabricate remaining quotas or token guesses. Exact token counts are recorded directly from Gemini response metadata when returned.
              </Text>
            </View>
          </View>
        </VaultCard>

        {/* Detailed Audit Log */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Recent Request History</Text>
        {recentLogs.length === 0 ? (
          <VaultCard isDark={isDark} style={styles.emptyCard}>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No AI requests logged yet this month.</Text>
          </VaultCard>
        ) : (
          <View style={styles.logsList}>
            {recentLogs.map((log) => {
              const isSuccess = log.status === 'SUCCESS';
              const dateStr = new Date(log.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <VaultCard key={log.id} isDark={isDark} style={styles.logCard}>
                  <View style={styles.logRow}>
                    <View style={styles.logLeft}>
                      {isSuccess ? (
                        <CheckCircle2 size={16} color={theme.income} />
                      ) : (
                        <XCircle size={16} color={theme.expense} />
                      )}
                      <View style={{ marginLeft: spacing.xs }}>
                        <Text style={[styles.opType, { color: theme.textPrimary }]}>{log.operationType}</Text>
                        <Text style={[styles.modelName, { color: theme.textSecondary }]}>{log.modelId}</Text>
                      </View>
                    </View>

                    <View style={styles.logRight}>
                      <View style={styles.latencyRow}>
                        <Clock size={12} color={theme.textMuted} style={{ marginRight: 2 }} />
                        <Text style={[styles.latencyText, { color: theme.textMuted }]}>{log.latencyMs}ms</Text>
                      </View>
                      <Text style={[styles.timestampText, { color: theme.textMuted }]}>{dateStr}</Text>
                    </View>
                  </View>

                  {(log.promptTokensRecorded || log.responseTokensRecorded) && (
                    <View style={[styles.tokensRow, { borderTopColor: theme.surfaceBorder + '40' }]}>
                      <Text style={[styles.tokenLabel, { color: theme.textSecondary }]}>Tokens:</Text>
                      <Text style={[styles.tokenValue, { color: theme.textPrimary }]}>
                        {log.promptTokensRecorded || 0} in / {log.responseTokensRecorded || 0} out (Exact API Metadata)
                      </Text>
                    </View>
                  )}
                </VaultCard>
              );
            })}
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
  cardHeadline: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalRow: {
    marginVertical: spacing.sm,
  },
  totalNumber: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
  },
  totalLabel: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  grid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
  gridItem: {
    flex: 1,
  },
  iconTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  gridTitle: {
    fontSize: typography.fontSize.xs,
  },
  gridNumber: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  card: {
    gap: spacing.xs,
  },
  policyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  policyTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  policyDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  sectionHeader: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: 4,
  },
  emptyCard: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: typography.fontSize.xs,
  },
  logsList: {
    gap: spacing.xs,
  },
  logCard: {
    padding: spacing.sm,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  opType: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  modelName: {
    fontSize: 10,
    marginTop: 1,
  },
  logRight: {
    alignItems: 'flex-end',
  },
  latencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  latencyText: {
    fontSize: 10,
  },
  timestampText: {
    fontSize: 10,
    marginTop: 1,
  },
  tokensRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingTop: 4,
    borderTopWidth: 1,
    gap: 4,
  },
  tokenLabel: {
    fontSize: 10,
  },
  tokenValue: {
    fontSize: 10,
    fontWeight: typography.fontWeight.medium,
  },
});
