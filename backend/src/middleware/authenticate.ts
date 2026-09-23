import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AccessTokenPayload, AdminTokenPayload } from '../utils/auth';
import { prisma } from '../config/prisma';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
      admin?: AdminTokenPayload;
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

/** Requires a valid user access token. Also blocks suspended/banned accounts. */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const payload = verifyAccessToken<AccessTokenPayload>(token);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(401).json({ error: 'Invalid session' });
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: `Account is ${user.status.toLowerCase()}` });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Requires a valid admin access token. */
export async function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Admin authentication required' });

  try {
    const payload = verifyAccessToken<AdminTokenPayload>(token);
    const admin = await prisma.adminUser.findUnique({ where: { id: payload.adminId } });
    if (!admin || !admin.isActive) return res.status(401).json({ error: 'Invalid admin session' });
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}

/** Restricts a route to specific admin roles. Must run after authenticateAdmin. */
export function requireAdminRole(...roles: AdminTokenPayload['role'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      return res.status(403).json({ error: 'Insufficient admin privileges' });
    }
    next();
  };
}
