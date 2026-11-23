-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "matchDetail" JSONB,
ADD COLUMN     "matchMethod" TEXT,
ADD COLUMN     "matchScore" INTEGER,
ADD COLUMN     "matchedAt" TIMESTAMP(3);
