// In-memory mock for expo-sqlite for fast local test verification
const reports = new Map();
const genericStore = new Map();

const mockDb = {
  execSync: () => {},
  runSync: () => ({ changes: 0, lastInsertRowId: 0 }),
  getAllSync: () => [],
  getFirstSync: () => null,

  execAsync: async () => {},

  runAsync: async (sql, params = []) => {
    const s = sql.trim().toUpperCase();
    if (s.includes('INSERT INTO MONTHLY_FINANCIAL_REPORT')) {
      const [id, month, year, summary_headline, content_json, created_at] = params;
      reports.set(`${month}_${year}`, {
        id,
        month,
        year,
        summary_headline,
        content_json,
        created_at,
      });
      return { changes: 1, lastInsertRowId: 1 };
    }
    if (s.includes('DELETE FROM MONTHLY_FINANCIAL_REPORT')) {
      const [month, year] = params;
      reports.delete(`${month}_${year}`);
      return { changes: 1, lastInsertRowId: 0 };
    }
    return { changes: 0, lastInsertRowId: 0 };
  },

  getAllAsync: async (sql, params = []) => {
    const s = sql.trim().toUpperCase();
    if (s.includes('MONTHLY_FINANCIAL_REPORT')) {
      return Array.from(reports.values());
    }
    return [];
  },

  getFirstAsync: async (sql, params = []) => {
    const s = sql.trim().toUpperCase();
    if (s.includes('MONTHLY_FINANCIAL_REPORT')) {
      const [month, year] = params;
      return reports.get(`${month}_${year}`) || null;
    }
    return null;
  },
};

const mock = {
  openDatabaseSync: () => mockDb,
  openDatabaseAsync: async () => mockDb,
  _clear: () => {
    reports.clear();
    genericStore.clear();
  },
};

module.exports = mock;
module.exports.default = mock;
