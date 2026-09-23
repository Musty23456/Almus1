import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../config/prisma';

const app = createApp();

interface TestUser {
  token: string;
  id: string;
}

let counter = 0;
async function registerAndLogin(label: string): Promise<TestUser> {
  counter += 1;
  const stamp = `${Date.now()}${counter}`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      fullName: `Access ${label}`,
      username: `access_${label}_${stamp}`,
      phoneNumber: `+1777${stamp.slice(-9)}`,
      email: `access_${label}_${stamp}@example.com`,
      password: 'SuperSecret123',
    });
  return { token: res.body.accessToken as string, id: res.body.user.id as string };
}

const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

describe('Access control & block enforcement (REST)', () => {
  let a: TestUser;
  let b: TestUser;
  let c: TestUser;
  let directAB: string;
  let messageId: string;

  beforeAll(async () => {
    a = await registerAndLogin('a');
    b = await registerAndLogin('b');
    c = await registerAndLogin('c');

    const conv = await request(app).post('/api/conversations').set(auth(a)).send({ userId: b.id });
    directAB = conv.body.conversation.id;

    const msg = await request(app)
      .post('/api/messages')
      .set(auth(a))
      .send({ conversationId: directAB, content: 'private hello' });
    messageId = msg.body.message.id;
  });

  afterAll(async () => {
    const ids = [a.id, b.id, c.id];
    // Messages have no ON DELETE CASCADE from their sender, so remove conversations first.
    await prisma.conversation.deleteMany({ where: { members: { some: { userId: { in: ids } } } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('does not let a non-member forward a message from a conversation they cannot see', async () => {
    const own = await request(app).post('/api/conversations').set(auth(c)).send({ userId: a.id });
    const res = await request(app)
      .post(`/api/messages/${messageId}/forward`)
      .set(auth(c))
      .send({ conversationId: own.body.conversation.id });
    expect(res.status).toBe(403);
  });

  it('blocks sending, forwarding and uploading once a block exists (either direction)', async () => {
    await request(app).post(`/api/users/${a.id}/block`).set(auth(b)); // b blocks a

    const send = await request(app)
      .post('/api/messages')
      .set(auth(a))
      .send({ conversationId: directAB, content: 'still there?' });
    expect(send.status).toBe(403);

    const forward = await request(app)
      .post(`/api/messages/${messageId}/forward`)
      .set(auth(a))
      .send({ conversationId: directAB });
    expect(forward.status).toBe(403);

    const upload = await request(app)
      .post('/api/messages/upload')
      .set(auth(a))
      .field('conversationId', directAB)
      .attach('file', Buffer.from('hello'), { filename: 'note.txt', contentType: 'text/plain' });
    expect(upload.status).toBe(403);

    await request(app).delete(`/api/users/${a.id}/block`).set(auth(b));
  });

  it('hides attachments of deleted messages', async () => {
    const up = await request(app)
      .post('/api/messages/upload')
      .set(auth(a))
      .field('conversationId', directAB)
      .attach('file', Buffer.from('hello'), { filename: 'note.txt', contentType: 'text/plain' });
    expect(up.status).toBe(201);

    await request(app).delete(`/api/messages/${up.body.message.id}`).set(auth(a));
    const list = await request(app).get(`/api/messages/${directAB}`).set(auth(b));
    const deleted = list.body.messages.find((m: any) => m.id === up.body.message.id);
    expect(deleted.isDeleted).toBe(true);
    expect(deleted.attachments).toHaveLength(0);
  });
});

describe('Group safety rules', () => {
  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let groupId: string;
  let conversationId: string;

  beforeAll(async () => {
    owner = await registerAndLogin('owner');
    member = await registerAndLogin('member');
    outsider = await registerAndLogin('outsider');

    const res = await request(app)
      .post('/api/groups')
      .set(auth(owner))
      .send({ name: 'Test group', memberIds: [member.id] });
    groupId = res.body.conversation.group.id;
    conversationId = res.body.conversation.id;
  });

  afterAll(async () => {
    const ids = [owner.id, member.id, outsider.id];
    await prisma.conversation.deleteMany({ where: { id: conversationId } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('refuses to add a user who has blocked the actor', async () => {
    await request(app).post(`/api/users/${owner.id}/block`).set(auth(outsider));
    const res = await request(app)
      .post(`/api/groups/${groupId}/members`)
      .set(auth(owner))
      .send({ memberIds: [outsider.id] });
    expect(res.status).toBe(403);
    await request(app).delete(`/api/users/${owner.id}/block`).set(auth(outsider));
  });

  it('rejects malformed member lists instead of returning a 500', async () => {
    const res = await request(app).post(`/api/groups/${groupId}/members`).set(auth(owner)).send({});
    expect(res.status).toBe(400);
  });

  it('never lets the owner be removed or demoted', async () => {
    // Promote the member to admin, then have them try to remove / demote the owner.
    await request(app)
      .patch(`/api/groups/${groupId}/members/${member.id}/role`)
      .set(auth(owner))
      .send({ role: 'ADMIN' });

    const remove = await request(app).delete(`/api/groups/${groupId}/members/${owner.id}`).set(auth(member));
    expect(remove.status).toBe(403);

    const demote = await request(app)
      .patch(`/api/groups/${groupId}/members/${owner.id}/role`)
      .set(auth(member))
      .send({ role: 'MEMBER' });
    expect(demote.status).toBe(403);
  });

  it('transfers ownership when the owner leaves', async () => {
    const leave = await request(app).post(`/api/groups/${groupId}/leave`).set(auth(owner));
    expect(leave.status).toBe(204);

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    expect(group?.ownerId).toBe(member.id);
  });
});
