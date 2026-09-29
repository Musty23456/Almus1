CREATE TYPE "CallType" AS ENUM ('VOICE', 'VIDEO');
CREATE TYPE "CallStatus" AS ENUM ('RINGING', 'ACCEPTED', 'REJECTED', 'MISSED', 'CANCELED', 'ENDED');

CREATE TABLE "Call" (
  "id" TEXT NOT NULL,
  "callerId" TEXT NOT NULL,
  "calleeId" TEXT NOT NULL,
  "type" "CallType" NOT NULL,
  "status" "CallStatus" NOT NULL DEFAULT 'RINGING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answeredAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "durationSec" INTEGER,
  CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Call_callerId_startedAt_idx" ON "Call"("callerId", "startedAt");
CREATE INDEX "Call_calleeId_startedAt_idx" ON "Call"("calleeId", "startedAt");

ALTER TABLE "Call" ADD CONSTRAINT "Call_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Call" ADD CONSTRAINT "Call_calleeId_fkey" FOREIGN KEY ("calleeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
