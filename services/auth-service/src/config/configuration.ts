export default () => ({
  app: {
    port: parseInt(process.env.APP_PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development',
    globalPrefix: 'api',
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'doer_auth_user',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'doer_auth',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
  },
  keycloak: {
    baseUrl: process.env.KEYCLOAK_BASE_URL || 'http://localhost:8080',
    realm: process.env.KEYCLOAK_REALM || 'doer',
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'doer-auth-svc',
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
  },
  apisix: {
    adminUrl: process.env.APISIX_ADMIN_URL || 'http://localhost:9180',
    // SECURITY: No default for admin key — must be set via environment
    adminKey: process.env.APISIX_ADMIN_KEY || '',
  },
});
