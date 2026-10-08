/**
 * RootNavigator.tsx
 * Bottom Tab & Stack Navigation matching the BankPick / Moneet Figma UI Kit.
 * - Docked 4-tab bar: Home, Accounts, Analytics, Settings
 * - Active electric blue indicator (#0066FF)
 * - Modal presentation for AddTransaction and ReceiptScanner
 * - Global SessionManager auto-lock overlay
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Home, Wallet, PieChart, Settings } from 'lucide-react-native';
import { layout } from '../theme/spacing';
import { typography } from '../theme/typography';
import { darkTheme, lightTheme, ColorTheme } from '../theme/colors';
import { HomeScreen } from '../screens/HomeScreen';
import { AccountsScreen } from '../screens/AccountsScreen';
import { AnalyticsScreen } from '../screens/AnalyticsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AddTransactionModal } from '../screens/AddTransactionModal';
import { PasscodeLockScreen } from '../screens/PasscodeLockScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { AccountSecurityScreen } from '../screens/AccountSecurityScreen';
import { ManageAiApisScreen } from '../screens/ManageAiApisScreen';
import { AiUsageScreen } from '../screens/AiUsageScreen';
import { AppearanceScreen } from '../screens/AppearanceScreen';
import { DataManagementScreen } from '../screens/DataManagementScreen';
import { PrivacySettingsScreen } from '../screens/PrivacySettingsScreen';
import { DonateScreen } from '../screens/DonateScreen';
import { TransactionDetailScreen } from '../screens/TransactionDetailScreen';
import { ManageAccountsModal } from '../screens/ManageAccountsModal';
import { InboxScreen } from '../screens/InboxScreen';
import { TransactionsScreen } from '../screens/TransactionsScreen';
import { TransferModal } from '../screens/TransferModal';
import { SavingsGoalsScreen } from '../screens/SavingsGoalsScreen';
import { BudgetsScreen } from '../screens/BudgetsScreen';
import { ReconcileModal } from '../screens/ReconcileModal';
import { TransactionDetectionSettingsScreen } from '../screens/TransactionDetectionSettingsScreen';
import { ImportTransactionsModal } from '../screens/ImportTransactionsModal';
import { BalanceVisibilityProvider } from '../context/BalanceVisibilityContext';
import { dbService } from '../database/DatabaseService';
import { sessionManager } from '../security/SessionManager';
import { ingestionPipeline } from '../ingestion/IngestionPipeline';
import { clipboardSource } from '../ingestion/sources/ClipboardSource';
import { notificationSource } from '../ingestion/sources/NotificationSource';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

interface RootNavigatorProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

const TabNavigator: React.FC<RootNavigatorProps> = ({ isDark, onToggleTheme }) => {
  const theme: ColorTheme = isDark ? darkTheme : lightTheme;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.surfaceBorder,
          height: layout.bottomBarHeight,
          paddingBottom: Platform.OS === 'ios' ? 20 : 12,
          paddingTop: 10,
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: typography.fontWeight.medium,
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        children={(props) => <HomeScreen {...props} isDark={isDark} />}
        options={{
          tabBarIcon: ({ color, size }) => <Home size={size || 22} color={color} />,
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen
        name="Accounts"
        children={(props) => <AccountsScreen {...props} isDark={isDark} />}
        options={{
          tabBarIcon: ({ color, size }) => <Wallet size={size || 22} color={color} />,
          tabBarLabel: 'Accounts',
        }}
      />
      <Tab.Screen
        name="Analytics"
        children={(props) => <AnalyticsScreen {...props} isDark={isDark} />}
        options={{
          tabBarIcon: ({ color, size }) => <PieChart size={size || 22} color={color} />,
          tabBarLabel: 'Statistics',
        }}
      />
      <Tab.Screen
        name="Settings"
        children={(props) => <SettingsScreen {...props} isDark={isDark} onToggleTheme={onToggleTheme} />}
        options={{
          tabBarIcon: ({ color, size }) => <Settings size={size || 22} color={color} />,
          tabBarLabel: 'Settings',
        }}
      />
    </Tab.Navigator>
  );
};

export const RootNavigator: React.FC<RootNavigatorProps> = ({ isDark, onToggleTheme }) => {
  const [isLocked, setIsLocked] = useState(sessionManager.getIsLocked());

  useEffect(() => {
    // Load and sync configured autoLockMinutes from vault profile
    const syncSecurityProfile = async () => {
      try {
        const profile = await dbService.getVaultProfile();
        if (profile?.autoLockMinutes) {
          sessionManager.setAutoLockMinutes(profile.autoLockMinutes);
        }
      } catch (err) {
        console.warn('Failed to sync vault profile auto-lock minutes:', err);
      }
    };
    syncSecurityProfile();

    const unsubscribe = sessionManager.subscribe((locked) => {
      setIsLocked(locked);
    });

    // Wire Ingestion Sources to IngestionPipeline
    clipboardSource.onMessage((msg) => ingestionPipeline.processCandidate(msg));
    notificationSource.onMessage((msg) => ingestionPipeline.processCandidate(msg));
    clipboardSource.start();
    notificationSource.start();

    return () => {
      unsubscribe();
      // Keep sessionManager alive across React component remounts
      clipboardSource.stop();
      notificationSource.stop();
    };
  }, []);

  return (
    <View style={styles.container} onTouchStart={() => sessionManager.recordUserActivity()}>
      <BalanceVisibilityProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="MainTabs">
              {(props) => <TabNavigator {...props} isDark={isDark} onToggleTheme={onToggleTheme} />}
            </Stack.Screen>

            {/* Profile & Security */}
            <Stack.Screen name="Profile">
              {(props) => <ProfileScreen {...props} isDark={isDark} />}
            </Stack.Screen>
            <Stack.Screen name="AccountSecurity">
              {(props) => <AccountSecurityScreen {...props} isDark={isDark} />}
            </Stack.Screen>

            {/* AI & Gemini */}
            <Stack.Screen name="ManageAiApis">
              {(props) => <ManageAiApisScreen {...props} isDark={isDark} />}
            </Stack.Screen>
            <Stack.Screen name="AiUsage">
              {(props) => <AiUsageScreen {...props} isDark={isDark} />}
            </Stack.Screen>

            {/* Appearance */}
            <Stack.Screen name="Appearance">
              {(props) => <AppearanceScreen {...props} isDark={isDark} onToggleTheme={onToggleTheme} />}
            </Stack.Screen>

            {/* Data & Privacy */}
            <Stack.Screen name="DataManagement">
              {(props) => <DataManagementScreen {...props} isDark={isDark} />}
            </Stack.Screen>
            <Stack.Screen name="PrivacySettings">
              {(props) => <PrivacySettingsScreen {...props} isDark={isDark} />}
            </Stack.Screen>
            <Stack.Screen name="TransactionDetection">
              {(props) => <TransactionDetectionSettingsScreen {...props} isDark={isDark} />}
            </Stack.Screen>

            {/* Support */}
            <Stack.Screen name="Donate">
              {(props) => <DonateScreen {...props} isDark={isDark} />}
            </Stack.Screen>

            {/* Transaction Detail & Ledger */}
            <Stack.Screen name="TransactionDetail">
              {(props) => <TransactionDetailScreen {...props} isDark={isDark} />}
            </Stack.Screen>
            <Stack.Screen name="Inbox">
              {(props) => <InboxScreen {...props} isDark={isDark} />}
            </Stack.Screen>
            <Stack.Screen name="Transactions">
              {(props) => <TransactionsScreen {...props} isDark={isDark} />}
            </Stack.Screen>
            <Stack.Screen name="Search">
              {(props) => <TransactionsScreen {...props} isDark={isDark} />}
            </Stack.Screen>
            <Stack.Screen name="Goals">
              {(props) => <SavingsGoalsScreen {...props} isDark={isDark} />}
            </Stack.Screen>
            <Stack.Screen name="Budgets">
              {(props) => <BudgetsScreen {...props} isDark={isDark} />}
            </Stack.Screen>

            {/* Modals */}
            <Stack.Screen
              name="AddTransaction"
              children={(props) => <AddTransactionModal {...props} isDark={isDark} />}
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen
              name="Transfer"
              children={(props) => <TransferModal {...props} isDark={isDark} />}
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen
              name="Reconcile"
              children={(props) => <ReconcileModal {...props} isDark={isDark} />}
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen
              name="ManageAccounts"
              children={(props) => <ManageAccountsModal {...props} isDark={isDark} />}
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen
              name="AddAccount"
              children={(props) => <ManageAccountsModal {...props} isDark={isDark} />}
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen
              name="ImportTransactionsModal"
              children={(props) => <ImportTransactionsModal {...props} isDark={isDark} />}
              options={{ presentation: 'modal' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </BalanceVisibilityProvider>

      {/* 5-minute Auto-Lock Security Screen */}
      {isLocked && <PasscodeLockScreen isDark={isDark} />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
