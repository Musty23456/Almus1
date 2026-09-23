import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',

  jwtSecret: required('JWT_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  jwtRefreshExpiresInDays: parseInt(process.env.JWT_REFRESH_EXPIRES_IN_DAYS ?? '30', 10),

  maxUploadSizeMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB ?? '25', 10),
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',

  storageEndpoint: process.env.STORAGE_ENDPOINT ?? '',
  storageAccessKey: process.env.STORAGE_ACCESS_KEY ?? '',
  storageSecretKey: process.env.STORAGE_SECRET_KEY ?? '',
  storageBucket: process.env.STORAGE_BUCKET ?? '',

  fcmServerKey: process.env.FCM_SERVER_KEY ?? '',
};
