import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import { users } from './schema.ts';

const PBKDF2_ITERATIONS = 10000;
const KEYLEN = 64;
const DIGEST = 'sha512';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEYLEN, DIGEST)
    .toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, key] = storedHash.split(':');
  const derived = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEYLEN, DIGEST)
    .toString('hex');
  const keyBuf = Buffer.from(key, 'hex');
  const derivedBuf = Buffer.from(derived, 'hex');
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string,
  role?: string,
  assignedRegion?: string
) {
  try {
    const existing = await db.select().from(users).where(eq(users.uid, uid));
    if (existing.length > 0) {
      const updated = await db
        .update(users)
        .set({
          email,
          lastLoginAt: new Date(),
          ...(role ? { role } : {}),
          ...(assignedRegion ? { assignedRegion } : {}),
        })
        .where(eq(users.uid, uid))
        .returning();
      return updated[0];
    }

    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName || email.split('@')[0],
        role: role || 'Executive Viewer',
        assignedRegion: assignedRegion || 'All India',
        lastLoginAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          lastLoginAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database user upsert failed:', error);
    throw new Error('Failed to synchronize user profile with database.', { cause: error });
  }
}

export async function updateUserRbacProfile(
  uid: string,
  updates: {
    role?: string;
    assignedRegion?: string;
    displayName?: string;
    newPassword?: string;
  }
) {
  try {
    const setPayload: Record<string, any> = {
      lastLoginAt: new Date(),
    };
    if (updates.role) setPayload.role = updates.role;
    if (updates.assignedRegion) setPayload.assignedRegion = updates.assignedRegion;
    if (updates.displayName) setPayload.displayName = updates.displayName;
    if (updates.newPassword && updates.newPassword.trim().length >= 6) {
      setPayload.passwordHash = hashPassword(updates.newPassword.trim());
    }

    const result = await db
      .update(users)
      .set(setPayload)
      .where(eq(users.uid, uid))
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database updateUserRbacProfile failed:', error);
    throw new Error('Failed to update RBAC role and security settings.', { cause: error });
  }
}

export async function authenticateOrRegisterEnterpriseUser(params: {
  email: string;
  password: string;
  displayName?: string;
  role: string;
  assignedRegion: string;
}) {
  try {
    const normalizedEmail = params.email.trim().toLowerCase();
    const syntheticUid = `hzl-rbac-${normalizedEmail}`;
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.uid, syntheticUid));

    if (existing.length > 0) {
      const userRecord = existing[0];
      // If user has a passwordHash, verify it; if not yet set, set it now
      if (userRecord.passwordHash) {
        const valid = verifyPassword(params.password, userRecord.passwordHash);
        if (!valid) {
          throw new Error('Invalid password for this HZL enterprise account.');
        }
      }
      const updated = await db
        .update(users)
        .set({
          role: params.role || userRecord.role,
          assignedRegion: params.assignedRegion || userRecord.assignedRegion,
          passwordHash:
            userRecord.passwordHash || hashPassword(params.password),
          lastLoginAt: new Date(),
        })
        .where(eq(users.uid, syntheticUid))
        .returning();
      return updated[0];
    }

    const created = await db
      .insert(users)
      .values({
        uid: syntheticUid,
        email: normalizedEmail,
        displayName: params.displayName || normalizedEmail.split('@')[0],
        role: params.role || 'Executive Viewer',
        assignedRegion: params.assignedRegion || 'All India',
        passwordHash: hashPassword(params.password),
        lastLoginAt: new Date(),
      })
      .returning();

    return created[0];
  } catch (error: any) {
    console.error('Enterprise authentication failed:', error);
    throw new Error(error.message || 'Authentication failed.', { cause: error });
  }
}

export async function getUserByUid(uid: string) {
  try {
    const rows = await db.select().from(users).where(eq(users.uid, uid));
    return rows[0] || null;
  } catch (error) {
    console.error('Database getUserByUid failed:', error);
    throw new Error('Failed to load user profile.', { cause: error });
  }
}
