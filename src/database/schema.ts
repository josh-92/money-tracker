/**
 * SQLite Database Schema and Seed Data
 * Enforces the approved v2.0.0 local-first vault architecture with 3-stage audit trail:
 * 1. Immutable Raw Source -> 2. Inferred Interpretation -> 3. User Edits
 */

import * as SQLite from 'expo-sqlite';

export const CREATE_TABLES_SQL = `
-- 1. Vault Profile (Local-Only Vault)
CREATE TABLE IF NOT EXISTS vault_profile (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone_number TEXT,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    passcode_hash TEXT,
    biometric_enabled INTEGER NOT NULL DEFAULT 0,
    auto_lock_minutes INTEGER NOT NULL DEFAULT 5,
    theme_preference TEXT NOT NULL DEFAULT 'dark',
    hide_balances_by_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

-- 2. Accounts & Wallets
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider_key TEXT NOT NULL, -- 'CBE', 'TELEBIRR', 'AWASH', 'CASH', 'CUSTOM'
    account_mask TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'ETB',
    color_hex TEXT NOT NULL,
    icon_name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

-- 3. Opening Balances (Explicit Immutable Ledger Starting Points)
CREATE TABLE IF NOT EXISTS opening_balances (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    amount REAL NOT NULL,
    effective_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- 4. Categories
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon_name TEXT NOT NULL,
    color_hex TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 1
);

-- 5. Transactions (The Core Auditable Ledger)
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT, -- Nullable when transaction is unmatched/unassigned
    destination_account_id TEXT, -- Populated only if type is 'TRANSFER'
    
    -- Current Active / User-Editable Values
    category_id TEXT,
    amount REAL NOT NULL,
    type TEXT NOT NULL, -- 'EXPENSE', 'INCOME', 'TRANSFER', 'OPENING_BALANCE', 'RECONCILIATION'
    merchant_name TEXT NOT NULL,
    clean_merchant TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'CONFIRMED', -- 'CONFIRMED', 'PENDING_REVIEW', 'IGNORED'
    timestamp TEXT NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,

    -- Immutable Original / Source Data
    source TEXT NOT NULL, -- 'NOTIFICATION', 'SMS', 'CLIPBOARD', 'RECEIPT', 'MANUAL'
    raw_source_message TEXT, -- Original untouched notification / receipt payload (IMMUTABLE)
    source_timestamp TEXT,
    ref_number TEXT, -- Provider Reference (e.g. CBE FT26277, Awash AW9876)
    transaction_number TEXT, -- Provider sequence/transaction ID (e.g. Telebirr CR12345)
    sender TEXT, -- Counterparty sender (for incoming transfer or credit)
    recipient TEXT, -- Counterparty recipient (for P2P transfer or merchant payment)
    balance_after_transaction REAL, -- Balance reported by bank/wallet right after txn
    
    -- Ingestion / Parser Audit Metadata
    parser_version TEXT, -- e.g. 'cbe_regex_v1', 'telebirr_p2p_v1'
    template_id TEXT, -- e.g. 'telebirr_payment_amharic'
    confidence_score REAL, -- 0.0 to 1.0 confidence score
    ai_operation_used TEXT, -- NULL, 'RECEIPT', 'SMS_FALLBACK', etc.
    
    -- User Override Audit Trail
    original_amount REAL, -- Amount originally parsed before any user manual edit
    original_merchant_name TEXT, -- Merchant originally parsed before user manual edit
    original_category_id TEXT, -- Category originally assigned before user manual edit
    user_edited_at TEXT, -- Timestamp when user last manually modified the transaction

    -- System Timestamps
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    FOREIGN KEY(destination_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY(original_category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- 6. Receipts
CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY,
    transaction_id TEXT,
    local_image_path TEXT NOT NULL,
    extracted_total REAL NOT NULL,
    extracted_tax REAL NOT NULL DEFAULT 0.0,
    raw_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
);

-- 7. Receipt Line Items
CREATE TABLE IF NOT EXISTS receipt_items (
    id TEXT PRIMARY KEY,
    receipt_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1.0,
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL,
    FOREIGN KEY(receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
);

-- 8. Budgets
CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL,
    monthly_limit REAL NOT NULL,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- 9. Savings Goals
CREATE TABLE IF NOT EXISTS savings_goals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    target_amount REAL NOT NULL,
    saved_amount REAL NOT NULL DEFAULT 0.0,
    target_date TEXT NOT NULL,
    icon_name TEXT NOT NULL,
    color_hex TEXT NOT NULL,
    is_completed INTEGER NOT NULL DEFAULT 0
);

-- 10. AI Usage Audit Log (Honest Usage Tracking)
CREATE TABLE IF NOT EXISTS ai_usage_log (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    operation_type TEXT NOT NULL, -- 'RECEIPT', 'SMS_FALLBACK', 'MERCHANT', 'CATEGORY', 'MONTHLY_ANALYSIS'
    model_id TEXT NOT NULL,
    prompt_tokens_recorded INTEGER,
    response_tokens_recorded INTEGER,
    estimated_category TEXT,
    latency_ms INTEGER NOT NULL,
    status TEXT NOT NULL -- 'SUCCESS', 'FAILED', 'TIMEOUT'
);

-- 11. End-of-Month AI Financial Report Cache
CREATE TABLE IF NOT EXISTS monthly_financial_report (
    id TEXT PRIMARY KEY,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    summary_headline TEXT NOT NULL,
    content_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
`;

/**
 * Migration Runner
 * Dynamically updates existing prototype databases to add any missing audit fields.
 * Safe to execute on every app launch without breaking existing data.
 */
