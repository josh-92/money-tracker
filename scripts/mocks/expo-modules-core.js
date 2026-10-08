module.exports = {
  requireNativeModule: () => null,
  EventEmitter: class {
    addListener() {
      return { remove: () => {} };
    }
  },
};
