/**
 * App.tsx
 * Application Root Entry Point
 * - Initializes SQLite database and seeds default categories/accounts
 * - Routes to OnboardingScreen on first launch (no vault profile)
 * - Routes to RootNavigator when vault profile exists
 * - Manages Obsidian Dark / Crisp Light theme state
 */

import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenCapture from 'expo-screen-capture';
import { dbService } from './src/database/DatabaseService';
import { RootNavigator } from './src/navigation/RootNavigator';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { darkTheme } from './src/theme/colors';

export default function App() {
  // Enforces Android FLAG_SECURE: blocks screenshots and masks financial preview in App-Switcher
  ScreenCapture.usePreventScreenCapture();

  const [isLoading, setIsLoading] = useState(true);
  const [hasVaultProfile, setHasVaultProfile] = useState(false);
  const [isDark, setIsDark] = useState(true);

  const initializeApp = async () => {
    try {
      // Direct async call ensures native window flag is asserted on cold boot
      await ScreenCapture.preventScreenCaptureAsync().catch(() => {});
      await dbService.initialize();
      const profile = await dbService.getVaultProfile();
      if (profile) {
        setHasVaultProfile(true);
        setIsDark(profile.themePreference !== 'light');
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
