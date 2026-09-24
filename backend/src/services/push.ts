import jwt from 'jsonwebtoken';
import { URLSearchParams } from 'url';
import { prisma } from '../config/prisma';

/**
 * Push notifications through Firebase Cloud Messaging (HTTP v1 API).
 *
 * No extra npm package is needed: we sign a service-account JWT with
 * `jsonwebtoken`, exchange it for an OAuth token and call FCM with Node's
 * built-in `fetch`.
 *
 * Configuration: FCM_SERVICE_ACCOUNT_JSON = the Firebase service-account key
 * (raw JSON, or the same JSON base64-encoded). If it is missing, push is simply
 * disabled and every function here is a harmless no-op (dev, CI, tests).
 */

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CONCURRENCY = 20;

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

interface PushPayload {
  title: string;
  body: string;
  data: Record<string, string>;
}

let cachedRaw = '';
let cachedAccount: ServiceAccount | null = null;
let cachedAccessToken: { value: string; expiresAt: number } | null = null;

// Resolved on every call (not at import time) so it always uses the current global.
const doFetch = (url: string, init: unknown): Promise<any> => (globalThis as any).fetch(url, init);

/** Test helper: forget cached credentials. */
export function resetPushStateForTests() {
  cachedRaw = '';
  cachedAccount = null;
  cachedAccessToken = null;
}

function loadServiceAccount(): ServiceAccount | null {
  const raw = (process.env.FCM_SERVICE_ACCOUNT_JSON ?? '').trim();
  if (!raw) return null;
  if (raw === cachedRaw) return cachedAccount;

  cachedRaw = raw;
  cachedAccount = null;
  cachedAccessToken = null;
  try {
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    if (parsed.project_id && parsed.client_email && parsed.private_key) {
      cachedAccount = {
        project_id: String(parsed.project_id),
        client_email: String(parsed.client_email),
        // .env files often store the key with literal "\n" sequences.
        private_key: String(parsed.private_key).replace(/\\n/g, '\n'),
      };
    } else {
      console.error('[push] FCM_SERVICE_ACCOUNT_JSON is missing project_id / client_email / private_key');
    }
  } catch {
    console.error('[push] FCM_SERVICE_ACCOUNT_JSON is not valid JSON (or base64 JSON)');
  }
  return cachedAccount;
}

export function isPushConfigured(): boolean {
  return loadServiceAccount() !== null;
}

async function getAccessToken(account: ServiceAccount): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60_000 > now) {
    return cachedAccessToken.value;
  }

  const assertion = jwt.sign(
    { iss: account.client_email, scope: FCM_SCOPE, aud: TOKEN_URL },
    account.private_key,
    { algorithm: 'RS256', expiresIn: 3600 }
  );
  const res = await doFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  if (!res.ok) throw new Error(`FCM authentication failed (HTTP ${res.status})`);

  const data = await res.json();
  cachedAccessToken = {
    value: String(data.access_token),
    expiresAt: now + (Number(data.expires_in) || 3600) * 1000,
  };
  return cachedAccessToken.value;
}

type SendResult = 'ok' | 'invalid-token' | 'error';

async function sendToDevice(
  account: ServiceAccount,
  accessToken: string,
  token: string,
  payload: PushPayload
): Promise<SendResult> {
  const res = await doFetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data,
        android: { priority: 'HIGH', notification: { channel_id: 'messages' } },
      },
    }),
  });
  if (res.ok) return 'ok';

  if (res.status === 401) cachedAccessToken = null; // force a fresh OAuth token next time

  const body = await res.json().catch(() => null);
  const status: string | undefined = body?.error?.status;
  const message: string = String(body?.error?.message ?? '');
  const errorCode: string | undefined = body?.error?.details?.find((d: any) => d?.errorCode)?.errorCode;

  // Token is dead (app uninstalled / data cleared): remove it. A 400 is only treated
  // as a bad token when FCM says so explicitly - never delete tokens for OUR payload mistakes.
  if (
    errorCode === 'UNREGISTERED' ||
    status === 'NOT_FOUND' ||
    (status === 'INVALID_ARGUMENT' && message.toLowerCase().includes('registration token'))
  ) {
    return 'invalid-token';
  }
  console.error(`[push] FCM rejected a notification (HTTP ${res.status} ${status ?? ''})`);
  return 'error';
}

