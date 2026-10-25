import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';
import { getOrCreateUser, getUserByUid } from '../db/users.ts';

const SESSION_SECRET =
  process.env.SESSION_SECRET || 'metalsense-hzl-enterprise-rbac-secret-2026';

export interface AuthRequest extends Request {
  user?: DecodedIdToken | { uid: string; email: string; name?: string };
  dbUser?: {
    id: number;
    uid: string;
    email: string;
    displayName: string | null;
    role: string | null;
    assignedRegion: string | null;
  };
}

export function issueEnterpriseSessionToken(payload: {
  uid: string;
  email: string;
  role: string;
  assignedRegion: string;
}): string {
  const data = JSON.stringify({
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 12, // 12-hour session
  });
  const encoded = Buffer.from(data).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `hzl_sess.${encoded}.${sig}`;
}

export function verifyEnterpriseSessionToken(token: string): {
  uid: string;
  email: string;
  role: string;
  assignedRegion: string;
} | null {
  if (!token.startsWith('hzl_sess.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (parsed.exp && Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];

  // Check if token is an HZL Enterprise RBAC Session Token
  if (token.startsWith('hzl_sess.')) {
    const verified = verifyEnterpriseSessionToken(token);
    if (!verified) {
      return res.status(401).json({ error: 'Unauthorized: Expired or invalid session token' });
    }
    req.user = {
      uid: verified.uid,
      email: verified.email,
      name: verified.email.split('@')[0],
    };
    try {
      const dbUser =
        (await getUserByUid(verified.uid)) ||
        (await getOrCreateUser(
          verified.uid,
          verified.email,
          verified.email.split('@')[0],
          verified.role,
          verified.assignedRegion
        ));
      req.dbUser = dbUser;
    } catch (err) {
      console.error('Enterprise session DB lookup warning:', err);
    }
    return next();
  }

  // Otherwise verify as Firebase ID token
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    try {
      const dbUser = await getOrCreateUser(
        decodedToken.uid,
        decodedToken.email || 'user@hzlindia.com',
        decodedToken.name
      );
      req.dbUser = dbUser;
    } catch (dbErr) {
      console.error('Non-fatal user sync warning:', dbErr);
    }
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
