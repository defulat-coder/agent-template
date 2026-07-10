-- All fixture timestamps were written as UTC. Make that assumption explicit while
-- converting from timestamp without time zone, so query windows are independent
-- of the database session TimeZone.
-- AlterTable
ALTER TABLE "EcommerceCustomer"
ALTER COLUMN "registeredAt" SET DATA TYPE TIMESTAMPTZ(3)
USING "registeredAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "EcommerceOrder"
ALTER COLUMN "placedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "placedAt" AT TIME ZONE 'UTC',
ALTER COLUMN "paidAt" SET DATA TYPE TIMESTAMPTZ(3) USING "paidAt" AT TIME ZONE 'UTC',
ALTER COLUMN "fulfilledAt" SET DATA TYPE TIMESTAMPTZ(3) USING "fulfilledAt" AT TIME ZONE 'UTC',
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "EcommercePayment"
ALTER COLUMN "paidAt" SET DATA TYPE TIMESTAMPTZ(3) USING "paidAt" AT TIME ZONE 'UTC',
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "EcommerceProduct"
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
USING "createdAt" AT TIME ZONE 'UTC';

-- Prisma does not model CHECK constraints. Keep the accepted refund range in the
-- database so every analytics tool shares the same monetary invariant.
ALTER TABLE "EcommerceOrder"
ADD CONSTRAINT "EcommerceOrder_refundedTotal_range_check"
CHECK ("refundedTotal" >= 0 AND "refundedTotal" <= "paidTotal");
