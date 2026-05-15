/**
 * Vitest setup hook.
 *
 * Loaded before any test module imports the app. We populate the env vars
 * `env.ts` validates at load time so we don't crash with "missing required
 * environment variable". The values here are placeholders — every test that
 * cares about a specific value sets it explicitly.
 */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
process.env.PORT = process.env.PORT ?? '0';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
process.env.AUTH_JWT_SECRET =
  process.env.AUTH_JWT_SECRET ??
  'test-jwt-secret-test-jwt-secret-test-jwt-secret-1234567890';
process.env.AUTH_COOKIE_SECURE = process.env.AUTH_COOKIE_SECURE ?? 'false';
process.env.AUTH_COOKIE_SAMESITE = process.env.AUTH_COOKIE_SAMESITE ?? 'lax';
// Cheap argon params so the suite doesn't take forever. Still real argon2.
// argon2's lower bound for memoryCost is 1024 KiB; using the minimum here.
process.env.AUTH_ARGON_MEM_KIB = process.env.AUTH_ARGON_MEM_KIB ?? '1024';
process.env.AUTH_ARGON_TIME_COST = process.env.AUTH_ARGON_TIME_COST ?? '2';
process.env.AUTH_ARGON_PARALLELISM = process.env.AUTH_ARGON_PARALLELISM ?? '1';
process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USER = process.env.DB_USER ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = process.env.DB_NAME ?? 'receive_forms_test';
