ALTER TABLE "Profile" ADD COLUMN "resumeKey" TEXT, ADD COLUMN "resumeName" TEXT;

CREATE TABLE "ResumeUpload" (
    "id" TEXT NOT NULL,
    "consultancyId" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "extracted" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResumeUpload_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResumeUpload_consultancyId_requisitionId_idx" ON "ResumeUpload"("consultancyId", "requisitionId");
