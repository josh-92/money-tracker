const storage = new Map();

const mock = {
  setItemAsync: async (key, value) => {
    storage.set(key, String(value));
  },
  getItemAsync: async (key) => {
    return storage.has(key) ? storage.get(key) : null;
  },
  deleteItemAsync: async (key) => {
    storage.delete(key);
  },
  _clear: () => {
    storage.clear();
  },
  _dump: () => Object.fromEntries(storage),
};

module.exports = mock;
module.exports.default = mock;
