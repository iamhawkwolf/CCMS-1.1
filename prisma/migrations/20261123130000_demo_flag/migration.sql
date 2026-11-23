-- Demo consultancies never send real messages and are the only rows the demo reset touches.
ALTER TABLE "Consultancy" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
