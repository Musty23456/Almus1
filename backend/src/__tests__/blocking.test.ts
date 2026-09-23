import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../config/prisma';

const app = createApp();

async function registerAndLogin(suffix: string) {
  const user = {
    fullName: `User ${suffix}`,
    username: `blocktest_${suffix}_${Date.now()}`,
    phoneNumber: `+1555${Date.now().toString().slice(-6)}${suffix}`,
    email: `blocktest_${suffix}_${Date.now()}@example.com`,
    password: 'SuperSecret123',
  };
  const res = await request(app).post('/api/auth/register').send(user);
  return { token: res.body.accessToken as string, id: res.body.user.id as string };
}

describe('Blocking enforcement (server-side)', () => {
  let userA: { token: string; id: string };
  let userB: { token: string; id: string };

  beforeAll(async () => {
    userA = await registerAndLogin('a');
    userB = await registerAndLogin('b');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await prisma.$disconnect();
  });

  it('allows starting a conversation before any block', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ userId: userB.id });
    expect([200, 201]).toContain(res.status);
  });

  it('prevents a blocked user from starting a new conversation, even if only the mobile UI is bypassed', async () => {
    await request(app).post(`/api/users/${userB.id}/block`).set('Authorization', `Bearer ${userA.token}`);

    // userB tries to message userA directly via the API (simulating a bypassed client)
    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ userId: userA.id });
    expect(res.status).toBe(403);
  });

  it('unblocking restores the ability to message', async () => {
    await request(app).delete(`/api/users/${userB.id}/block`).set('Authorization', `Bearer ${userA.token}`);
    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ userId: userA.id });
    expect([200, 201]).toContain(res.status);
  });
});
