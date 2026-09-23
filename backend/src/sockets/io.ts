import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyAccessToken, AccessTokenPayload } from '../utils/auth';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { isConversationMember } from '../utils/conversationAccess';
import { applyReadState } from '../utils/receipts';

let io: SocketIOServer | null = null;

export function getIo(): SocketIOServer {
  if (!io) throw new Error('Socket.IO server has not been initialized yet');
  return io;
}

const conversationRoom = (conversationId: string) => `conversation:${conversationId}`;
const userRoom = (userId: string) => `user:${userId}`;

// ---------------------------------------------------------------------------
// Helpers used by REST controllers. They are safe no-ops when the socket
// server has not been started (e.g. in integration tests).
// ---------------------------------------------------------------------------

export function emitToConversation(conversationId: string, event: string, payload: unknown) {
  io?.to(conversationRoom(conversationId)).emit(event, payload);
}

/** Puts every live socket of a user into a conversation room (new chat / added to group). */
export function joinConversationRoom(userId: string, conversationId: string) {
  io?.in(userRoom(userId)).socketsJoin(conversationRoom(conversationId));
}

/** Removes every live socket of a user from a conversation room (removed / left group). */
export function leaveConversationRoom(userId: string, conversationId: string) {
  io?.in(userRoom(userId)).socketsLeave(conversationRoom(conversationId));
}

/** Kicks all of a user's sockets (used when an account is suspended, banned or deleted). */
export function disconnectUser(userId: string) {
  io?.in(userRoom(userId)).disconnectSockets(true);
}

// ---------------------------------------------------------------------------

interface AuthedSocket extends Socket {
  user?: AccessTokenPayload;
}

type Payload = Record<string, unknown> | undefined | null;

/** Socket handlers are async; never let a failure become an unhandled rejection. */
function safe<T>(handler: (payload: T) => Promise<void> | void) {
  return async (payload: T) => {
    try {
      await handler(payload);
    } catch (err) {
      console.error('[socket handler error]', err);
    }
  };
}

async function roomsOfUser(userId: string): Promise<string[]> {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId },
    select: { conversationId: true },
  });
  return memberships.map((m) => conversationRoom(m.conversationId));
}

/**
 * Presence is only sent to people who share a conversation with the user.
 * NOTE: io.to([]) with an empty list would broadcast to EVERYONE, so we guard it.
 */
function emitToRooms(rooms: string[], event: string, payload: unknown) {
  if (!io || rooms.length === 0) return;
  io.to(rooms).emit(event, payload);
}

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(','), credentials: true },
  });

  // Authenticate every socket connection with the same JWT used by the REST API,
  // and refuse suspended/banned accounts (the REST layer already does this).
  io.use(async (socket: AuthedSocket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyAccessToken<AccessTokenPayload>(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { status: true },
      });
      if (!user) return next(new Error('Invalid session'));
      if (user.status !== 'ACTIVE') return next(new Error('Account is not active'));
      socket.user = payload;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: AuthedSocket) => {
    const userId = socket.user!.userId;

    // ---- Event handlers are registered synchronously, before any await, so
    // ---- nothing the client sends right after connecting is lost.

    // Typing: only forward to conversations this socket has actually joined.
    // (Rooms are kept in sync with membership, see joinConversationRoom/leaveConversationRoom.)
    socket.on(
      'typing_start',
      safe<Payload>((payload) => {
        const conversationId = payload?.conversationId;
        if (typeof conversationId !== 'string') return;
        if (!socket.rooms.has(conversationRoom(conversationId))) return;
        socket.to(conversationRoom(conversationId)).emit('typing_start', { conversationId, userId });
      })
    );

    socket.on(
      'typing_stop',
      safe<Payload>((payload) => {
        const conversationId = payload?.conversationId;
        if (typeof conversationId !== 'string') return;
        if (!socket.rooms.has(conversationRoom(conversationId))) return;
        socket.to(conversationRoom(conversationId)).emit('typing_stop', { conversationId, userId });
      })
    );

    // Recipient acknowledges delivery. Only members (other than the sender) may do this,
    // and a status can only move SENT -> DELIVERED (never downgrade READ).
    socket.on(
      'message_delivered',
      safe<Payload>(async (payload) => {
        const messageId = payload?.messageId;
        if (typeof messageId !== 'string') return;

        const message = await prisma.message.findUnique({
          where: { id: messageId },
          select: { id: true, conversationId: true, senderId: true },
        });
        if (!message || message.senderId === userId) return;
        if (!(await isConversationMember(message.conversationId, userId))) return;

        const { count } = await prisma.message.updateMany({
          where: { id: message.id, status: 'SENT' },
          data: { status: 'DELIVERED' },
        });
        if (count > 0) {
          emitToConversation(message.conversationId, 'message_delivered', { messageId: message.id });
        }
      })
    );

    // Recipient read the conversation. Must be a member; honours the user's
    // "read receipts" privacy setting (see utils/receipts.ts).
    socket.on(
      'message_read',
      safe<Payload>(async (payload) => {
        const conversationId = payload?.conversationId;
        if (typeof conversationId !== 'string') return;
        if (!(await isConversationMember(conversationId, userId))) return;

        const { receiptsShared } = await applyReadState(conversationId, userId);
        if (receiptsShared) {
          emitToConversation(conversationId, 'message_read', { conversationId, userId });
        }
      })
    );

    socket.on(
      'disconnect',
      safe<unknown>(async () => {
        // Only mark offline once ALL of this user's sockets are gone
        // (they may have multiple devices/tabs open).
        const remaining = await io!.in(userRoom(userId)).fetchSockets();
        if (remaining.length > 0) return;

        const lastSeenAt = new Date();
        const user = await prisma.user.update({
          where: { id: userId },
          data: { isOnline: false, lastSeenAt },
          select: { lastSeenVisible: true },
        });
        if (user.lastSeenVisible) {
          emitToRooms(await roomsOfUser(userId), 'user_offline', { userId, lastSeenAt });
        }
      })
    );

    // ---- Async setup: personal room, conversation rooms, presence.
    (async () => {
      socket.join(userRoom(userId));
      const rooms = await roomsOfUser(userId);
      rooms.forEach((room) => socket.join(room));

      const user = await prisma.user.update({
        where: { id: userId },
        data: { isOnline: true },
        select: { lastSeenVisible: true },
      });
      // Users who hide "last seen" also don't broadcast presence.
      if (user.lastSeenVisible) emitToRooms(rooms, 'user_online', { userId });
    })().catch((err) => console.error('[socket connection setup error]', err));
  });

  return io;
}
