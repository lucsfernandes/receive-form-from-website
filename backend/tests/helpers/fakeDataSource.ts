/**
 * In-memory stand-in for the TypeORM repositories the auth service hits.
 *
 * The implementation is intentionally narrow — only the methods the auth
 * service actually calls are implemented. If a future change touches a
 * method that's not here yet, the suite will throw and the missing call
 * will be obvious in the trace.
 *
 * Why mock the data source instead of spinning up a real Postgres:
 *   - The auth flows we want to assert (rotation, family revocation,
 *     password change) don't depend on any pg-specific behaviour (no
 *     pg_trgm, no LOWER() index quirks). The query-builder for
 *     findByEmail is the one exception — we keep its semantics by
 *     comparing email lowercased here.
 *   - Tests run in ~1 second end-to-end with no docker / no migrations.
 *   - Integration around pg_trgm search lives on the contact side and
 *     isn't part of this auth slice.
 */
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import type { Repository } from 'typeorm';
import { IsNull, LessThan, Not } from 'typeorm';
import type { User } from '../../src/entities/User';
import type { RefreshToken } from '../../src/entities/RefreshToken';
import type { PasswordResetToken } from '../../src/entities/PasswordResetToken';

// TypeORM exports these as proxies — when we compare against them in our
// fake `update` matcher, we identify them by referential equality.
const IS_NULL_SENTINEL = IsNull();
const LESS_THAN_SENTINEL = LessThan(new Date(0));
const NOT_SENTINEL_PROTO = Object.getPrototypeOf(Not(''));

function isIsNullMatcher(v: unknown): boolean {
  if (v === IS_NULL_SENTINEL) return true;
  // typeorm's FindOperator carries a `_type` property — sniff that.
  return Boolean(
    v && typeof v === 'object' && (v as { _type?: string })._type === 'isNull',
  );
}

function isLessThanMatcher(v: unknown): { value: Date } | null {
  if (v === LESS_THAN_SENTINEL) return { value: new Date() };
  const op = v as { _type?: string; _value?: unknown } | undefined;
  if (op && op._type === 'lessThan' && op._value instanceof Date) {
    return { value: op._value };
  }
  return null;
}

function isNotMatcher(v: unknown): { value: unknown } | null {
  if (
    v &&
    typeof v === 'object' &&
    Object.getPrototypeOf(v) === NOT_SENTINEL_PROTO
  ) {
    return { value: (v as { _value: unknown })._value };
  }
  const op = v as { _type?: string; _value?: unknown } | undefined;
  if (op && op._type === 'not') return { value: op._value };
  return null;
}

interface FakeUser {
  id: string;
  email: string;
  passwordHash: string;
  role: 'admin';
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface FakeStore {
  users: Map<string, FakeUser>;
  refreshTokens: Map<string, RefreshToken>;
  passwordResetTokens: Map<string, PasswordResetToken>;
}

export function newStore(): FakeStore {
  return {
    users: new Map(),
    refreshTokens: new Map(),
    passwordResetTokens: new Map(),
  };
}

function matches(row: Record<string, unknown>, criteria: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(criteria)) {
    const rowVal = row[k];
    if (isIsNullMatcher(v)) {
      if (rowVal !== null && rowVal !== undefined) return false;
      continue;
    }
    const lt = isLessThanMatcher(v);
    if (lt) {
      if (!(rowVal instanceof Date) || rowVal.getTime() >= lt.value.getTime()) return false;
      continue;
    }
    const notM = isNotMatcher(v);
    if (notM) {
      if (rowVal === notM.value) return false;
      continue;
    }
    // typeorm treats `undefined` in a query criteria like an "is null" — match
    // that here so existing call sites in authService keep working.
    if (v === undefined) {
      if (rowVal !== null && rowVal !== undefined) return false;
      continue;
    }
    if (rowVal !== v) return false;
  }
  return true;
}

function buildUserRepo(store: FakeStore): Repository<User> {
  return {
    create: vi.fn((partial: Partial<FakeUser>) => {
      return {
        id: randomUUID(),
        role: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null,
        ...partial,
      } as unknown as User;
    }),
    save: vi.fn(async (entity: FakeUser) => {
      const existing = store.users.get(entity.id);
      // Enforce the unique(email) constraint that the real schema applies on
      // lower(email). Mirrors the 23505 we throw on duplicate inserts.
      for (const other of store.users.values()) {
        if (other.id !== entity.id && other.email.toLowerCase() === entity.email.toLowerCase()) {
          const err = new Error('duplicate key value violates unique constraint');
          (err as { code?: string }).code = '23505';
          throw err;
        }
      }
      const next: FakeUser = existing
        ? { ...existing, ...entity, updatedAt: new Date() }
        : {
            id: entity.id ?? randomUUID(),
            email: entity.email,
            passwordHash: entity.passwordHash,
            role: 'admin',
            createdAt: existing ? (existing as FakeUser).createdAt : new Date(),
            updatedAt: new Date(),
            lastLoginAt: entity.lastLoginAt ?? null,
          };
      store.users.set(next.id, next);
      return next as unknown as User;
    }),
    findOne: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      for (const u of store.users.values()) {
        if (matches(u as unknown as Record<string, unknown>, where)) {
          return u as unknown as User;
        }
      }
      return null;
    }),
    count: vi.fn(async () => store.users.size),
    createQueryBuilder: vi.fn((alias?: string) => {
      // Only used by findByEmail with `LOWER(u.email) = LOWER(:email)`.
      let _alias = alias;
      void _alias;
      let emailLower: string | null = null;
      const qb = {
        where: vi.fn((_clause: string, params: Record<string, string>) => {
          emailLower = (params.email ?? '').toLowerCase();
          return qb;
        }),
        getOne: vi.fn(async () => {
          if (emailLower === null) return null;
          for (const u of store.users.values()) {
            if (u.email.toLowerCase() === emailLower) return u as unknown as User;
          }
          return null;
        }),
      };
      return qb;
    }),
  } as unknown as Repository<User>;
}

