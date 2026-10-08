const mock = {
  hasHardwareAsync: async () => true,
  isEnrolledAsync: async () => true,
  getEnrolledLevelAsync: async () => 2,
  authenticateAsync: async () => ({ success: true }),
  SecurityLevel: {
    NONE: 0,
    SECRET: 1,
    BIOMETRIC: 2,
  },
};

module.exports = mock;
module.exports.default = mock;
