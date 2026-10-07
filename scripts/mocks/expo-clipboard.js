let clipboardContent = '';

module.exports = {
  hasStringAsync: async () => Boolean(clipboardContent && clipboardContent.trim()),
  getStringAsync: async () => clipboardContent,
  setStringAsync: async (text) => {
    clipboardContent = text;
    return true;
  },
  __setClipboardText: (text) => {
    clipboardContent = text;
  },
  __getClipboardText: () => clipboardContent,
  addClipboardListener: () => ({ remove: () => {} }),
};
