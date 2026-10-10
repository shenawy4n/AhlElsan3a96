import { createMiddleware } from "@tanstack/react-start";
import { attachSupabaseAuth } from "../integrations/supabase/auth-attacher";
import type { AuthenticatedAdminContext, AdminRole } from "./auth.server";

/**
 * Creates a middleware that checks for the specified roles.
 */
export const requireRoleAuth = (allowedRoles: AdminRole[]) =>
  createMiddleware({ type: "function" })
    .middleware([attachSupabaseAuth])
    .server(async ({ next }) => {
      const { requireRole } = await import("./auth.server");
      const ctx = await requireRole(allowedRoles);
      return next({
        context: ctx,
      });
    });

/**
 * Shared TanStack Start middleware for all admin and owner server functions.
 * Restricts access from content moderators for sensitive operations.
 */
export const requireAdminAuth = createMiddleware({ type: "function" })
  .middleware([attachSupabaseAuth])
  .server(async ({ next }) => {
    const { requireAdmin } = await import("./auth.server");
    const adminContext = await requireAdmin();
    return next({
      context: adminContext,
    });
  });

/**
 * Shared TanStack Start middleware for owner-only server functions.
 * Attaches client session token via attachSupabaseAuth and validates owner role on server.
 */
export const requireOwnerAuth = createMiddleware({ type: "function" })
  .middleware([attachSupabaseAuth])
  .server(async ({ next }) => {
    const { requireOwner } = await import("./auth.server");
    const ownerContext = await requireOwner();
    return next({
      context: ownerContext,
    });
  });

/**
 * Middleware for actions permitted to moderators as well as full admins and owners:
 * Reviews, service suggestions, contact messages, applications, and editing providers.
 */
export const requireModeratorAuth = createMiddleware({ type: "function" })
  .middleware([attachSupabaseAuth])
  .server(async ({ next }) => {
    const { requireRole } = await import("./auth.server");
    const moderatorContext = await requireRole(["owner", "admin", "moderator"]);
    return next({
      context: moderatorContext,
    });
  });

export type { AuthenticatedAdminContext, AdminRole };
