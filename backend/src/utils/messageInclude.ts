/**
 * What every message response carries: attachments, reactions and a small
 * preview of the message it replies to (so clients can draw the quote).
 * A deleted message has its content cleared on delete, so the preview never leaks it.
 */
export const messageInclude = {
  attachments: true,
  reactions: true,
  replyTo: {
    select: {
      id: true,
      senderId: true,
      content: true,
      isDeleted: true,
      sender: { select: { fullName: true, username: true } },
      attachments: { select: { type: true, fileName: true } },
    },
  },
} as const;
