/**
 * DatabaseService.ts
 * Robust, local-first SQLite repository using expo-sqlite.
 * Handles transactions, double-entry transfers, opening balances,
 * category budgets, AI usage tracking, and local financial metrics.
 */

import * as SQLite from 'expo-sqlite';
import {
  Account,
  Category,
  Transaction,
  VaultProfile,
  Budget,
  SavingsGoal,
  AiUsageLog,
  MonthlyFinancialReport,
  MatchResult,
  MatchConfidence,
  DuplicateMatchQuery,
} from '../types/database';
import {
  CREATE_TABLES_SQL,
  DEFAULT_CATEGORIES,
  DEFAULT_ACCOUNTS_SEED,
  runMigrations,
} from './schema';

export class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitialized = false;

  public async getDb(): Promise<SQLite.SQLiteDatabase> {
    if (!this.db) {
      this.db = await SQLite.openDatabaseAsync('money_tracker_vault.db');
    }
    return this.db;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    const db = await this.getDb();

    // Enable foreign keys
    await db.execAsync('PRAGMA foreign_keys = ON;');

    // Execute schema DDL
    await db.execAsync(CREATE_TABLES_SQL);

    // Dynamic migration runner: non-destructively adds all required audit fields to transactions
    await runMigrations(db);

    // Check if categories need seeding
    const categoryCount = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM categories;'
    );

    if (!categoryCount || categoryCount.count === 0) {
      for (const cat of DEFAULT_CATEGORIES) {
        await db.runAsync(
          `INSERT INTO categories (id, name, icon_name, color_hex, display_order, is_default)
           VALUES (?, ?, ?, ?, ?, ?);`,
          [cat.id, cat.name, cat.iconName, cat.colorHex, cat.displayOrder, 1]
        );
      }
    }

    this.isInitialized = true;
  }

  // --- Vault Profile Management ---

  public async getVaultProfile(): Promise<VaultProfile | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<any>('SELECT * FROM vault_profile LIMIT 1;');
    if (!row) return null;

    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phoneNumber: row.phone_number || null,
      passwordHash: row.password_hash,
      salt: row.salt,
      passcodeHash: row.passcode_hash,
      biometricEnabled: Boolean(row.biometric_enabled),
      autoLockMinutes: row.auto_lock_minutes,
      themePreference: row.theme_preference,
      hideBalancesByDefault: Boolean(row.hide_balances_by_default),
      createdAt: row.created_at,
    };
  }

  public async createVaultProfile(profile: {
    fullName: string;
    email: string;
    phoneNumber?: string | null;
    passwordHash: string;
    salt: string;
    passcodeHash?: string | null;
    biometricEnabled?: boolean;
    autoLockMinutes?: number;
    themePreference?: 'dark' | 'light' | 'system';
    hideBalancesByDefault?: boolean;
  }): Promise<VaultProfile> {
    const db = await this.getDb();
    const id = `vault_${Date.now()}`;
    const createdAt = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO vault_profile (
        id, full_name, email, phone_number, password_hash, salt,
        passcode_hash, biometric_enabled, auto_lock_minutes, theme_preference,
        hide_balances_by_default, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        profile.fullName,
        profile.email,
        profile.phoneNumber || null,
        profile.passwordHash,
        profile.salt,
        profile.passcodeHash || null,
        profile.biometricEnabled ? 1 : 0,
        profile.autoLockMinutes ?? 5,
        profile.themePreference ?? 'dark',
        profile.hideBalancesByDefault ? 1 : 0,
        createdAt,
      ]
    );

    return {
      id,
      fullName: profile.fullName,
      email: profile.email,
      phoneNumber: profile.phoneNumber || null,
      passwordHash: profile.passwordHash,
      salt: profile.salt,
      passcodeHash: profile.passcodeHash,
      biometricEnabled: Boolean(profile.biometricEnabled),
      autoLockMinutes: profile.autoLockMinutes ?? 5,
      themePreference: profile.themePreference ?? 'dark',
      hideBalancesByDefault: Boolean(profile.hideBalancesByDefault),
      createdAt,
    };
  }

  public async updateVaultProfile(updates: Partial<VaultProfile>): Promise<void> {
    const db = await this.getDb();
    const current = await this.getVaultProfile();
    if (!current) throw new Error('No vault profile found to update');

    await db.runAsync(
      `UPDATE vault_profile SET
        full_name = COALESCE(?, full_name),
        email = COALESCE(?, email),
        phone_number = COALESCE(?, phone_number),
        password_hash = COALESCE(?, password_hash),
        salt = COALESCE(?, salt),
        passcode_hash = CASE WHEN ? THEN ? ELSE passcode_hash END,
        biometric_enabled = COALESCE(?, biometric_enabled),
        auto_lock_minutes = COALESCE(?, auto_lock_minutes),
        theme_preference = COALESCE(?, theme_preference),
        hide_balances_by_default = COALESCE(?, hide_balances_by_default)
       WHERE id = ?;`,
      [
        updates.fullName ?? null,
        updates.email ?? null,
        updates.phoneNumber !== undefined ? updates.phoneNumber : null,
        updates.passwordHash ?? null,
        updates.salt ?? null,
        updates.passcodeHash !== undefined,
        updates.passcodeHash ?? null,
        updates.biometricEnabled !== undefined ? (updates.biometricEnabled ? 1 : 0) : null,
        updates.autoLockMinutes ?? null,
        updates.themePreference ?? null,
        updates.hideBalancesByDefault !== undefined ? (updates.hideBalancesByDefault ? 1 : 0) : null,
        current.id,
      ]
    );
  }

  // --- Accounts & Balances ---

  public async seedDefaultAccounts(openingBalances?: Record<string, number>): Promise<void> {
    const db = await this.getDb();
    const existing = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM accounts;');
    if (existing && existing.count > 0) return;

    const now = new Date().toISOString();

    for (const seed of DEFAULT_ACCOUNTS_SEED) {
      await db.runAsync(
        `INSERT INTO accounts (id, name, provider_key, account_mask, currency, color_hex, icon_name, is_active, display_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?);`,
        [seed.id, seed.name, seed.providerKey, seed.accountMask, seed.currency, seed.colorHex, seed.iconName, seed.displayOrder, now]
      );

      const amount = openingBalances?.[seed.id] ?? seed.defaultOpeningBalance;
      const obId = `ob_${seed.id}_${Date.now()}`;

      // Insert opening balance record
      await db.runAsync(
        `INSERT INTO opening_balances (id, account_id, amount, effective_date, created_at)
         VALUES (?, ?, ?, ?, ?);`,
        [obId, seed.id, amount, now, now]
      );

      // Create matching starting transaction so the ledger has full historical auditability
      await db.runAsync(
        `INSERT INTO transactions (
          id, account_id, amount, type, merchant_name, clean_merchant,
          source, status, timestamp, is_deleted, created_at, updated_at
        ) VALUES (?, ?, ?, 'OPENING_BALANCE', 'Opening Balance', 'Opening Balance', 'MANUAL', 'CONFIRMED', ?, 0, ?, ?);`,
        [`tx_${obId}`, seed.id, amount, now, now, now]
      );
    }
  }

  public async getAccounts(): Promise<Account[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT a.*, 
        COALESCE(ob.amount, 0) as opening_balance,
        (
          COALESCE(ob.amount, 0) +
          COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = a.id AND type = 'INCOME' AND is_deleted = 0 AND status = 'CONFIRMED'), 0) -
          COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = a.id AND type = 'EXPENSE' AND is_deleted = 0 AND status = 'CONFIRMED'), 0) -
          COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = a.id AND type = 'TRANSFER' AND is_deleted = 0 AND status = 'CONFIRMED'), 0) +
          COALESCE((SELECT SUM(amount) FROM transactions WHERE destination_account_id = a.id AND type = 'TRANSFER' AND is_deleted = 0 AND status = 'CONFIRMED'), 0)
        ) as calculated_balance
       FROM accounts a
       LEFT JOIN opening_balances ob ON ob.account_id = a.id
       WHERE a.is_active = 1
       ORDER BY a.display_order ASC;`
    );

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      providerKey: r.provider_key,
      accountMask: r.account_mask,
      currency: r.currency,
      colorHex: r.color_hex,
      iconName: r.icon_name,
      isActive: Boolean(r.is_active),
      displayOrder: r.display_order,
      openingBalance: r.opening_balance,
      calculatedBalance: r.calculated_balance,
    }));
  }

  public async getTotalNetWorth(): Promise<{ total: number; currency: string }> {
    const accounts = await this.getAccounts();
    const total = accounts.reduce((sum, a) => sum + (a.calculatedBalance ?? 0), 0);
    return { total, currency: 'ETB' };
  }

  public async createAccount(account: {
    name: string;
    providerKey: string;
    accountMask: string;
    currency?: string;
    colorHex?: string;
    iconName?: string;
    openingBalance?: number;
  }): Promise<Account> {
    const db = await this.getDb();
    const id = `acc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const currency = account.currency || 'ETB';
    const colorHex = account.colorHex || '#0066FF';
    const iconName = account.iconName || 'Wallet';
    const openingBal = account.openingBalance || 0;

    const countRow = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM accounts;');
    const displayOrder = (countRow?.count || 0) + 1;

    await db.runAsync(
      `INSERT INTO accounts (id, name, provider_key, account_mask, currency, color_hex, icon_name, is_active, display_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?);`,
      [id, account.name, account.providerKey, account.accountMask, currency, colorHex, iconName, displayOrder, now]
    );

    if (openingBal > 0) {
      const obId = `ob_${id}_${Date.now()}`;
      await db.runAsync(
        `INSERT INTO opening_balances (id, account_id, amount, effective_date, created_at)
         VALUES (?, ?, ?, ?, ?);`,
        [obId, id, openingBal, now, now]
      );

      await db.runAsync(
        `INSERT INTO transactions (
          id, account_id, amount, type, merchant_name, clean_merchant,
          source, status, timestamp, is_deleted, created_at, updated_at
        ) VALUES (?, ?, ?, 'OPENING_BALANCE', 'Opening Balance', 'Opening Balance', 'MANUAL', 'CONFIRMED', ?, 0, ?, ?);`,
        [`tx_${obId}`, id, openingBal, now, now, now]
      );
    }

    return {
      id,
      name: account.name,
      providerKey: account.providerKey as any,
      accountMask: account.accountMask,
      currency,
      colorHex,
      iconName,
      isActive: true,
      displayOrder,
      openingBalance: openingBal,
    };
  }

  public async updateAccount(id: string, updates: Partial<Account>): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      `UPDATE accounts SET
        name = COALESCE(?, name),
        provider_key = COALESCE(?, provider_key),
        account_mask = COALESCE(?, account_mask),
        color_hex = COALESCE(?, color_hex),
        icon_name = COALESCE(?, icon_name),
        is_active = COALESCE(?, is_active),
        display_order = COALESCE(?, display_order)
       WHERE id = ?;`,
      [
        updates.name ?? null,
        updates.providerKey ?? null,
        updates.accountMask ?? null,
        updates.colorHex ?? null,
        updates.iconName ?? null,
        updates.isActive !== undefined ? (updates.isActive ? 1 : 0) : null,
        updates.displayOrder ?? null,
        id,
      ]
    );
  }

  public async deleteAccount(id: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync('UPDATE accounts SET is_active = 0 WHERE id = ?;', [id]);
  }

  public async reorderAccounts(accountIds: string[]): Promise<void> {
    const db = await this.getDb();
    for (let i = 0; i < accountIds.length; i++) {
      await db.runAsync('UPDATE accounts SET display_order = ? WHERE id = ?;', [i + 1, accountIds[i]]);
    }
  }

  // --- Transactions ---

  public async getTransactions(options?: {
    accountId?: string;
    categoryId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<Transaction[]> {
    const db = await this.getDb();
    let query = `
      SELECT t.*, 
             COALESCE(a.name, 'Unassigned Account') as account_name, 
             c.name as category_name, 
             c.color_hex as category_color, 
             c.icon_name as category_icon
      FROM transactions t
      LEFT JOIN accounts a ON t.account_id = a.id
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.is_deleted = 0
    `;
    const params: any[] = [];

    if (options?.accountId) {
      query += ' AND (t.account_id = ? OR t.destination_account_id = ?)';
      params.push(options.accountId, options.accountId);
    }
    if (options?.categoryId) {
      query += ' AND t.category_id = ?';
      params.push(options.categoryId);
    }
    if (options?.status) {
      query += ' AND t.status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY t.timestamp DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
      if (options?.offset) {
        query += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const rows = await db.getAllAsync<any>(query, params);
    return rows.map((r) => ({
      id: r.id,
      accountId: r.account_id,
      destinationAccountId: r.destination_account_id,
      categoryId: r.category_id,
      amount: r.amount,
      type: r.type,
      merchantName: r.merchant_name,
      cleanMerchant: r.clean_merchant,
      notes: r.notes,
      status: r.status,
      timestamp: r.timestamp,
      isDeleted: Boolean(r.is_deleted),

      // Immutable Original / Source Data
      source: r.source,
      rawSourceMessage: r.raw_source_message,
      sourceTimestamp: r.source_timestamp,
      refNumber: r.ref_number,
      transactionNumber: r.transaction_number,
      sender: r.sender,
      recipient: r.recipient,
      balanceAfterTransaction:
        r.balance_after_transaction !== null && r.balance_after_transaction !== undefined
          ? Number(r.balance_after_transaction)
          : null,

      // Ingestion / Parser Audit Metadata
      parserVersion: r.parser_version,
      templateId: r.template_id,
      confidenceScore:
        r.confidence_score !== null && r.confidence_score !== undefined
          ? Number(r.confidence_score)
          : null,
      aiOperationUsed: r.ai_operation_used,

      // User Override Audit Trail
      originalAmount:
        r.original_amount !== null && r.original_amount !== undefined
          ? Number(r.original_amount)
          : null,
      originalMerchantName: r.original_merchant_name,
      originalCategoryId: r.original_category_id,
      userEditedAt: r.user_edited_at,

      // System Timestamps
      createdAt: r.created_at || r.timestamp,
      updatedAt: r.updated_at || r.timestamp,

      // Joined fields
      accountName: r.account_name,
      categoryName: r.category_name,
      categoryColor: r.category_color,
      categoryIcon: r.category_icon,
    }));
  }

  public async getTransactionById(id: string): Promise<Transaction | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<any>(
      `SELECT t.*, 
              COALESCE(a.name, 'Unassigned Account') as account_name, 
              c.name as category_name, 
              c.color_hex as category_color, 
              c.icon_name as category_icon
       FROM transactions t
       LEFT JOIN accounts a ON t.account_id = a.id
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.id = ? AND t.is_deleted = 0;`,
      [id]
    );
    if (!row) return null;
    return {
      id: row.id,
      accountId: row.account_id,
      destinationAccountId: row.destination_account_id,
      categoryId: row.category_id,
      amount: row.amount,
      type: row.type,
      merchantName: row.merchant_name,
      cleanMerchant: row.clean_merchant,
      notes: row.notes,
      status: row.status,
      timestamp: row.timestamp,
      isDeleted: Boolean(row.is_deleted),
      source: row.source,
      rawSourceMessage: row.raw_source_message,
      sourceTimestamp: row.source_timestamp,
      refNumber: row.ref_number,
      transactionNumber: row.transaction_number,
      sender: row.sender,
      recipient: row.recipient,
      balanceAfterTransaction:
        row.balance_after_transaction !== null && row.balance_after_transaction !== undefined
          ? Number(row.balance_after_transaction)
          : null,
      parserVersion: row.parser_version,
      templateId: row.template_id,
      confidenceScore:
        row.confidence_score !== null && row.confidence_score !== undefined
          ? Number(row.confidence_score)
          : null,
      aiOperationUsed: row.ai_operation_used,
      originalAmount:
        row.original_amount !== null && row.original_amount !== undefined
          ? Number(row.original_amount)
          : null,
      originalMerchantName: row.original_merchant_name,
      originalCategoryId: row.original_category_id,
      userEditedAt: row.user_edited_at,
      createdAt: row.created_at || row.timestamp,
      updatedAt: row.updated_at || row.timestamp,
      accountName: row.account_name,
      categoryName: row.category_name,
      categoryColor: row.category_color,
      categoryIcon: row.category_icon,
    };
  }

  public async createTransaction(
    tx: Omit<Transaction, 'id' | 'isDeleted' | 'createdAt' | 'updatedAt'> &
      Partial<Pick<Transaction, 'createdAt' | 'updatedAt'>>
  ): Promise<Transaction> {
    const db = await this.getDb();
    const id = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const createdAt = tx.createdAt || now;
    const updatedAt = tx.updatedAt || now;

    // Preserving 3-stage audit trail:
    // Original values default to parsed values if not explicitly provided
    const originalAmount =
      tx.originalAmount !== undefined && tx.originalAmount !== null ? tx.originalAmount : tx.amount;
    const originalMerchantName = tx.originalMerchantName || tx.merchantName;
    const originalCategoryId =
      tx.originalCategoryId !== undefined ? tx.originalCategoryId : (tx.categoryId || null);

    await db.runAsync(
      `INSERT INTO transactions (
        id, account_id, destination_account_id, category_id, amount, type,
        merchant_name, clean_merchant, notes, status, timestamp, is_deleted,
        source, raw_source_message, source_timestamp, ref_number, transaction_number,
        sender, recipient, balance_after_transaction, parser_version, template_id,
        confidence_score, ai_operation_used, original_amount, original_merchant_name,
        original_category_id, user_edited_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        tx.accountId,
        tx.destinationAccountId || null,
        tx.categoryId || null,
        tx.amount,
        tx.type,
        tx.merchantName,
        tx.cleanMerchant || tx.merchantName,
        tx.notes || null,
        tx.status || 'CONFIRMED',
        tx.timestamp,
        tx.source,
        tx.rawSourceMessage || null,
        tx.sourceTimestamp || null,
        tx.refNumber || null,
        tx.transactionNumber || null,
        tx.sender || null,
        tx.recipient || null,
        tx.balanceAfterTransaction !== undefined ? tx.balanceAfterTransaction : null,
        tx.parserVersion || null,
        tx.templateId || null,
        tx.confidenceScore !== undefined ? tx.confidenceScore : null,
        tx.aiOperationUsed || null,
        originalAmount,
        originalMerchantName,
        originalCategoryId,
        tx.userEditedAt || null,
        createdAt,
        updatedAt,
      ]
    );

    return {
      ...tx,
      id,
      isDeleted: false,
      originalAmount,
      originalMerchantName,
      originalCategoryId,
      createdAt,
      updatedAt,
    };
  }

  public async confirmTransaction(id: string, updates?: Partial<Transaction>): Promise<void> {
    const db = await this.getDb();
    const now = new Date().toISOString();

    await db.runAsync(
      `UPDATE transactions SET 
        status = 'CONFIRMED',
        category_id = COALESCE(?, category_id),
        clean_merchant = COALESCE(?, clean_merchant),
        merchant_name = COALESCE(?, merchant_name),
        amount = COALESCE(?, amount),
        notes = COALESCE(?, notes),
        user_edited_at = CASE WHEN ? IS NOT NULL OR ? IS NOT NULL OR ? IS NOT NULL OR ? IS NOT NULL THEN ? ELSE user_edited_at END,
        updated_at = ?
       WHERE id = ?;`,
      [
        updates?.categoryId ?? null,
        updates?.cleanMerchant ?? null,
        updates?.merchantName ?? null,
        updates?.amount ?? null,
        updates?.notes ?? null,
        updates?.categoryId ?? null,
        updates?.cleanMerchant ?? null,
        updates?.merchantName ?? null,
        updates?.amount ?? null,
        now,
        now,
        id,
      ]
    );
  }

  public async ignoreTransaction(id: string): Promise<void> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE transactions SET status = 'IGNORED', updated_at = ? WHERE id = ?;`,
      [now, id]
    );
  }

  /**
   * Explicitly associates a previously unassigned candidate transaction with a user-created account.
   */
  public async assignAccountToTransaction(transactionId: string, accountId: string): Promise<void> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE transactions SET account_id = ?, updated_at = ? WHERE id = ?;`,
      [accountId, now, transactionId]
    );
  }

  // --- 4-Tier Duplicate & Proximity Match Detection Engine ---

  public async findMatchingTransaction(
    queryOrAmount: DuplicateMatchQuery | number,
    approxTimestamp?: string,
    toleranceMinutes = 120
  ): Promise<MatchResult> {
    const db = await this.getDb();

    // Normalize arguments for both object query and legacy positional parameters
    const query: DuplicateMatchQuery =
      typeof queryOrAmount === 'object'
        ? queryOrAmount
        : {
            amount: queryOrAmount,
            timestamp: approxTimestamp || new Date().toISOString(),
            toleranceMinutes,
          };

    const targetTolerance = query.toleranceMinutes ?? 120;
    const targetDate = new Date(query.timestamp).getTime();
    const minTime = new Date(targetDate - targetTolerance * 60 * 1000).toISOString();
    const maxTime = new Date(targetDate + targetTolerance * 60 * 1000).toISOString();

    const mapRowToTx = (row: any): Transaction => ({
      id: row.id,
      accountId: row.account_id,
      destinationAccountId: row.destination_account_id,
      categoryId: row.category_id,
      amount: row.amount,
      type: row.type,
      merchantName: row.merchant_name,
      cleanMerchant: row.clean_merchant,
      notes: row.notes,
      status: row.status,
      timestamp: row.timestamp,
      isDeleted: Boolean(row.is_deleted),
      source: row.source,
      rawSourceMessage: row.raw_source_message,
      sourceTimestamp: row.source_timestamp,
      refNumber: row.ref_number,
      transactionNumber: row.transaction_number,
      sender: row.sender,
      recipient: row.recipient,
      balanceAfterTransaction:
        row.balance_after_transaction !== null && row.balance_after_transaction !== undefined
          ? Number(row.balance_after_transaction)
          : null,
      parserVersion: row.parser_version,
      templateId: row.template_id,
      confidenceScore:
        row.confidence_score !== null && row.confidence_score !== undefined
          ? Number(row.confidence_score)
          : null,
      aiOperationUsed: row.ai_operation_used,
      originalAmount:
        row.original_amount !== null && row.original_amount !== undefined
          ? Number(row.original_amount)
          : null,
      originalMerchantName: row.original_merchant_name,
      originalCategoryId: row.original_category_id,
      userEditedAt: row.user_edited_at,
      createdAt: row.created_at || row.timestamp,
      updatedAt: row.updated_at || row.timestamp,
      accountName: row.account_name,
    });

    // ----------------------------------------------------
    // Tier 1: Exact Reference Number / Transaction Number Match
    // ----------------------------------------------------
    const targetRef = query.refNumber?.trim();
    const targetTxnNum = query.transactionNumber?.trim();

    if (targetRef || targetTxnNum) {
      const refToSearch = targetRef || targetTxnNum!;
      const row = await db.getFirstAsync<any>(
        `SELECT t.*, COALESCE(a.name, 'Unassigned Account') as account_name
         FROM transactions t
         LEFT JOIN accounts a ON t.account_id = a.id
         WHERE (t.ref_number = ? OR t.transaction_number = ?)
           AND t.is_deleted = 0
         LIMIT 1;`,
        [refToSearch, refToSearch]
      );

      if (row) {
        return {
          matchFound: true,
          transaction: mapRowToTx(row),
          confidence: 'EXACT_REFERENCE',
          matchReason: `Exact reference matched provider confirmation (${refToSearch}).`,
        };
      }
    }

    // ----------------------------------------------------
    // Tier 2: Account + Exact Ref Match (Scoped to specific account)
    // ----------------------------------------------------
    if (query.accountId && (targetRef || targetTxnNum)) {
      const refToSearch = targetRef || targetTxnNum!;
      const row = await db.getFirstAsync<any>(
        `SELECT t.*, COALESCE(a.name, 'Unassigned Account') as account_name
         FROM transactions t
         JOIN accounts a ON t.account_id = a.id
         WHERE t.account_id = ?
           AND (t.ref_number = ? OR t.transaction_number = ?)
           AND t.is_deleted = 0
         LIMIT 1;`,
        [query.accountId, refToSearch, refToSearch]
      );

      if (row) {
        return {
          matchFound: true,
          transaction: mapRowToTx(row),
          confidence: 'EXACT_REFERENCE',
          matchReason: `Account ${row.account_name} reference matched (${refToSearch}).`,
        };
      }
    }

    // ----------------------------------------------------
    // Tier 3: Clean Merchant + Account + Same Date + Amount Match
    // ----------------------------------------------------
    if (query.cleanMerchant && query.accountId && query.amount > 0) {
      const dayStart = query.timestamp.substring(0, 10) + 'T00:00:00.000Z';
      const dayEnd = query.timestamp.substring(0, 10) + 'T23:59:59.999Z';

      const row = await db.getFirstAsync<any>(
        `SELECT t.*, COALESCE(a.name, 'Unassigned Account') as account_name
         FROM transactions t
         JOIN accounts a ON t.account_id = a.id
         WHERE t.account_id = ?
           AND t.amount = ?
           AND LOWER(t.clean_merchant) = LOWER(?)
           AND t.timestamp BETWEEN ? AND ?
           AND t.is_deleted = 0
         LIMIT 1;`,
        [query.accountId, query.amount, query.cleanMerchant.trim(), dayStart, dayEnd]
      );

      if (row) {
        return {
          matchFound: true,
          transaction: mapRowToTx(row),
          confidence: 'HIGH_METADATA',
          matchReason: `Same merchant (${query.cleanMerchant}), account, and amount matched on ${query.timestamp.substring(0, 10)}.`,
        };
      }
    }

    // ----------------------------------------------------
    // Tier 4: Amount + Timestamp Proximity Window (default ±2h)
    // ----------------------------------------------------
    if (query.amount > 0 && query.timestamp) {
      const row = await db.getFirstAsync<any>(
        `SELECT t.*, COALESCE(a.name, 'Unassigned Account') as account_name
         FROM transactions t
         LEFT JOIN accounts a ON t.account_id = a.id
         WHERE t.amount = ?
           AND t.timestamp BETWEEN ? AND ?
           AND t.is_deleted = 0
         ORDER BY ABS(strftime('%s', t.timestamp) - strftime('%s', ?)) ASC
         LIMIT 1;`,
        [query.amount, minTime, maxTime, query.timestamp]
      );

      if (row) {
        return {
          matchFound: true,
          transaction: mapRowToTx(row),
          confidence: 'PROXIMITY_AMOUNT',
          matchReason: `Proximity match: exact amount (${query.amount} ETB) within ±${targetTolerance}m on ${row.account_name}.`,
        };
      }
    }

    return {
      matchFound: false,
      transaction: null,
      confidence: 'NONE',
      matchReason: 'No matching transaction found in ledger.',
    };
  }

  // --- Categories & Budgets ---

  public async getCategories(): Promise<Category[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM categories ORDER BY display_order ASC;'
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      iconName: r.icon_name,
      colorHex: r.color_hex,
      displayOrder: r.display_order,
      isDefault: Boolean(r.is_default),
    }));
  }

  public async getBudgetsWithSpent(month: number, year: number): Promise<
    Array<{
      category: Category;
      monthlyLimit: number;
      spentAmount: number;
      percentageSpent: number;
    }>
  > {
    const db = await this.getDb();
    const startDate = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00.000Z`;

    const rows = await db.getAllAsync<any>(
      `SELECT c.*, 
        COALESCE(b.monthly_limit, 0) as monthly_limit,
        COALESCE((
          SELECT SUM(amount) 
          FROM transactions 
          WHERE category_id = c.id 
            AND type = 'EXPENSE' 
            AND is_deleted = 0 
            AND status = 'CONFIRMED'
            AND timestamp >= ? AND timestamp < ?
        ), 0) as spent_amount
       FROM categories c
       LEFT JOIN budgets b ON b.category_id = c.id AND b.month = ? AND b.year = ?
       ORDER BY c.display_order ASC;`,
      [startDate, endDate, month, year]
    );

    return rows.map((r) => {
      const limit = r.monthly_limit;
      const spent = r.spent_amount;
      const pct = limit > 0 ? Math.min(Math.round((spent / limit) * 100), 100) : 0;
      return {
        category: {
          id: r.id,
          name: r.name,
          iconName: r.icon_name,
          colorHex: r.color_hex,
          displayOrder: r.display_order,
          isDefault: Boolean(r.is_default),
        },
        monthlyLimit: limit,
        spentAmount: spent,
        percentageSpent: pct,
      };
    });
  }

  // --- Local Financial Metric Aggregations (Zero API Dependency) ---

  public async getMonthlyMetrics(month: number, year: number): Promise<{
    totalIncome: number;
    totalExpense: number;
    netSavings: number;
    topCategories: Array<{ name: string; amount: number; percentage: number; color: string }>;
    topMerchants: Array<{ merchant: string; amount: number; count: number }>;
    spendingByWeek: Array<{ week: number; amount: number }>;
  }> {
    const db = await this.getDb();
    const startDate = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00.000Z`;

    // Totals
    const totals = await db.getFirstAsync<{ income: number; expense: number }>(
      `SELECT 
        COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) as expense
       FROM transactions
       WHERE is_deleted = 0 
         AND status = 'CONFIRMED'
         AND timestamp >= ? AND timestamp < ?;`,
      [startDate, endDate]
    );

    const totalIncome = totals?.income ?? 0;
    const totalExpense = totals?.expense ?? 0;
    const netSavings = totalIncome - totalExpense;

    // Top Categories
    const categoryRows = await db.getAllAsync<{ name: string; color_hex: string; amount: number }>(
      `SELECT c.name, c.color_hex, SUM(t.amount) as amount
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       WHERE t.type = 'EXPENSE' 
         AND t.is_deleted = 0 
         AND t.status = 'CONFIRMED'
         AND t.timestamp >= ? AND t.timestamp < ?
       GROUP BY c.id
       ORDER BY amount DESC
       LIMIT 6;`,
      [startDate, endDate]
    );

    const topCategories = categoryRows.map((c) => ({
      name: c.name,
      amount: c.amount,
      color: c.color_hex,
      percentage: totalExpense > 0 ? Math.round((c.amount / totalExpense) * 100) : 0,
    }));

    // Top Merchants
    const merchantRows = await db.getAllAsync<{ merchant: string; amount: number; count: number }>(
      `SELECT COALESCE(clean_merchant, merchant_name) as merchant, SUM(amount) as amount, COUNT(*) as count
       FROM transactions
       WHERE type = 'EXPENSE' 
         AND is_deleted = 0 
         AND status = 'CONFIRMED'
         AND timestamp >= ? AND timestamp < ?
       GROUP BY merchant
       ORDER BY amount DESC
       LIMIT 5;`,
      [startDate, endDate]
    );

    return {
      totalIncome,
      totalExpense,
      netSavings,
      topCategories,
      topMerchants: merchantRows,
      spendingByWeek: [], // Computed on demand
    };
  }

  // --- AI Usage Tracking ---

  public async logAiUsage(log: Omit<AiUsageLog, 'id' | 'timestamp'>): Promise<void> {
    const db = await this.getDb();
    const id = `ai_log_${Date.now()}`;
    const timestamp = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO ai_usage_log (
        id, timestamp, operation_type, model_id, 
        prompt_tokens_recorded, response_tokens_recorded, 
        estimated_category, latency_ms, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        timestamp,
        log.operationType,
        log.modelId,
        log.promptTokensRecorded ?? null,
        log.responseTokensRecorded ?? null,
        log.estimatedCategory ?? null,
        log.latencyMs,
        log.status,
      ]
    );
  }

  public async getAiUsageSummary(): Promise<{
    totalRequests: number;
    receiptScans: number;
    smsFallbacks: number;
    merchantAnalysis: number;
    monthlyAnalysis: number;
  }> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<{ operation_type: string; count: number }>(
      `SELECT operation_type, COUNT(*) as count
       FROM ai_usage_log
       GROUP BY operation_type;`
    );

    let receiptScans = 0;
    let smsFallbacks = 0;
    let merchantAnalysis = 0;
    let monthlyAnalysis = 0;
    let totalRequests = 0;

    for (const r of rows) {
      totalRequests += r.count;
      if (r.operation_type === 'RECEIPT') receiptScans = r.count;
      if (r.operation_type === 'SMS_FALLBACK') smsFallbacks = r.count;
      if (r.operation_type === 'MERCHANT') merchantAnalysis = r.count;
      if (r.operation_type === 'MONTHLY_ANALYSIS') monthlyAnalysis = r.count;
    }

    return {
      totalRequests,
      receiptScans,
      smsFallbacks,
      merchantAnalysis,
      monthlyAnalysis,
    };
  }

  // --- Savings Goals ---

  public async getSavingsGoals(): Promise<SavingsGoal[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM savings_goals ORDER BY is_completed ASC, target_date ASC;`
    );

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      targetAmount: r.target_amount,
      savedAmount: r.saved_amount,
      targetDate: r.target_date,
      iconName: r.icon_name,
      colorHex: r.color_hex,
      isCompleted: Boolean(r.is_completed),
    }));
  }

  public async createSavingsGoal(
    goal: Omit<SavingsGoal, 'id' | 'isCompleted'>
  ): Promise<SavingsGoal> {
    const db = await this.getDb();
    const id = `goal_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await db.runAsync(
      `INSERT INTO savings_goals (id, title, target_amount, saved_amount, target_date, icon_name, color_hex, is_completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0);`,
      [id, goal.title, goal.targetAmount, goal.savedAmount || 0, goal.targetDate, goal.iconName || 'Target', goal.colorHex || '#10B981']
    );

    return {
      ...goal,
      id,
      savedAmount: goal.savedAmount || 0,
      isCompleted: false,
    };
  }

  public async updateSavingsGoal(id: string, updates: Partial<SavingsGoal>): Promise<void> {
    const db = await this.getDb();
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) {
      setClauses.push('title = ?');
      values.push(updates.title);
    }
    if (updates.targetAmount !== undefined) {
      setClauses.push('target_amount = ?');
      values.push(updates.targetAmount);
    }
    if (updates.savedAmount !== undefined) {
      setClauses.push('saved_amount = ?');
      values.push(updates.savedAmount);
    }
    if (updates.targetDate !== undefined) {
      setClauses.push('target_date = ?');
      values.push(updates.targetDate);
    }
    if (updates.iconName !== undefined) {
      setClauses.push('icon_name = ?');
      values.push(updates.iconName);
    }
    if (updates.colorHex !== undefined) {
      setClauses.push('color_hex = ?');
      values.push(updates.colorHex);
    }
    if (updates.isCompleted !== undefined) {
      setClauses.push('is_completed = ?');
      values.push(updates.isCompleted ? 1 : 0);
    }

    if (setClauses.length === 0) return;

    values.push(id);
    await db.runAsync(
      `UPDATE savings_goals SET ${setClauses.join(', ')} WHERE id = ?;`,
      values
    );
  }

  public async deleteSavingsGoal(id: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync('DELETE FROM savings_goals WHERE id = ?;', [id]);
  }

  // --- Account Reconciliation ---

  public async reconcileAccount(
    accountId: string,
    actualBalance: number,
    notes?: string
  ): Promise<Transaction | null> {
    const accounts = await this.getAccounts();
    const account = accounts.find((a) => a.id === accountId);
    if (!account) throw new Error('Account not found');

    const currentCalculated = account.calculatedBalance ?? account.openingBalance ?? 0;
    const discrepancy = actualBalance - currentCalculated;

    // If exactly 0, no adjustment transaction needed
    if (Math.abs(discrepancy) < 0.01) {
      return null;
    }

    const type = discrepancy > 0 ? 'INCOME' : 'EXPENSE';
    const amount = Math.abs(discrepancy);
    const now = new Date().toISOString();

    return await this.createTransaction({
      accountId,
      amount,
      type,
      merchantName: 'Reconciliation Adjustment',
      cleanMerchant: 'Reconciliation',
      notes: notes || `Manual ledger balance reconciliation (Actual: ${actualBalance} ETB, Previous: ${currentCalculated} ETB)`,
      status: 'CONFIRMED',
      timestamp: now,
      source: 'MANUAL',
      confidenceScore: 1.0,
      balanceAfterTransaction: actualBalance,
    });
  }
}

export const dbService = new DatabaseService();
