/**
 * BalanceVisibilityContext.tsx
 * Global privacy control for sensitive financial amounts.
 * - Respects default setting from Vault Profile / Privacy settings
 * - Provides immediate eye-toggle reveal/hide across Home, Accounts, Analytics, and cards
 * - When hidden, formats numbers strictly as `•••••••• ETB` without revealing digits
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { vaultSecurity } from '../security/VaultSecurity';
import { dbService } from '../database/DatabaseService';

interface BalanceVisibilityContextType {
  isBalanceHidden: boolean;
  toggleBalanceVisibility: () => void;
  setBalanceHidden: (hidden: boolean) => void;
  formatAmount: (amount: number, currency?: string) => string;
}

const BalanceVisibilityContext = createContext<BalanceVisibilityContextType>({
  isBalanceHidden: false,
  toggleBalanceVisibility: () => {},
  setBalanceHidden: () => {},
  formatAmount: (amount: number, currency = 'ETB') => `${amount.toLocaleString()} ${currency}`,
});

export const BalanceVisibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isBalanceHidden, setIsBalanceHidden] = useState<boolean>(false);

  useEffect(() => {
    // Load initial preference
    const loadPreference = async () => {
      try {
        const profile = await dbService.getVaultProfile();
        if (profile?.hideBalancesByDefault !== undefined) {
          setIsBalanceHidden(Boolean(profile.hideBalancesByDefault));
        } else {
          const pref = await vaultSecurity.getHideBalancesPreference();
          setIsBalanceHidden(pref);
        }
      } catch (err) {
        console.warn('Failed to load balance visibility preference:', err);
      }
    };
    loadPreference();
  }, []);

  const toggleBalanceVisibility = () => {
    setIsBalanceHidden((prev) => !prev);
  };

  const setBalanceHidden = (hidden: boolean) => {
    setIsBalanceHidden(hidden);
  };

  const formatAmount = (amount: number, currency = 'ETB'): string => {
    if (isBalanceHidden) {
      return `•••••••• ${currency}`;
    }
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    return `${safeAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
  };

  return (
    <BalanceVisibilityContext.Provider
      value={{
        isBalanceHidden,
        toggleBalanceVisibility,
        setBalanceHidden,
        formatAmount,
      }}
    >
      {children}
    </BalanceVisibilityContext.Provider>
  );
};

export const useBalanceVisibility = () => useContext(BalanceVisibilityContext);