function buildRefreshRepo(store: FakeStore): Repository<RefreshToken> {
  return {
    create: vi.fn((partial: Partial<RefreshToken>) => {
      return {
        id: randomUUID(),
        createdAt: new Date(),
        revokedAt: null,
        ...partial,
      } as RefreshToken;
    }),
    save: vi.fn(async (entity: RefreshToken) => {
      store.refreshTokens.set(entity.id, entity);
      return entity;
    }),
    findOne: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      for (const row of store.refreshTokens.values()) {
        if (matches(row as unknown as Record<string, unknown>, where)) return row;
      }
      return null;
    }),
    update: vi.fn(
      async (
        criteria: Record<string, unknown>,
        partial: Partial<RefreshToken>,
      ) => {
        let affected = 0;
        for (const row of store.refreshTokens.values()) {
          if (matches(row as unknown as Record<string, unknown>, criteria)) {
            Object.assign(row, partial);
            affected += 1;
          }
        }
        return { affected };
      },
    ),
    delete: vi.fn(async (criteria: Record<string, unknown>) => {
      let affected = 0;
      for (const [id, row] of store.refreshTokens) {
        if (matches(row as unknown as Record<string, unknown>, criteria)) {
          store.refreshTokens.delete(id);
          affected += 1;
        }
      }
      return { affected };
    }),
  } as unknown as Repository<RefreshToken>;
}

function buildResetRepo(store: FakeStore): Repository<PasswordResetToken> {
  return {
    create: vi.fn((partial: Partial<PasswordResetToken>) => {
      return {
        id: randomUUID(),
        createdAt: new Date(),
        usedAt: null,
        ...partial,
      } as PasswordResetToken;
    }),
    save: vi.fn(async (entity: PasswordResetToken) => {
      store.passwordResetTokens.set(entity.id, entity);
      return entity;
    }),
    findOne: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      for (const row of store.passwordResetTokens.values()) {
        if (matches(row as unknown as Record<string, unknown>, where)) return row;
      }
      return null;
    }),
    update: vi.fn(
      async (
        criteria: Record<string, unknown>,
        partial: Partial<PasswordResetToken>,
      ) => {
        let affected = 0;
        for (const row of store.passwordResetTokens.values()) {
          if (matches(row as unknown as Record<string, unknown>, criteria)) {
            Object.assign(row, partial);
            affected += 1;
          }
        }
        return { affected };
      },
    ),
    delete: vi.fn(async (criteria: Record<string, unknown>) => {
      let affected = 0;
      for (const [id, row] of store.passwordResetTokens) {
        if (matches(row as unknown as Record<string, unknown>, criteria)) {
          store.passwordResetTokens.delete(id);
          affected += 1;
        }
      }
      return { affected };
    }),
  } as unknown as Repository<PasswordResetToken>;
}

/**
 * Install the fake repositories on the real AppDataSource. Returns a teardown
 * that restores the original `getRepository`. Call from a beforeEach/afterEach
 * pair to keep the test runtime isolated from any leftover state.
 */
export async function installFakeDataSource(): Promise<{
  store: FakeStore;
  uninstall: () => void;
}> {
  const { AppDataSource } = await import('../../src/config/data-source');
  const store = newStore();
  const userRepo = buildUserRepo(store);
  const refreshRepo = buildRefreshRepo(store);
  const resetRepo = buildResetRepo(store);

  // Pretend the data source is initialised so the auth service's repo lookups
  // don't try to lazy-init a real DB connection.
  Object.defineProperty(AppDataSource, 'isInitialized', {
    configurable: true,
    get: () => true,
  });

  const originalGet = AppDataSource.getRepository.bind(AppDataSource);
  AppDataSource.getRepository = (target: unknown) => {
    const name =
      typeof target === 'function' ? target.name : (target as { name?: string })?.name;
    switch (name) {
      case 'User':
        return userRepo;
      case 'RefreshToken':
        return refreshRepo;
      case 'PasswordResetToken':
        return resetRepo;
      default:
        return originalGet(target as Parameters<typeof originalGet>[0]);
    }
  };

  return {
    store,
    uninstall: () => {
      AppDataSource.getRepository = originalGet;
    },
  };
}
