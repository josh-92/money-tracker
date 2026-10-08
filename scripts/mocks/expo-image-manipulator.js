const mock = {
  manipulateAsync: async (uri, actions, options) => ({
    uri,
    width: 1024,
    height: 768,
    base64: 'mock_base64_encoded_jpeg_string',
  }),
  SaveFormat: {
    JPEG: 'jpeg',
    PNG: 'png',
  },
};
module.exports = mock;
module.exports.default = mock;
