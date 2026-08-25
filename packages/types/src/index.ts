/**
 * index.ts — Barrel Export for @revrec/types
 *
 * All consumers (apps/api, apps/web) import from "@revrec/types" directly.
 * They never import from individual files within this package.
 * This gives us freedom to reorganize internal files without breaking consumers.
 */

export * from "./enums";
export * from "./payment.types";
export * from "./recovery.types";
export * from "./agent.types";
export * from "./audit.types";
