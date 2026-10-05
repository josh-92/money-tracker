/**
 * verify_migration.ts
 * Rigorous test script simulating SQLite database initialization and upgrades:
 * 1. Fresh database initialization (tables created, migration runs, all indexes built).
 * 2. Legacy database upgrade:
 *    - Creates a prototype transactions table WITHOUT transaction_number or audit fields
 *    - Inserts existing records
 *    - Executes CREATE_TABLES_SQL (must NOT fail with 'no such column: transaction_number')
 *    - Runs migration logic (ALTER TABLE for all missing columns)
 *    - Creates indexes
 *    - Asserts that all columns exist, all indexes exist, and legacy records remain intact!
 */

// @ts-ignore
import { DatabaseSync } from 'node:sqlite';

console.log('====================================================');
console.log('MONEY TRACKER: SQLITE SCHEMA MIGRATION AUDIT TEST');
console.log('====================================================\n');

let testsPassed = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
  }
}

// -------------------------------------------------------------
// 1. FRESH DATABASE INITIALIZATION
// -------------------------------------------------------------
console.log('--- 1. Testing Fresh Database Creation ---');

const freshDb = new DatabaseSync(':memory:');
freshDb.exec('PRAGMA foreign_keys = ON;');

// The DDL as exported in src/database/schema.ts
const CREATE_TABLES_SQL = `
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

CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider_key TEXT NOT NULL,
    account_mask TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'ETB',
    color_hex TEXT NOT NULL,
    icon_name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS opening_balances (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    amount REAL NOT NULL,
    effective_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon_name TEXT NOT NULL,
    color_hex TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    destination_account_id TEXT,
    category_id TEXT,
    amount REAL NOT NULL,
    type TEXT NOT NULL,
    merchant_name TEXT NOT NULL,
    clean_merchant TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'CONFIRMED',
    timestamp TEXT NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL,
    raw_source_message TEXT,
    source_timestamp TEXT,
    ref_number TEXT,
    transaction_number TEXT,
    sender TEXT,
    recipient TEXT,
    balance_after_transaction REAL,
    parser_version TEXT,
    template_id TEXT,
    confidence_score REAL,
    ai_operation_used TEXT,
    original_amount REAL,
    original_merchant_name TEXT,
    original_category_id TEXT,
    user_edited_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY,
    transaction_id TEXT,
    local_image_path TEXT NOT NULL,
    thumbnail_path TEXT,
    extracted_text TEXT,
    parsed_merchant TEXT,
    parsed_amount REAL,
    parsed_date TEXT,
    parsed_items_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
);
`;

freshDb.exec(CREATE_TABLES_SQL);

// Migration logic on fresh DB
function runTestMigration(db: DatabaseSync) {
  const tableInfo = db.prepare('PRAGMA table_info(transactions);').all() as Array<{ name: string }>;
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
      db.exec(`ALTER TABLE transactions ADD COLUMN ${col.name} ${col.type};`);
    }
  }

  // Ensure indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);
    CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
    CREATE INDEX IF NOT EXISTS idx_transactions_ref_number ON transactions(ref_number);
    CREATE INDEX IF NOT EXISTS idx_transactions_txn_number ON transactions(transaction_number);
    CREATE INDEX IF NOT EXISTS idx_receipts_transaction ON receipts(transaction_id);
  `);
}

let freshSuccess = true;
try {
  runTestMigration(freshDb);
} catch (e: any) {
  freshSuccess = false;
  console.error(e);
}
assert(freshSuccess, 'Fresh DB creates all tables, runs migration, and builds indexes without error');

// -------------------------------------------------------------
// 2. LEGACY DATABASE UPGRADE TEST (The bug reproduction & fix)
// -------------------------------------------------------------
console.log('\n--- 2. Testing Legacy Database Upgrade (Zero Data Loss) ---');

const legacyDb = new DatabaseSync(':memory:');
legacyDb.exec('PRAGMA foreign_keys = ON;');

// Create OLD legacy transactions table that lacks 'transaction_number', 'raw_source_message', etc.
legacyDb.exec(`
CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    category_id TEXT,
    amount REAL NOT NULL,
    type TEXT NOT NULL,
    merchant_name TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'CONFIRMED',
    timestamp TEXT NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL
);
`);

// Insert legacy transactions
legacyDb.exec(`
INSERT INTO transactions (id, account_id, amount, type, merchant_name, timestamp, source)
VALUES 
  ('tx_legacy_1', 'acc_cbe', 500.0, 'EXPENSE', 'Kaldis Coffee', '2026-10-01T10:00:00Z', 'MANUAL'),
  ('tx_legacy_2', 'acc_telebirr', 1200.0, 'INCOME', 'Salary Advance', '2026-10-02T12:00:00Z', 'SMS');
