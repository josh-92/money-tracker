/**
 * GuidedTourOverlay.tsx
 * Lightweight Coach Marks / First-Use Guided Tour Overlay for Money Tracker.
 * 
 * Features:
 * - Tab-specific step walkthroughs with title, description, and step progress.
 * - Local persistence via Expo SecureStore (`tour_seen_home`, `tour_seen_accounts`, etc.).
 * - Replayable on demand from Settings -> Replay app tours.
 * - Dismissible via "Got it" or skip button at any time.
 * - Strict adherence to the Obsidian/Light design tokens.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Sparkles, ArrowRight, Check, X } from 'lucide-react-native';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { spacing, borderRadius } from '../theme/spacing';
import { typography } from '../theme/typography';

const { width } = Dimensions.get('window');

export interface TourStep {
  title: string;
  description: string;
  badge?: string;
}

interface GuidedTourOverlayProps {
  tourKey: string; // e.g. 'home', 'accounts', 'analytics', 'settings'
  steps: TourStep[];
  isDark?: boolean;
}

const TOUR_STORAGE_PREFIX = 'tour_completed_';

export async function isTourCompleted(tourKey: string): Promise<boolean> {
  try {
    const val = await SecureStore.getItemAsync(`${TOUR_STORAGE_PREFIX}${tourKey}`);
    return val === '1';
  } catch {
    return false;
  }
}

export async function markTourCompleted(tourKey: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(`${TOUR_STORAGE_PREFIX}${tourKey}`, '1');
  } catch (err) {
    console.warn(`Failed to persist tour state for ${tourKey}:`, err);
  }
}

export async function resetAllTours(): Promise<void> {
  const tourKeys = ['home', 'accounts', 'analytics', 'settings'];
  for (const k of tourKeys) {
    try {
      await SecureStore.deleteItemAsync(`${TOUR_STORAGE_PREFIX}${k}`);
    } catch {
      // Ignore deletion errors
    }
  }
}

export const GuidedTourOverlay: React.FC<GuidedTourOverlayProps> = ({
  tourKey,
  steps,
  isDark = true,
}) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;
  const [visible, setVisible] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const completed = await isTourCompleted(tourKey);
      if (!completed && isMounted && steps.length > 0) {
        // Small delay so screen finishes initial render cleanly
        setTimeout(() => {
          if (isMounted) setVisible(true);
        }, 350);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [tourKey]);

  const handleNext = async () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      await handleDismiss();
    }
  };

  const handleDismiss = async () => {
    setVisible(false);
    await markTourCompleted(tourKey);
  };

  if (!visible || steps.length === 0) return null;

  const currentStep = steps[currentStepIndex];
  const isLast = currentStepIndex === steps.length - 1;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={handleDismiss}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.surfaceBorder,
              shadowColor: '#000000',
            },
          ]}
        >
          {/* Header row */}
          <View style={styles.headerRow}>
            <View style={styles.badgeGroup}>
              <View style={[styles.iconCircle, { backgroundColor: theme.primaryGlow }]}>
                <Sparkles size={16} color={theme.primary} />
              </View>
              <Text style={[styles.badgeText, { color: theme.primary }]}>
                {currentStep.badge || `Tour Step ${currentStepIndex + 1}/${steps.length}`}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleDismiss}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Title & Body */}
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            {currentStep.title}
          </Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {currentStep.description}
          </Text>

          {/* Step dots */}
          <View style={styles.dotsRow}>
            {steps.map((_, idx) => (
              <View
                key={idx}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      idx === currentStepIndex ? theme.primary : theme.surfaceBorder,
                    width: idx === currentStepIndex ? 18 : 6,
                  },
                ]}
              />
            ))}
          </View>

          {/* Actions */}
          <View style={[styles.actionsRow, { borderTopColor: theme.surfaceBorder }]}>
            <TouchableOpacity onPress={handleDismiss} style={styles.skipBtn}>
              <Text style={[styles.skipText, { color: theme.textMuted }]}>Skip Tour</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleNext}
              style={[styles.nextBtn, { backgroundColor: theme.primary }]}
            >
              <Text style={styles.nextText}>{isLast ? 'Got it' : 'Next'}</Text>
              {isLast ? (
                <Check size={16} color="#FFFFFF" style={{ marginLeft: 4 }} />
              ) : (
                <ArrowRight size={16} color="#FFFFFF" style={{ marginLeft: 4 }} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: width - spacing.xl * 2,
    borderRadius: borderRadius.card,
    borderWidth: 1,
    padding: spacing.lg,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: 4,
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  description: {
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  skipBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  skipText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  nextText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
});
