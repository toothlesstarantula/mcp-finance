-- CreateTable
CREATE TABLE "ExpenseDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantRaw" TEXT,
    "amountCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "occurredAt" TIMESTAMP(3),
    "paymentMethod" "PaymentMethod",
    "description" TEXT,
    "rawText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseDraft_userId_expiresAt_idx" ON "ExpenseDraft"("userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "ExpenseDraft" ADD CONSTRAINT "ExpenseDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