`);

const initialLegacyCount = legacyDb.prepare('SELECT COUNT(*) as c FROM transactions;').get() as { c: number };
assert(initialLegacyCount.c === 2, 'Legacy DB populated with 2 existing user transactions');

// Check that transaction_number is indeed missing initially
const oldCols = (legacyDb.prepare('PRAGMA table_info(transactions);').all() as Array<{ name: string }>).map((c) => c.name);
assert(!oldCols.includes('transaction_number'), 'Legacy transactions table initially lacks transaction_number');
assert(!oldCols.includes('raw_source_message'), 'Legacy transactions table initially lacks raw_source_message');

// Execute CREATE_TABLES_SQL (Must not throw error on existing table!)
let ddlSuccess = true;
try {
  legacyDb.exec(CREATE_TABLES_SQL);
} catch (e: any) {
  ddlSuccess = false;
  console.error('DDL Error on legacy DB:', e);
}
assert(ddlSuccess, 'CREATE_TABLES_SQL executes without error on legacy database');

// Execute migration runner
let migrationSuccess = true;
try {
  runTestMigration(legacyDb);
} catch (e: any) {
  migrationSuccess = false;
  console.error('Migration Error on legacy DB:', e);
}
assert(migrationSuccess, 'runMigrations dynamically alters legacy table and builds indexes without error');

// Verify all new columns now exist
const migratedCols = (legacyDb.prepare('PRAGMA table_info(transactions);').all() as Array<{ name: string }>).map((c) => c.name);
assert(migratedCols.includes('transaction_number'), 'transaction_number column successfully added');
assert(migratedCols.includes('raw_source_message'), 'raw_source_message column successfully added');
assert(migratedCols.includes('ref_number'), 'ref_number column successfully added');
assert(migratedCols.includes('clean_merchant'), 'clean_merchant column successfully added');
assert(migratedCols.includes('balance_after_transaction'), 'balance_after_transaction column successfully added');

// Verify indexes exist in sqlite_master
const indexes = (legacyDb.prepare("SELECT name FROM sqlite_master WHERE type='index';").all() as Array<{ name: string }>).map((i) => i.name);
assert(indexes.includes('idx_transactions_txn_number'), 'idx_transactions_txn_number index created on migrated column');
assert(indexes.includes('idx_transactions_ref_number'), 'idx_transactions_ref_number index created on migrated column');

// Verify legacy data was preserved completely
const postMigrationRows = legacyDb.prepare('SELECT * FROM transactions ORDER BY id ASC;').all() as Array<any>;
assert(postMigrationRows.length === 2, 'All 2 legacy transactions preserved with zero data loss');
assert(postMigrationRows[0].id === 'tx_legacy_1' && postMigrationRows[0].amount === 500.0, 'tx_legacy_1 preserved intact');
assert(postMigrationRows[1].id === 'tx_legacy_2' && postMigrationRows[1].amount === 1200.0, 'tx_legacy_2 preserved intact');

// Test inserting new record with all new audit fields
legacyDb.exec(`
INSERT INTO transactions (
  id, account_id, amount, type, merchant_name, clean_merchant, timestamp, source,
  transaction_number, ref_number, raw_source_message, parser_version, confidence_score,
  created_at, updated_at
) VALUES (
  'tx_new_3', 'acc_cbe', 350.0, 'EXPENSE', 'Shell Petrol', 'Shell', '2026-10-04T15:00:00Z', 'NOTIFICATION',
  'TXN98765', 'FT26277981', 'Your CBE account has been debited 350.00 ETB for Shell', 'cbe_regex_v1', 0.98,
  '2026-10-04T15:00:00Z', '2026-10-04T15:00:00Z'
);
`);

const finalCount = legacyDb.prepare('SELECT COUNT(*) as c FROM transactions;').get() as { c: number };
assert(finalCount.c === 3, 'New transaction with full audit metadata successfully saved to migrated table');

console.log('\n====================================================');
console.log(`SUMMARY: ${testsPassed} of ${totalTests} tests passed`);
console.log('====================================================');

if (testsPassed === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