async function sendToDevices(account: ServiceAccount, tokens: string[], payload: PushPayload) {
  const accessToken = await getAccessToken(account);
  const invalid: string[] = [];

  for (let i = 0; i < tokens.length; i += CONCURRENCY) {
    const chunk = tokens.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map((token) =>
        sendToDevice(account, accessToken, token, payload).catch((err) => {
          console.error('[push] send failed', err);
          return 'error' as SendResult;
        })
      )
    );
    results.forEach((r, idx) => {
      if (r === 'invalid-token') invalid.push(chunk[idx]);
    });
  }

  if (invalid.length > 0) {
    await prisma.deviceToken.deleteMany({ where: { token: { in: invalid } } });
  }
}

/** Short text shown in the notification. */
export function buildPreview(content: string | null, attachmentTypes: string[]): string {
  const text = (content ?? '').trim();
  if (text) return text.length > 120 ? `${text.slice(0, 117)}...` : text;
  switch (attachmentTypes[0]) {
    case 'IMAGE':
      return '📷 Photo';
    case 'VIDEO':
      return '🎥 Video';
    case 'AUDIO':
      return '🎵 Audio';
    case 'VOICE':
      return '🎤 Voice message';
    case 'DOCUMENT':
      return '📄 Document';
    default:
      return 'New message';
  }
}

export interface NewMessageInfo {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  attachments: { type: string }[];
}

/**
 * Sends a push notification for a new message to everyone who should get one:
 * conversation members other than the sender, with an ACTIVE account, who have
 * not muted the chat and are not in a block relationship with the sender.
 * (Devices whose app is open simply don't show it - the app handles that.)
 */
export async function notifyNewMessage(message: NewMessageInfo): Promise<void> {
  const account = loadServiceAccount();
  if (!account) return;

  const [sender, conversation] = await Promise.all([
    prisma.user.findUnique({ where: { id: message.senderId }, select: { fullName: true } }),
    prisma.conversation.findUnique({
      where: { id: message.conversationId },
      select: {
        type: true,
        group: { select: { name: true } },
        members: {
          where: { userId: { not: message.senderId }, isMuted: false, user: { status: 'ACTIVE' } },
          select: { userId: true },
        },
      },
    }),
  ]);
  if (!sender || !conversation || conversation.members.length === 0) return;

  const candidateIds = conversation.members.map((m) => m.userId);
  const blocks = await prisma.blockedUser.findMany({
    where: {
      OR: [
        { blockerId: { in: candidateIds }, blockedId: message.senderId },
        { blockerId: message.senderId, blockedId: { in: candidateIds } },
      ],
    },
    select: { blockerId: true, blockedId: true },
  });
  const blocked = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));
  const recipientIds = candidateIds.filter((id) => !blocked.has(id));
  if (recipientIds.length === 0) return;

  const devices = await prisma.deviceToken.findMany({
    where: { userId: { in: recipientIds } },
    select: { token: true },
  });
  if (devices.length === 0) return;

  const preview = buildPreview(message.content, message.attachments.map((a) => a.type));
  const isGroup = conversation.type === 'GROUP';

  await sendToDevices(
    account,
    devices.map((d) => d.token),
    {
      title: isGroup ? conversation.group?.name ?? 'Group' : sender.fullName,
      body: isGroup ? `${sender.fullName}: ${preview}` : preview,
      data: {
        type: 'message',
        conversationId: message.conversationId,
        messageId: message.id,
        senderId: message.senderId,
      },
    }
  );
}

/** Fire-and-forget wrapper for controllers: a push failure must never fail the request. */
export function pushNewMessage(message: NewMessageInfo): void {
  notifyNewMessage(message).catch((err) => console.error('[push] notifyNewMessage failed', err));
}
