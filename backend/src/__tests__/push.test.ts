import request from 'supertest';
import { generateKeyPairSync } from 'crypto';
import { createApp } from '../app';
import { prisma } from '../config/prisma';
import { buildPreview, notifyNewMessage, resetPushStateForTests } from '../services/push';

const app = createApp();

interface TestUser {
  token: string;
  id: string;
  fullName: string;
}

let counter = 0;
async function registerAndLogin(label: string): Promise<TestUser> {
  counter += 1;
  const stamp = `${Date.now()}${counter}`;
  const fullName = `Push ${label}`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      fullName,
      username: `push_${label}_${stamp}`,
      phoneNumber: `+1666${stamp.slice(-9)}`,
      email: `push_${label}_${stamp}@example.com`,
      password: 'SuperSecret123',
    });
  return { token: res.body.accessToken as string, id: res.body.user.id as string, fullName };
}

const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const fakeToken = (label: string) => `fcm-token-${label}-${Date.now()}-abcdefghijklmnopqrstuvwxyz`;

describe('Device token registration', () => {
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    a = await registerAndLogin('deva');
    b = await registerAndLogin('devb');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  });

  it('requires authentication and a valid token', async () => {
    const noAuth = await request(app).post('/api/devices').send({ token: fakeToken('x') });
    expect(noAuth.status).toBe(401);

    const bad = await request(app).post('/api/devices').set(auth(a)).send({});
    expect(bad.status).toBe(400);
  });

  it('registers a token once, and moves it to the newest account that registers it', async () => {
    const token = fakeToken('shared');

    const first = await request(app).post('/api/devices').set(auth(a)).send({ token });
    expect(first.status).toBe(204);
    await request(app).post('/api/devices').set(auth(a)).send({ token });
    expect(await prisma.deviceToken.count({ where: { token } })).toBe(1);

    // Same phone, different account logs in: the token now belongs to that account only.
    await request(app).post('/api/devices').set(auth(b)).send({ token });
    const row = await prisma.deviceToken.findUnique({ where: { token } });
    expect(row?.userId).toBe(b.id);
  });

  it('only lets the owner unregister a token', async () => {
    const token = fakeToken('owned');
    await request(app).post('/api/devices').set(auth(a)).send({ token });

    await request(app).delete(`/api/devices/${encodeURIComponent(token)}`).set(auth(b));
    expect(await prisma.deviceToken.count({ where: { token } })).toBe(1);

    const del = await request(app).delete(`/api/devices/${encodeURIComponent(token)}`).set(auth(a));
    expect(del.status).toBe(204);
    expect(await prisma.deviceToken.count({ where: { token } })).toBe(0);
  });
});

describe('buildPreview', () => {
  it('shows text, truncates long text, and describes media', () => {
    expect(buildPreview('Sannu', [])).toBe('Sannu');
    expect(buildPreview('x'.repeat(200), [])).toHaveLength(120);
    expect(buildPreview(null, ['IMAGE'])).toContain('Photo');
    expect(buildPreview('', ['VOICE'])).toContain('Voice');
    expect(buildPreview(null, [])).toBe('New message');
  });
});

describe('notifyNewMessage (FCM mocked)', () => {
  let sender: TestUser;
  let receiver: TestUser;
  let muted: TestUser;
  let blocker: TestUser;
  let conversationId: string;
  const tokens = { receiver: '', muted: '', blocker: '', sender: '' };

  const originalFetch = (globalThis as any).fetch;
  let fcmCalls: { url: string; init: any }[] = [];

  function mockFetch(fcmResponse: () => any) {
    fcmCalls = [];
    (globalThis as any).fetch = jest.fn(async (url: string, init: any) => {
      if (url.includes('oauth2.googleapis.com')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'test-access', expires_in: 3600 }) };
      }
      fcmCalls.push({ url, init });
      return fcmResponse();
    });
  }

  beforeAll(async () => {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({
      project_id: 'demo-project',
      client_email: 'svc@demo-project.iam.gserviceaccount.com',
      private_key: privateKey,
    });
    resetPushStateForTests();

    sender = await registerAndLogin('sender');
    receiver = await registerAndLogin('receiver');
    muted = await registerAndLogin('muted');
    blocker = await registerAndLogin('blocker');

    const group = await request(app)
      .post('/api/groups')
      .set(auth(sender))
      .send({ name: 'Push group', memberIds: [receiver.id, muted.id, blocker.id] });
    conversationId = group.body.conversation.id;

    await prisma.conversationMember.updateMany({
      where: { conversationId, userId: muted.id },
      data: { isMuted: true },
    });
    await request(app).post(`/api/users/${sender.id}/block`).set(auth(blocker));

    for (const [key, user] of [
      ['receiver', receiver],
      ['muted', muted],
      ['blocker', blocker],
      ['sender', sender],
    ] as const) {
      tokens[key] = fakeToken(key);
      await request(app).post('/api/devices').set(auth(user)).send({ token: tokens[key] });
    }
  });

  afterAll(async () => {
    (globalThis as any).fetch = originalFetch;
    delete process.env.FCM_SERVICE_ACCOUNT_JSON;
    resetPushStateForTests();
    const ids = [sender.id, receiver.id, muted.id, blocker.id];
    await prisma.conversation.deleteMany({ where: { id: conversationId } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  it('notifies only eligible members (not the sender, muted or blocking members)', async () => {
    mockFetch(() => ({ ok: true, status: 200, json: async () => ({ name: 'projects/demo/messages/1' }) }));

    await notifyNewMessage({
      id: 'message-1',
      conversationId,
      senderId: sender.id,
      content: 'Sannu da zuwa',
      attachments: [],
    });

    expect(fcmCalls).toHaveLength(1);
    expect(fcmCalls[0].url).toContain('/v1/projects/demo-project/messages:send');
    expect(fcmCalls[0].init.headers.Authorization).toBe('Bearer test-access');

    const { message } = JSON.parse(fcmCalls[0].init.body);
    expect(message.token).toBe(tokens.receiver);
    expect(message.notification.title).toBe('Push group');
    expect(message.notification.body).toContain('Sannu da zuwa');
    expect(message.notification.body).toContain(sender.fullName);
    expect(message.data.conversationId).toBe(conversationId);
  });

  it('removes tokens that FCM reports as unregistered', async () => {
    mockFetch(() => ({
      ok: false,
      status: 404,
      json: async () => ({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }),
    }));

    await notifyNewMessage({
      id: 'message-2',
      conversationId,
      senderId: sender.id,
      content: 'Sake gwadawa',
      attachments: [],
    });

    expect(await prisma.deviceToken.findUnique({ where: { token: tokens.receiver } })).toBeNull();
  });
});
