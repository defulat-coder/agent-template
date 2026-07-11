-- Prisma baseline for the isolated synthetic fixture schema.
-- Existing databases mark this migration applied after the platform migration
-- moves the tables without data loss. Empty databases can execute it directly.
CREATE SCHEMA IF NOT EXISTS "ecommerce_fixture";
SET search_path TO "ecommerce_fixture";

CREATE TYPE "EcommerceCustomerSegment" AS ENUM ('NEW', 'ACTIVE', 'VIP', 'AT_RISK');
CREATE TYPE "EcommerceSalesChannel" AS ENUM ('WEB', 'MINI_PROGRAM', 'MARKETPLACE', 'LIVE_STREAM');
CREATE TYPE "EcommerceOrderStatus" AS ENUM ('PENDING', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED');
CREATE TYPE "EcommercePaymentMethod" AS ENUM ('ALIPAY', 'WECHAT_PAY', 'BANK_CARD', 'WALLET');
CREATE TYPE "EcommercePaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'REFUNDED');

CREATE TABLE "EcommerceCustomer" (
    "id" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "segment" "EcommerceCustomerSegment" NOT NULL,
    "region" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "registeredAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "EcommerceCustomer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EcommerceProduct" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EcommerceProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EcommerceOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" "EcommerceSalesChannel" NOT NULL,
    "status" "EcommerceOrderStatus" NOT NULL,
    "placedAt" TIMESTAMPTZ(3) NOT NULL,
    "paidAt" TIMESTAMPTZ(3),
    "fulfilledAt" TIMESTAMPTZ(3),
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountTotal" DECIMAL(12,2) NOT NULL,
    "shippingTotal" DECIMAL(12,2) NOT NULL,
    "paidTotal" DECIMAL(12,2) NOT NULL,
    "refundedTotal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "EcommerceOrder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EcommerceOrder_refundedTotal_range_check"
      CHECK ("refundedTotal" >= 0 AND "refundedTotal" <= "paidTotal")
);

CREATE TABLE "EcommerceOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "discountTotal" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "EcommerceOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EcommercePayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "method" "EcommercePaymentMethod" NOT NULL,
    "status" "EcommercePaymentStatus" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EcommercePayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EcommerceCustomer_customerCode_key" ON "EcommerceCustomer"("customerCode");
CREATE INDEX "EcommerceCustomer_segment_idx" ON "EcommerceCustomer"("segment");
CREATE INDEX "EcommerceCustomer_region_idx" ON "EcommerceCustomer"("region");
CREATE UNIQUE INDEX "EcommerceProduct_sku_key" ON "EcommerceProduct"("sku");
CREATE INDEX "EcommerceProduct_category_isActive_idx" ON "EcommerceProduct"("category", "isActive");
CREATE UNIQUE INDEX "EcommerceOrder_orderNumber_key" ON "EcommerceOrder"("orderNumber");
CREATE INDEX "EcommerceOrder_placedAt_idx" ON "EcommerceOrder"("placedAt");
CREATE INDEX "EcommerceOrder_paidAt_idx" ON "EcommerceOrder"("paidAt");
CREATE INDEX "EcommerceOrder_status_paidAt_idx" ON "EcommerceOrder"("status", "paidAt");
CREATE INDEX "EcommerceOrder_customerId_paidAt_idx" ON "EcommerceOrder"("customerId", "paidAt");
CREATE INDEX "EcommerceOrder_settled_paidAt_idx"
  ON "EcommerceOrder"("paidAt")
  INCLUDE ("channel", "customerId", "paidTotal", "refundedTotal")
  WHERE "status" IN ('PAID', 'FULFILLED', 'REFUNDED');
CREATE INDEX "EcommerceOrderItem_orderId_idx" ON "EcommerceOrderItem"("orderId");
CREATE INDEX "EcommerceOrderItem_productId_orderId_idx" ON "EcommerceOrderItem"("productId", "orderId");
CREATE UNIQUE INDEX "EcommercePayment_orderId_key" ON "EcommercePayment"("orderId");
CREATE INDEX "EcommercePayment_status_paidAt_idx" ON "EcommercePayment"("status", "paidAt");

ALTER TABLE "EcommerceOrder"
  ADD CONSTRAINT "EcommerceOrder_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "EcommerceCustomer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EcommerceOrderItem"
  ADD CONSTRAINT "EcommerceOrderItem_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "EcommerceOrder"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EcommerceOrderItem"
  ADD CONSTRAINT "EcommerceOrderItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "EcommerceProduct"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EcommercePayment"
  ADD CONSTRAINT "EcommercePayment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "EcommerceOrder"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
