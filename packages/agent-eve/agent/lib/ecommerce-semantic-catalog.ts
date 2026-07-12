import { businessSemanticCatalogs } from "./business-semantic-catalogs";

// Preserve the former single-domain export for downstream imports and durable
// source links stored in committed ZRead snapshots.
export const ecommerceSemanticCatalog =
  businessSemanticCatalogs["ecommerce.yaml"];
