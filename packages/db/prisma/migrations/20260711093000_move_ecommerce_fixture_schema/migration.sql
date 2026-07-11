-- Preserve the existing synthetic data while moving it out of the platform schema.
CREATE SCHEMA IF NOT EXISTS "ecommerce_fixture";

ALTER TYPE "public"."EcommerceCustomerSegment" SET SCHEMA "ecommerce_fixture";
ALTER TYPE "public"."EcommerceSalesChannel" SET SCHEMA "ecommerce_fixture";
ALTER TYPE "public"."EcommerceOrderStatus" SET SCHEMA "ecommerce_fixture";
ALTER TYPE "public"."EcommercePaymentMethod" SET SCHEMA "ecommerce_fixture";
ALTER TYPE "public"."EcommercePaymentStatus" SET SCHEMA "ecommerce_fixture";

ALTER TABLE "public"."EcommerceCustomer" SET SCHEMA "ecommerce_fixture";
ALTER TABLE "public"."EcommerceProduct" SET SCHEMA "ecommerce_fixture";
ALTER TABLE "public"."EcommerceOrder" SET SCHEMA "ecommerce_fixture";
ALTER TABLE "public"."EcommerceOrderItem" SET SCHEMA "ecommerce_fixture";
ALTER TABLE "public"."EcommercePayment" SET SCHEMA "ecommerce_fixture";
