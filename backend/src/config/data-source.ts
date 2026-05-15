import 'reflect-metadata';
import path from 'node:path';
import { DataSource } from 'typeorm';
import { ContactMessage } from '../entities/ContactMessage';
import { User } from '../entities/User';
import { RefreshToken } from '../entities/RefreshToken';
import { PasswordResetToken } from '../entities/PasswordResetToken';
import { env } from './env';

/**
 * The single TypeORM DataSource for the application.
 *
 * Synchronize is driven by env so that we can keep it on in dev for
 * convenience but always off in production (migrations are authoritative).
 *
 * Migrations live under `src/migrations` and are run as TS files via
 * typeorm-ts-node-commonjs from npm scripts (no compiled-only path).
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.db.host,
  port: env.db.port,
  username: env.db.username,
  password: env.db.password,
  database: env.db.database,
  synchronize: env.db.synchronize,
  logging: env.db.logging,
  entities: [ContactMessage, User, RefreshToken, PasswordResetToken],
  migrations: [path.join(__dirname, '..', 'migrations', '*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
  // Pool + per-connection timeouts. statement_timeout is a Postgres server-side
  // setting that aborts runaway queries; the other three shape the pg pool.
  extra: {
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
  },
});
