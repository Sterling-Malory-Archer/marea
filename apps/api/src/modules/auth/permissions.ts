import type { UserRole } from "@marea/db";

export const PERMISSIONS = [
  "dashboard:read",
  "catalog:read",
  "catalog:write",
  "inventory:write",
  "orders:read",
  "orders:write",
  "refunds:write",
  "customers:read",
  "customers:write",
  "content:write",
  "coupons:write",
  "settings:write",
  "admins:manage",
  "audit:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  CUSTOMER: [],
  CONTENT_EDITOR: ["dashboard:read", "catalog:read", "content:write"],
  CATALOG_MANAGER: ["dashboard:read", "catalog:read", "catalog:write", "inventory:write", "content:write"],
  ORDER_MANAGER: ["dashboard:read", "catalog:read", "orders:read", "orders:write", "customers:read", "inventory:write"],
  ADMIN: PERMISSIONS.filter((p) => p !== "admins:manage"),
  OWNER: PERMISSIONS,
};

export const isStaffRole = (role: UserRole) => role !== "CUSTOMER";

export function permissionsFor(role: UserRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
