import { Request, Response } from 'express';
import { listCalls } from '../services/callService';

/** GET /api/calls?limit=50&before=<ISO date> */
export async function getCallHistory(req: Request, res: Response) {
  const limit = Number(req.query.limit) || 50;
  const beforeRaw = req.query.before ? new Date(String(req.query.before)) : undefined;
  const before = beforeRaw && !isNaN(beforeRaw.getTime()) ? beforeRaw : undefined;
  const calls = await listCalls(req.user!.userId, limit, before);
  return res.json({ calls });
}

/**
 * GET /api/calls/ice-servers
 * STUN is free. TURN is required for calls to work reliably on mobile networks
 * behind strict NAT. Set TURN_URL, TURN_USERNAME, TURN_CREDENTIAL in Render env.
 */
export async function getIceServers(_req: Request, res: Response) {
  const iceServers: Array<Record<string, unknown>> = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
  const { TURN_URL, TURN_USERNAME, TURN_CREDENTIAL } = process.env;
  if (TURN_URL && TURN_USERNAME && TURN_CREDENTIAL) {
    iceServers.push({
      urls: TURN_URL.split(',').map((u) => u.trim()),
      username: TURN_USERNAME,
      credential: TURN_CREDENTIAL,
    });
  }
  return res.json({ iceServers });
}
