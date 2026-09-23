import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../config/prisma';
import { hashPassword } from '../utils/auth';

const app = createApp();

describe('Admin authorization', () => {
  const moderatorEmail = `mod_${Date.now()}@example.com`;
  let moderatorToken: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword('ModPassword123');
    await prisma.adminUser.create({
      data: { name: 'Mod', email: moderatorEmail, passwordHash, role: 'MODERATOR' },
    });
    const res = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: moderatorEmail, password: 'ModPassword123' });
    moderatorToken = res.body.accessToken;
  });

  afterAll(async () => {
    await prisma.adminUser.deleteMany({ where: { email: moderatorEmail } });
    await prisma.$disconnect();
  });

  it('rejects admin routes without a token', async () => {
    const res = await request(app).get('/api/admin/dashboard');
    expect(res.status).toBe(401);
  });

  it('allows a MODERATOR to view reports', async () => {
    const res = await request(app).get('/api/admin/reports').set('Authorization', `Bearer ${moderatorToken}`);
    expect(res.status).toBe(200);
  });

  it('blocks a MODERATOR from deleting a user (SUPER_ADMIN only)', async () => {
    const res = await request(app)
      .delete('/api/admin/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${moderatorToken}`);
    expect(res.status).toBe(403);
  });

  it('blocks a MODERATOR from changing system settings (SUPER_ADMIN only)', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ key: 'maintenance_mode', value: 'true' });
    expect(res.status).toBe(403);
  });
});
