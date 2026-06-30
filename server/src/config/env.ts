import dotenvSafe from 'dotenv-safe';
import dotenv from 'dotenv';
import path from 'path';

if (process.env.NODE_ENV !== 'production') {
  dotenvSafe.config({
    path: path.resolve(__dirname, '../../.env'),
    example: path.resolve(__dirname, '../../.env.example'),
    allowEmptyValues: false,
  });
} else {
  // In production, env vars are injected directly (e.g. Render dashboard)
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}

const config = {
  nodeEnv: process.env.NODE_ENV as string,
  port: parseInt(process.env.PORT as string, 10),
  mongodbUri: process.env.MONGODB_URI as string,
  upstashRedisRestUrl: process.env.UPSTASH_REDIS_REST_URL as string,
  upstashRedisRestToken: process.env.UPSTASH_REDIS_REST_TOKEN as string,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET as string,
    refreshSecret: process.env.JWT_REFRESH_SECRET as string,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN as string,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN as string,
  },
  email: {
    host: process.env.EMAIL_HOST as string,
    port: parseInt(process.env.EMAIL_PORT as string, 10),
    user: process.env.EMAIL_USER as string,
    pass: process.env.EMAIL_PASS as string,
    from: process.env.EMAIL_FROM as string,
  },
  clientUrl: process.env.CLIENT_URL as string,
  allowedOrigins: Array.from(
    new Set(
      [...(process.env.ALLOWED_ORIGINS ?? '').split(','), process.env.CLIENT_URL ?? '']
        .map((o) => o.trim().replace(/\/$/, ''))
        .filter(Boolean)
    )
  ),
  adminDefaultPassword: process.env.ADMIN_DEFAULT_PASSWORD as string,
};

export default config;
