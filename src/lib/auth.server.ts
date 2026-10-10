import { getRequest, setResponseStatus } from "@tanstack/react-start/server";
import { getStartContext } from "@tanstack/start-storage-context";
import { supabaseAdmin } from "../integrations/supabase/client.server.ts";

export type AdminRole = "owner" | "admin" | "moderator";

export type AdminAction =
  | "reviews"
  | "suggestions"
  | "messages"
  | "applications"
  | "providers:edit"
  | "providers:delete"
  | "categories:delete"
  | "areas:delete"
  | "settings"
  | "admin_management"
  | "owner_management"
  | "data_export";

/**
 * Unified permission matrix:
 * - owner: everything
 * - admin: everything except owner management (add/revoke admins, set passwords, transfer ownership)
 * - moderator: reviews, service suggestions, contact messages, provider applications (approve/reject),
 *   and editing providers; NOT deleting providers/categories/areas, NOT settings, NOT admin management,
 *   NOT data import/export.
 */
export const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<AdminAction>> = {
  owner: new Set<AdminAction>([
    "reviews",
    "suggestions",
    "messages",
    "applications",
    "providers:edit",
    "providers:delete",
    "categories:delete",
    "areas:delete",
    "settings",
    "admin_management",
    "owner_management",
    "data_export",
  ]),
  admin: new Set<AdminAction>([
    "reviews",
    "suggestions",
    "messages",
    "applications",
    "providers:edit",
    "providers:delete",
    "categories:delete",
    "areas:delete",
    "settings",
    "admin_management",
    "data_export",
  ]),
  moderator: new Set<AdminAction>([
    "reviews",
    "suggestions",
    "messages",
    "applications",
    "providers:edit",
  ]),
};

export function hasPermission(role: AdminRole, action: AdminAction): boolean {
  return ROLE_PERMISSIONS[role]?.has(action) ?? false;
}

export interface AuthenticatedAdminContext {
  userId: string;
  userEmail: string;
  role: AdminRole;
  isAdmin: boolean;
  isOwner: boolean;
  isModerator: boolean;
  callerAdmin: {
    id: string;
    email: string;
    is_owner: boolean;
    active: boolean;
    role?: AdminRole;
  } | null;
  user: any;
}

/**
 * Helper to resolve the user's role from DB columns, user metadata, or role settings.
 */
async function resolveRole(user: any, adminRecord: any): Promise<AdminRole | null> {
  if (!adminRecord || adminRecord.active !== true) {
    return null;
  }

  if (adminRecord.is_owner === true) {
    return "owner";
  }

  // Check if role column exists on admin_users table
  if (adminRecord.role) {
    const r = String(adminRecord.role).toLowerCase().trim();
    if (r === "owner") return "owner";
    if (r === "moderator") return "moderator";
    if (r === "admin") return "admin";
  }

  // Check Supabase Auth user metadata
  const userMetaRole =
    user?.app_metadata?.role ||
    user?.user_metadata?.role ||
    user?.app_metadata?.app_role;
  if (userMetaRole) {
    const r = String(userMetaRole).toLowerCase().trim();
    if (r === "owner") return "owner";
    if (r === "moderator") return "moderator";
    if (r === "admin") return "admin";
  }

  // Check app_settings for custom role mappings
  try {
    const { data: settingRow } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "admin_roles_map")
      .maybeSingle();

    if (settingRow?.value) {
      const map = JSON.parse(settingRow.value);
      const email = (user.email || "").toLowerCase().trim();
      if (map[email]) {
        const r = String(map[email]).toLowerCase().trim();
        if (r === "owner") return "owner";
        if (r === "moderator") return "moderator";
        if (r === "admin") return "admin";
      }
    }
  } catch {
    // Ignore setting parse error
  }

  // Fallback for active admin record
  return "admin";
}

/**
 * Validates token and checks if user has one of the allowed roles.
 * Throws 401 if unauthenticated, 403 if unauthorized.
 */
export async function requireRole(
  allowedRoles: AdminRole[],
  explicitAuthHeader?: string
): Promise<AuthenticatedAdminContext> {
  let authHeader = explicitAuthHeader;
  if (!authHeader) {
    try {
      const startCtx = getStartContext({ throwIfNotFound: false });
      if (startCtx?.request) {
        authHeader = startCtx.request.headers.get("authorization") || undefined;
      }
    } catch {
      authHeader = undefined;
    }
  }

  if (!authHeader) {
    try {
      const request = getRequest();
      authHeader = request?.headers?.get("authorization") || undefined;
    } catch {
      authHeader = undefined;
    }
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    try { setResponseStatus(401); } catch {}
    throw new Response(
      JSON.stringify({ ok: false, error: "Unauthorized: Missing or invalid authorization token" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.split(".").length !== 3) {
    try { setResponseStatus(401); } catch {}
    throw new Response(
      JSON.stringify({ ok: false, error: "Unauthorized: Malformed session token" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Validate the access token with Supabase Auth
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user?.id) {
    try { setResponseStatus(401); } catch {}
    throw new Response(
      JSON.stringify({ ok: false, error: "Unauthorized: Invalid or expired session token" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const user = userData.user;
  const userId = user.id;
  const userEmail = (user.email || "").toLowerCase().trim();

  // Retrieve admin record from admin_users
  const { data: adminRecord } = await supabaseAdmin
    .from("admin_users")
    .select("*")
    .eq("email", userEmail)
    .maybeSingle();

  const callerRole = await resolveRole(user, adminRecord);

  if (!callerRole) {
    try { setResponseStatus(403); } catch {}
    throw new Response(
      JSON.stringify({ ok: false, error: "Forbidden: Admin privileges required" }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  if (!allowedRoles.includes(callerRole)) {
    try { setResponseStatus(403); } catch {}
    throw new Response(
      JSON.stringify({
        ok: false,
        error: `Forbidden: Insufficient privileges for role '${callerRole}'`,
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return {
    userId,
    userEmail,
    role: callerRole,
    isAdmin: callerRole === "admin" || callerRole === "owner",
    isOwner: callerRole === "owner",
    isModerator: callerRole === "moderator",
    callerAdmin: adminRecord ?? null,
    user,
  };
}

/**
 * Validates the caller has admin or owner role (excludes content moderator for restricted actions).
 */
export async function requireAdmin(explicitAuthHeader?: string): Promise<AuthenticatedAdminContext> {
  return requireRole(["owner", "admin"], explicitAuthHeader);
}

/**
 * Validates the caller is an active primary owner.
 */
export async function requireOwner(explicitAuthHeader?: string): Promise<AuthenticatedAdminContext> {
  return requireRole(["owner"], explicitAuthHeader);
}

/**
 * Validates the caller has any active admin staff role (owner, admin, or moderator).
 */
export async function requireModerator(explicitAuthHeader?: string): Promise<AuthenticatedAdminContext> {
  return requireRole(["owner", "admin", "moderator"], explicitAuthHeader);
}