export async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  const tableInfo = await db.getAllAsync<{ name: string }>('PRAGMA table_info(transactions);');
  const existingColumns = new Set(tableInfo.map((col) => col.name));

  const columnsToAdd: Array<{ name: string; type: string }> = [
    { name: 'destination_account_id', type: 'TEXT' },
    { name: 'clean_merchant', type: 'TEXT' },
    { name: 'raw_source_message', type: 'TEXT' },
    { name: 'source_timestamp', type: 'TEXT' },
    { name: 'ref_number', type: 'TEXT' },
    { name: 'transaction_number', type: 'TEXT' },
    { name: 'sender', type: 'TEXT' },
    { name: 'recipient', type: 'TEXT' },
    { name: 'balance_after_transaction', type: 'REAL' },
    { name: 'parser_version', type: 'TEXT' },
    { name: 'template_id', type: 'TEXT' },
    { name: 'confidence_score', type: 'REAL' },
    { name: 'ai_operation_used', type: 'TEXT' },
    { name: 'original_amount', type: 'REAL' },
    { name: 'original_merchant_name', type: 'TEXT' },
    { name: 'original_category_id', type: 'TEXT' },
    { name: 'user_edited_at', type: 'TEXT' },
    { name: 'created_at', type: 'TEXT' },
    { name: 'updated_at', type: 'TEXT' },
  ];

  for (const col of columnsToAdd) {
    if (!existingColumns.has(col.name)) {
      try {
        await db.execAsync(`ALTER TABLE transactions ADD COLUMN ${col.name} ${col.type};`);
      } catch (err) {
        console.warn(`Migration notice: Column ${col.name} already exists or alter skipped:`, err);
      }
    }
  }

  // Migrate vault_profile columns if missing
  try {
    const profileTableInfo = await db.getAllAsync<{ name: string }>('PRAGMA table_info(vault_profile);');
    const existingProfileCols = new Set(profileTableInfo.map((c) => c.name));
    if (!existingProfileCols.has('phone_number')) {
      await db.execAsync('ALTER TABLE vault_profile ADD COLUMN phone_number TEXT;');
    }
    if (!existingProfileCols.has('hide_balances_by_default')) {
      await db.execAsync('ALTER TABLE vault_profile ADD COLUMN hide_balances_by_default INTEGER NOT NULL DEFAULT 0;');
    }
  } catch (err) {
    console.warn('Profile migration error (ignored if fresh DB):', err);
  }

  // Ensure all ledger performance & reference indexes exist (now safe since all columns exist)
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);
    CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
    CREATE INDEX IF NOT EXISTS idx_transactions_ref_number ON transactions(ref_number);
    CREATE INDEX IF NOT EXISTS idx_transactions_txn_number ON transactions(transaction_number);
    CREATE INDEX IF NOT EXISTS idx_receipts_transaction ON receipts(transaction_id);
  `);
}

export const DEFAULT_CATEGORIES = [
  { id: 'cat_food', name: 'Food & Dining', iconName: 'Utensils', colorHex: '#F97316', displayOrder: 1 },
  { id: 'cat_groceries', name: 'Groceries', iconName: 'ShoppingCart', colorHex: '#10B981', displayOrder: 2 },
  { id: 'cat_transport', name: 'Transport & Fuel', iconName: 'Car', colorHex: '#3B82F6', displayOrder: 3 },
  { id: 'cat_utilities', name: 'Utilities & Internet', iconName: 'Zap', colorHex: '#6366F1', displayOrder: 4 },
  { id: 'cat_shopping', name: 'Shopping & Retail', iconName: 'ShoppingBag', colorHex: '#EC4899', displayOrder: 5 },
  { id: 'cat_health', name: 'Health & Pharmacy', iconName: 'HeartPulse', colorHex: '#EF4444', displayOrder: 6 },
  { id: 'cat_entertainment', name: 'Entertainment', iconName: 'Film', colorHex: '#8B5CF6', displayOrder: 7 },
  { id: 'cat_personal', name: 'Personal & Family', iconName: 'Gift', colorHex: '#14B8A6', displayOrder: 8 },
  { id: 'cat_income', name: 'Salary & Income', iconName: 'Briefcase', colorHex: '#22C55E', displayOrder: 9 },
  { id: 'cat_other', name: 'Other Expenses', iconName: 'MoreHorizontal', colorHex: '#64748B', displayOrder: 10 },
];

export const DEFAULT_ACCOUNTS_SEED = [
  {
    id: 'acc_cbe',
    name: 'Commercial Bank of Ethiopia',
    providerKey: 'CBE',
    accountMask: '**** 7852',
    currency: 'ETB',
    colorHex: '#7B1FA2',
    iconName: 'Landmark',
    displayOrder: 1,
    defaultOpeningBalance: 7250.0,
  },
  {
    id: 'acc_telebirr',
    name: 'Telebirr Wallet',
    providerKey: 'TELEBIRR',
    accountMask: '09** *** 289',
    currency: 'ETB',
    colorHex: '#00A3E0',
    iconName: 'Smartphone',
    displayOrder: 2,
    defaultOpeningBalance: 3100.0,
  },
  {
    id: 'acc_awash',
    name: 'Awash Bank',
    providerKey: 'AWASH',
    accountMask: '**** 3901',
    currency: 'ETB',
    colorHex: '#006A4E',
    iconName: 'Building2',
    displayOrder: 3,
    defaultOpeningBalance: 2100.0,
  },
  {
    id: 'acc_cash',
    name: 'Cash in Hand',
    providerKey: 'CASH',
    accountMask: 'Cash Wallet',
    currency: 'ETB',
    colorHex: '#10B981',
    iconName: 'Wallet',
    displayOrder: 4,
    defaultOpeningBalance: 850.0,
  },
];
