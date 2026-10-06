/**
 * App.tsx
 * Application Root Entry Point
 * - Initializes SQLite database and seeds default categories/accounts
 * - Routes to OnboardingScreen on first launch (no vault profile)
 * - Routes to RootNavigator when vault profile exists
 * - Manages Obsidian Dark / Crisp Light theme state
 */

import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenCapture from 'expo-screen-capture';
import { dbService } from './src/database/DatabaseService';
import { sessionManager } from './src/security/SessionManager';
import { RootNavigator } from './src/navigation/RootNavigator';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { darkTheme } from './src/theme/colors';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasVaultProfile, setHasVaultProfile] = useState(false);
  const [isDark, setIsDark] = useState(true);

  // Safely enforce Android FLAG_SECURE without fragile unmount teardown
  const enforceScreenCaptureProtection = () => {
    ScreenCapture.preventScreenCaptureAsync().catch(() => {});
  };

  const initializeApp = async () => {
    try {
      // Direct async call ensures native window flag is asserted on cold boot
      await ScreenCapture.preventScreenCaptureAsync().catch(() => {});
      await dbService.initialize();
      const profile = await dbService.getVaultProfile();
      if (profile) {
        setHasVaultProfile(true);
        setIsDark(profile.themePreference !== 'light');
        await sessionManager.init(profile.autoLockMinutes ?? 5);
      } else {
        setHasVaultProfile(false);
      }
    } catch (err) {
      console.error('Initialization error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    initializeApp();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        enforceScreenCaptureProtection();
      }
    });
    return () => sub.remove();
  }, []);

  const handleOnboardingComplete = async () => {
    await initializeApp();
  };

  const handleToggleTheme = () => {
    setIsDark((prev) => !prev);
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: darkTheme.background }]}>
        <ActivityIndicator size="large" color={darkTheme.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {hasVaultProfile ? (
        <RootNavigator isDark={isDark} onToggleTheme={handleToggleTheme} />
      ) : (
        <OnboardingScreen onComplete={handleOnboardingComplete} isDark={isDark} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
