const mock = {
  Platform: { OS: 'android', select: (obj) => obj.android || obj.default },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  StyleSheet: { create: (s) => s },
  View: 'View',
  Text: 'Text',
};
module.exports = mock;
module.exports.default = mock;
