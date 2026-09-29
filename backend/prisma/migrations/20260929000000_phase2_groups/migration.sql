ALTER TABLE "Group" ADD COLUMN "inviteCode" TEXT;
ALTER TABLE "Group" ADD COLUMN "onlyAdminsSend" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Group" ADD COLUMN "onlyAdminsEditInfo" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Group_inviteCode_key" ON "Group"("inviteCode");
