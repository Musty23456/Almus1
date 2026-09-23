process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test_refresh_secret';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://almus:almus_password@localhost:5432/almus_chat_test?schema=public';
