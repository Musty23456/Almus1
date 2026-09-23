import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyAccessToken, AccessTokenPayload } from '../utils/auth';
import { prisma } from '../config/prisma';
import { env } from '../config/env';

let io: SocketIOServer | null = null;

export function getIo(): SocketIOServer {
  if (!io) throw new Error('Socket.IO server has not been initialized yet');
  return io;
}

interface AuthedSocket extends Socket {
  user?: AccessTokenPayload;
}

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: env.corsOrigin, credentials: true },
  });

  // Authenticate every socket connection with the same JWT used by the REST API.
  // Unauthenticated clients are rejected before they can join any room.
  io.use((socket: AuthedSocket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      socket.user = verifyAccessToken<AccessTokenPayload>(token);
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', async (socket: AuthedSocket) => {
    const userId = socket.user!.userId;

    // Join a personal room (for notifications) and every conversation room
    // the user belongs to, so events fan out correctly.
    socket.join(`user:${userId}`);
    const memberships = await prisma.conversationMember.findMany({ where: { userId } });
    memberships.forEach((m) => socket.join(`conversation:${m.conversationId}`));

    await prisma.user.update({ where: { id: userId }, data: { isOnline: true } });
    io!.emit('user_online', { userId });

    socket.on('typing_start', ({ conversationId }: { conversationId: string }) => {
      socket.to(`conversation:${conversationId}`).emit('typing_start', { conversationId, userId });
    });

    socket.on('typing_stop', ({ conversationId }: { conversationId: string }) => {
      socket.to(`conversation:${conversationId}`).emit('typing_stop', { conversationId, userId });
    });

    // Client acknowledges delivery of a message it received while online.
    socket.on('message_delivered', async ({ messageId }: { messageId: string }) => {
      const message = await prisma.message.update({
        where: { id: messageId },
        data: { status: 'DELIVERED' },
      });
      io!.to(`conversation:${message.conversationId}`).emit('message_delivered', { messageId });
    });

    socket.on('message_read', async ({ conversationId }: { conversationId: string }) => {
      await prisma.message.updateMany({
        where: { conversationId, senderId: { not: userId }, status: { not: 'READ' } },
        data: { status: 'READ' },
      });
      await prisma.conversationMember.updateMany({
        where: { conversationId, userId },
        data: { lastReadAt: new Date() },
      });
      io!.to(`conversation:${conversationId}`).emit('message_read', { conversationId, userId });
    });

    socket.on('disconnect', async () => {
      // Only mark offline once ALL of this user's sockets are gone
      // (they may have multiple devices/tabs open).
      const sockets = await io!.in(`user:${userId}`).fetchSockets();
      if (sockets.length === 0) {
        await prisma.user.update({ where: { id: userId }, data: { isOnline: false, lastSeenAt: new Date() } });
        io!.emit('user_offline', { userId, lastSeenAt: new Date() });
      }
    });
  });

  return io;
}
