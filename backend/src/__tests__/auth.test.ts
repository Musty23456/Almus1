import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../config/prisma';

const app = createApp();

const testUser = {
  fullName: 'Test User',
  username: `testuser_${Date.now()}`,
  phoneNumber: `+1555${Date.now().toString().slice(-7)}`,
  email: `test_${Date.now()}@example.com`,
  password: 'SuperSecret123',
};

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: testUser.email } });
  await prisma.$disconnect();
});

describe('Auth', () => {
  it('registers a new user and returns tokens', async () => {
    const res = await request(app).post('/api/auth/register').send(testUser);
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.username).toBe(testUser.username);
    expect(res.body.user.passwordHash).toBeUndefined(); // never leak hash
  });

  it('rejects duplicate username on registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...testUser, email: `other_${Date.now()}@example.com`, phoneNumber: '+15559999999' });
    expect(res.status).toBe(409);
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: testUser.username, password: testUser.password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('rejects login with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: testUser.username, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('rejects protected routes without a token', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });
});
