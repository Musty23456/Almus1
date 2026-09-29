-- Loudness bars for voice messages (comma-separated 0-100 values)
ALTER TABLE "Attachment" ADD COLUMN "waveform" TEXT;
