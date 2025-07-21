export default {
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  },
  keepAliveTimeout: 65000,
  connectionTimeout: 10000,
  bodyLimit: 1048576,
  maxParamLength: 500,
  ignoreTrailingSlash: true,
  caseSensitive: false,
  requestIdLogLabel: 'reqId',
  requestIdHeader: 'x-request-id',
  trustProxy: true
}; 