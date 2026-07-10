-- CreateEnum
CREATE TYPE "EcommerceCustomerSegment" AS ENUM ('NEW', 'ACTIVE', 'VIP', 'AT_RISK');

-- CreateEnum
CREATE TYPE "EcommerceSalesChannel" AS ENUM ('WEB', 'MINI_PROGRAM', 'MARKETPLACE', 'LIVE_STREAM');

-- CreateEnum
CREATE TYPE "EcommerceOrderStatus" AS ENUM ('PENDING', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "EcommercePaymentMethod" AS ENUM ('ALIPAY', 'WECHAT_PAY', 'BANK_CARD', 'WALLET');

-- CreateEnum
CREATE TYPE "EcommercePaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'REFUNDED');

-- CreateTable
CREATE TABLE "EcommerceCustomer" (
    "id" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "segment" "EcommerceCustomerSegment" NOT NULL,
    "region" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcommerceCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcommerceProduct" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcommerceProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcommerceOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" "EcommerceSalesChannel" NOT NULL,
    "status" "EcommerceOrderStatus" NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountTotal" DECIMAL(12,2) NOT NULL,
    "shippingTotal" DECIMAL(12,2) NOT NULL,
    "paidTotal" DECIMAL(12,2) NOT NULL,
    "refundedTotal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcommerceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "EcommercePayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "method" "EcommercePaymentMethod" NOT NULL,
    "status" "EcommercePaymentStatus" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcommercePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EcommerceCustomer_customerCode_key" ON "EcommerceCustomer"("customerCode");

-- CreateIndex
CREATE INDEX "EcommerceCustomer_segment_idx" ON "EcommerceCustomer"("segment");

-- CreateIndex
CREATE INDEX "EcommerceCustomer_region_idx" ON "EcommerceCustomer"("region");

-- CreateIndex
CREATE UNIQUE INDEX "EcommerceProduct_sku_key" ON "EcommerceProduct"("sku");

-- CreateIndex
CREATE INDEX "EcommerceProduct_category_isActive_idx" ON "EcommerceProduct"("category", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "EcommerceOrder_orderNumber_key" ON "EcommerceOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "EcommerceOrder_placedAt_idx" ON "EcommerceOrder"("placedAt");

-- CreateIndex
CREATE INDEX "EcommerceOrder_paidAt_idx" ON "EcommerceOrder"("paidAt");

-- CreateIndex
CREATE INDEX "EcommerceOrder_status_paidAt_idx" ON "EcommerceOrder"("status", "paidAt");

-- CreateIndex
CREATE INDEX "EcommerceOrder_customerId_paidAt_idx" ON "EcommerceOrder"("customerId", "paidAt");

-- Covers the common sales-analytics predicate without indexing unpaid orders.
CREATE INDEX "EcommerceOrder_settled_paidAt_idx"
ON "EcommerceOrder"("paidAt") INCLUDE ("channel", "customerId", "paidTotal", "refundedTotal")
WHERE "status" IN ('PAID', 'FULFILLED', 'REFUNDED');

-- CreateIndex
CREATE INDEX "EcommerceOrderItem_orderId_idx" ON "EcommerceOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "EcommerceOrderItem_productId_orderId_idx" ON "EcommerceOrderItem"("productId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "EcommercePayment_orderId_key" ON "EcommercePayment"("orderId");

-- CreateIndex
CREATE INDEX "EcommercePayment_status_paidAt_idx" ON "EcommercePayment"("status", "paidAt");

-- AddForeignKey
ALTER TABLE "EcommerceOrder" ADD CONSTRAINT "EcommerceOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "EcommerceCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcommerceOrderItem" ADD CONSTRAINT "EcommerceOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "EcommerceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcommerceOrderItem" ADD CONSTRAINT "EcommerceOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "EcommerceProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcommercePayment" ADD CONSTRAINT "EcommercePayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "EcommerceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
