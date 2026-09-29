import { Server as SocketIOServer, Socket } from 'socket.io';
import {
  startCall,
  acceptCall,
  rejectCall,
  endCall,
  getCallForUser,
  activeCallsOf,
  CallKind,
} from '../services/callService';

/**
 * Call signaling over Socket.IO (WebRTC offer/answer/ICE are only RELAYED here;
 * audio/video never passes through this server).
 *
 * Client -> server events
 *   call:invite  { calleeId, type: 'VOICE' | 'VIDEO' }
 *   call:accept  { callId }
 *   call:reject  { callId }
 *   call:end     { callId }
 *   call:offer   { callId, sdp }        (caller, after call:accepted)
 *   call:answer  { callId, sdp }        (callee)
 *   call:ice     { callId, candidate }  (both)
 *
 * Server -> client events
 *   call:ringing   { call }                         to caller (call created, callee reachable)
 *   call:incoming  { call }                         to callee
 *   call:accepted  { callId }                       to caller
 *   call:rejected  { callId }                       to caller
 *   call:ended     { callId, status, durationSec }  to both
 *   call:offer / call:answer / call:ice             relayed to the other side
 *   call:error     { message, callId? }             to the sender
 */

const RING_TIMEOUT_MS = 45_000;

type Payload = Record<string, unknown> | undefined | null;

// Same naming as sockets/io.ts (every live socket of a user is in this room).
const userRoom = (userId: string) => `user:${userId}`;

const ringTimers = new Map<string, NodeJS.Timeout>();

function clearRingTimer(callId: string) {
  const t = ringTimers.get(callId);
  if (t) clearTimeout(t);
  ringTimers.delete(callId);
}

function safe<T>(socket: Socket, handler: (payload: T) => Promise<void> | void) {
  return async (payload: T) => {
    try {
      await handler(payload);
    } catch (err: any) {
      const message = typeof err?.message === 'string' ? err.message : 'Call failed';
      const callId = (payload as Payload)?.callId;
      socket.emit('call:error', { message, callId: typeof callId === 'string' ? callId : undefined });
      if (!err?.statusCode && !err?.status) console.error('[call signaling error]', err);
    }
  };
}

function str(payload: Payload, key: string): string | null {
  const v = payload?.[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function otherSide(call: { callerId: string; calleeId: string }, userId: string) {
  return call.callerId === userId ? call.calleeId : call.callerId;
}

async function finishCall(
  io: SocketIOServer,
  callId: string,
  byUserId: string,
  reason?: 'timeout'
) {
  clearRingTimer(callId);
  const call = await endCall(callId, byUserId, reason);
  const payload = { callId, status: call.status, durationSec: call.durationSec ?? 0 };
  io.to([userRoom(call.callerId), userRoom(call.calleeId)]).emit('call:ended', payload);
  return call;
}

export function registerCallHandlers(io: SocketIOServer, socket: Socket, userId: string) {
  socket.on(
    'call:invite',
    safe<Payload>(socket, async (payload) => {
      const calleeId = str(payload, 'calleeId');
      const type = str(payload, 'type');
      if (!calleeId || (type !== 'VOICE' && type !== 'VIDEO')) {
        throw new Error('Invalid call request');
      }

      // One call at a time per person.
      if ((await activeCallsOf(userId)).length > 0) throw new Error('You are already in a call');

      const call = await startCall(userId, calleeId, type as CallKind);

      // Callee busy or offline -> record as missed right away.
      const calleeSockets = await io.in(userRoom(calleeId)).fetchSockets();
      const calleeBusy = (await activeCallsOf(calleeId)).some((c) => c.id !== call.id);
      if (calleeSockets.length === 0 || calleeBusy) {
        const ended = await endCall(call.id, userId, 'timeout');
        socket.emit('call:ended', {
          callId: call.id,
          status: ended.status,
          durationSec: 0,
          reason: calleeBusy ? 'busy' : 'unavailable',
        });
        return;
      }

      socket.emit('call:ringing', { call });
      io.to(userRoom(calleeId)).emit('call:incoming', { call });

      ringTimers.set(
        call.id,
        setTimeout(() => {
          finishCall(io, call.id, userId, 'timeout').catch((err) =>
            console.error('[call ring timeout error]', err)
          );
        }, RING_TIMEOUT_MS)
      );
    })
  );

  socket.on(
    'call:accept',
    safe<Payload>(socket, async (payload) => {
      const callId = str(payload, 'callId');
      if (!callId) throw new Error('Invalid call');
      const call = await acceptCall(callId, userId);
      clearRingTimer(callId);
      io.to(userRoom(call.callerId)).emit('call:accepted', { callId });
    })
  );

  socket.on(
    'call:reject',
    safe<Payload>(socket, async (payload) => {
      const callId = str(payload, 'callId');
      if (!callId) throw new Error('Invalid call');
      const call = await rejectCall(callId, userId);
      clearRingTimer(callId);
      io.to(userRoom(call.callerId)).emit('call:rejected', { callId });
      io.to(userRoom(call.calleeId)).emit('call:ended', { callId, status: call.status, durationSec: 0 });
    })
  );

  socket.on(
    'call:end',
    safe<Payload>(socket, async (payload) => {
      const callId = str(payload, 'callId');
      if (!callId) throw new Error('Invalid call');
      await finishCall(io, callId, userId);
    })
  );

  // ---- WebRTC relay (only between the two participants of an ACCEPTED call) ----
  const relay = (event: 'call:offer' | 'call:answer' | 'call:ice', field: 'sdp' | 'candidate') =>
    socket.on(
      event,
      safe<Payload>(socket, async (payload) => {
        const callId = str(payload, 'callId');
        const data = payload?.[field];
        if (!callId || data === undefined || data === null) throw new Error('Invalid signaling data');
        const call = await getCallForUser(callId, userId);
        if (call.status !== 'ACCEPTED') return;
        io.to(userRoom(otherSide(call, userId))).emit(event, { callId, [field]: data });
      })
    );
  relay('call:offer', 'sdp');
  relay('call:answer', 'sdp');
  relay('call:ice', 'candidate');
}

/** Called when ALL sockets of a user are gone: hang up whatever they were doing. */
export async function endCallsOnDisconnect(io: SocketIOServer, userId: string) {
  const calls = await activeCallsOf(userId);
  for (const call of calls) {
    try {
      // A ringing call the user placed is canceled; anything else simply ends.
      await finishCall(io, call.id, userId, call.status === 'RINGING' && call.calleeId === userId ? 'timeout' : undefined);
    } catch (err) {
      console.error('[endCallsOnDisconnect error]', err);
    }
  }
}
