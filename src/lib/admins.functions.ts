import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireOwnerAuth, requireModeratorAuth } from "./auth-middleware";

const addSchema = z.object({
  email: z.string().trim().toLowerCase().email("البريد الإلكتروني المدخل غير صالح").max(255),
  password: z
    .string()
    .min(10, "كلمة المرور يجب أن تكون ١٠ أحرف على الأقل")
    .max(72)
    .optional()
    .or(z.literal("")),
  role: z.enum(["admin", "moderator"]).default("admin"),
});

/** Owner-only: authorize an email as admin, and optionally create its login. */
export const addAdmin = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((d) => addSchema.parse(d))
  .handler(async ({ data, context }) => {
    const caller = (context as any) as { userId: string; userEmail: string; isOwner: boolean };
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");

    const callerEmail = caller.userEmail;

    // Check if email already in admin_users
    const { data: existing, error: checkError } = await supabaseAdmin
      .from("admin_users")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();

    if (checkError) {
      throw new Response(
        JSON.stringify({ ok: false, message: "فشل التحقق من البريد الإلكتروني" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (existing) {
      throw new Response(
        JSON.stringify({
          ok: false,
          code: "already_admin",
          message: "هذا البريد الإلكتروني مسجل كمسؤول بالفعل",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Insert new admin (is_owner is false)
    let insertResult = await (supabaseAdmin.from("admin_users") as any).insert({
      email: data.email,
      is_owner: false,
      active: true,
      added_by_email: callerEmail,
      role: data.role,
    });

    if (insertResult.error) {
      // If role column doesn't exist yet, insert without role column
      const fallbackResult = await supabaseAdmin.from("admin_users").insert({
        email: data.email,
        is_owner: false,
        active: true,
        added_by_email: callerEmail,
      });

      if (fallbackResult.error) {
        console.error("[Admins] Error inserting admin");
        throw new Response(
          JSON.stringify({ ok: false, code: "insert_failed", message: fallbackResult.error.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Persist role mapping in app_settings as fallback
    try {
      const { data: s } = await supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", "admin_roles_map")
        .maybeSingle();
      let map: Record<string, string> = {};
      if (s?.value) {
        try {
          map = JSON.parse(s.value);
        } catch {}
      }
      map[data.email] = data.role;
      await supabaseAdmin.from("app_settings").upsert({
        key: "admin_roles_map",
        value: JSON.stringify(map),
      });
    } catch {
      // Non-fatal
    }

    // Audit log (target email only, never log credentials)
    await supabaseAdmin.from("audit_log").insert({
      admin_id: caller.userId,
      admin_email: callerEmail,
      action: "admin_added",
      target: data.email,
    });

    // Create or update auth login user metadata with assigned role
    let warning: string | undefined = undefined;
    try {
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const existingAuth = (listData?.users as any[])?.find(
        (u: any) => (u.email || "").toLowerCase().trim() === data.email.toLowerCase().trim()
      );
      if (existingAuth) {
        const updatePayload: any = {
          user_metadata: { ...(existingAuth.user_metadata || {}), role: data.role },
          app_metadata: { ...(existingAuth.app_metadata || {}), role: data.role },
        };
        if (data.password && data.password.length >= 10) {
          updatePayload.password = data.password;
        }
        await supabaseAdmin.auth.admin.updateUserById(existingAuth.id, updatePayload);
      } else if (data.password && data.password.length >= 10) {
        const { error: e2 } = await supabaseAdmin.auth.admin.createUser({
          email: data.email,
          password: data.password,
          email_confirm: true,
          user_metadata: { role: data.role },
          app_metadata: { role: data.role },
        });
        if (e2 && !/already|registered|exists/i.test(e2.message)) {
          warning = e2.message;
        }
      }
    } catch (err: any) {
      console.warn("[Admins] Warning updating user metadata:", err?.message);
    }

    return { ok: true as const, warning };
  });

/** Owner-only: transfer primary ownership to another admin. */
export const transferOwnership = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((d) =>
    z
      .object({
        targetAdminId: z.string().uuid("معرف المسؤول المستهدف غير صالح"),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const caller = (context as any) as { userId: string; userEmail: string; isOwner: boolean };
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");

    const { data: callerAdmin } = await supabaseAdmin
      .from("admin_users")
      .select("id, is_owner")
      .eq("email", caller.userEmail)
      .single();

    if (!callerAdmin?.is_owner) {
      throw new Response(
        JSON.stringify({ ok: false, code: "not_owner", message: "هذا الإجراء متاح لمالك النظام فقط" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: targetAdmin } = await supabaseAdmin
      .from("admin_users")
      .select("id, email, active")
      .eq("id", data.targetAdminId)
      .single();

    if (!targetAdmin) {
      throw new Response(
        JSON.stringify({ ok: false, code: "not_found", message: "المسؤول المستهدف غير موجود" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!targetAdmin.active) {
      throw new Response(
        JSON.stringify({ ok: false, code: "target_inactive", message: "لا يمكن نقل الملكية لحساب موقوف" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Demote current owner to false
    const { error: demoteErr } = await supabaseAdmin
      .from("admin_users")
      .update({ is_owner: false })
      .eq("id", callerAdmin.id);

    if (demoteErr) {
      throw new Response(
        JSON.stringify({ ok: false, code: "update_failed", message: demoteErr.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Promote target to true
    const { error: promoteErr } = await supabaseAdmin
      .from("admin_users")
      .update({ is_owner: true })
      .eq("id", targetAdmin.id);

    if (promoteErr) {
      // Revert if error
      await supabaseAdmin.from("admin_users").update({ is_owner: true }).eq("id", callerAdmin.id);
      throw new Response(
        JSON.stringify({ ok: false, code: "update_failed", message: promoteErr.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    await supabaseAdmin.from("audit_log").insert({
      admin_id: caller.userId,
      admin_email: caller.userEmail,
      action: "ownership_transferred",
      target: targetAdmin.email,
    });

    return { ok: true as const };
  });

/** Owner-only: activate or deactivate an admin account. */
export const setAdminActiveStatus = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid("معرف المسؤول غير صالح"),
        active: z.boolean(),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const caller = (context as any) as { userId: string; userEmail: string; isOwner: boolean };
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");

    const callerEmail = caller.userEmail.toLowerCase().trim();

    const { data: target } = await supabaseAdmin
      .from("admin_users")
      .select("id, email, is_owner, active")
      .eq("id", data.id)
      .single();

    if (!target) {
      throw new Response(
        JSON.stringify({ ok: false, code: "not_found", message: "المسؤول غير موجود" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Safety rule: owner cannot deactivate themselves
    if (!data.active && target.email.toLowerCase().trim() === callerEmail) {
      throw new Response(
        JSON.stringify({
          ok: false,
          code: "cannot_suspend_self",
          message: "لا يمكنك إيقاف حسابك الشخصي",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Safety rule: there must always be at least one active owner
    if (target.is_owner && !data.active) {
      const { count: activeOwnerCount } = await supabaseAdmin
        .from("admin_users")
        .select("id", { count: "exact", head: true })
        .eq("is_owner", true)
        .eq("active", true);

      if ((activeOwnerCount ?? 0) <= 1) {
        throw new Response(
          JSON.stringify({
            ok: false,
            code: "cannot_suspend_owner",
            message: "لا يمكن إيقاف حساب المالك الرئيسي حيث يجب الإبقاء على مالك نشط واحد على الأقل",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const { error } = await supabaseAdmin
      .from("admin_users")
      .update({ active: data.active })
      .eq("id", data.id);

    if (error) {
      throw new Response(
        JSON.stringify({ ok: false, code: "update_failed", message: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    await supabaseAdmin.from("audit_log").insert({
      admin_id: caller.userId,
      admin_email: caller.userEmail,
      action: data.active ? "admin_activated" : "admin_suspended",
      target: target.email,
    });

    return { ok: true as const };
  });

/** Owner-only: revoke an admin account permanently. */
export const revokeAdminAccount = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid("معرف المسؤول غير صالح"),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const caller = (context as any) as { userId: string; userEmail: string; isOwner: boolean };
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");

    const callerEmail = caller.userEmail.toLowerCase().trim();

    const { data: target } = await supabaseAdmin
      .from("admin_users")
      .select("id, email, is_owner")
      .eq("id", data.id)
      .single();

    if (!target) {
      throw new Response(
        JSON.stringify({ ok: false, code: "not_found", message: "المسؤول غير موجود" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Safety rule: owner cannot revoke themselves
    if (target.email.toLowerCase().trim() === callerEmail) {
      throw new Response(
        JSON.stringify({
          ok: false,
          code: "cannot_revoke_self",
          message: "لا يمكنك سحب صلاحية حسابك الشخصي",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Safety rule: there must always be at least one active owner
    if (target.is_owner) {
      const { count: activeOwnerCount } = await supabaseAdmin
        .from("admin_users")
        .select("id", { count: "exact", head: true })
        .eq("is_owner", true)
        .eq("active", true);

      if ((activeOwnerCount ?? 0) <= 1) {
        throw new Response(
          JSON.stringify({
            ok: false,
            code: "cannot_revoke_owner",
            message: "لا يمكن سحب صلاحية المالك الرئيسي حيث يجب وجود مالك نشط واحد على الأقل",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const { error } = await supabaseAdmin.from("admin_users").delete().eq("id", data.id);
    if (error) {
      throw new Response(
        JSON.stringify({ ok: false, code: "delete_failed", message: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    await supabaseAdmin.from("audit_log").insert({
      admin_id: caller.userId,
      admin_email: caller.userEmail,
      action: "admin_revoked",
      target: target.email,
    });

    return { ok: true as const };
  });

/** Owner-only: reset or assign a password for an admin user. */
export const setAdminPassword = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid("معرف المسؤول غير صالح"),
        password: z.string().min(10, "كلمة المرور يجب أن تكون ١٠ أحرف على الأقل").max(72),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const caller = (context as any) as { userId: string; userEmail: string; isOwner: boolean };
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");

    const { data: target } = await supabaseAdmin
      .from("admin_users")
      .select("email")
      .eq("id", data.id)
      .single();

    if (!target) {
      throw new Response(
        JSON.stringify({ ok: false, code: "not_found", message: "المسؤول غير موجود" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: users, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) {
      throw new Response(
        JSON.stringify({ ok: false, code: "auth_list_failed", message: listErr.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const targetAuth = users.users.find((u) => u.email?.toLowerCase() === target.email.toLowerCase());

    if (!targetAuth) {
      const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: target.email,
        password: data.password,
        email_confirm: true,
      });
      if (createErr) {
        throw new Response(
          JSON.stringify({ ok: false, code: "create_auth_failed", message: createErr.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(targetAuth.id, {
        password: data.password,
      });
      if (updateErr) {
        throw new Response(
          JSON.stringify({ ok: false, code: "update_auth_failed", message: updateErr.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Target email only, never log password or tokens!
    await supabaseAdmin.from("audit_log").insert({
      admin_id: caller.userId,
      admin_email: caller.userEmail,
      action: "password_reset",
      target: target.email,
    });

    return { ok: true as const };
  });

/** Any authenticated admin, owner, or moderator: returns their current role context. */
export const getCurrentAdminRole = createServerFn({ method: "GET" })
  .middleware([requireModeratorAuth])
  .handler(async ({ context }) => {
    const caller = context as any;
    return {
      role: caller.role as "owner" | "admin" | "moderator",
      userEmail: caller.userEmail as string,
      isOwner: Boolean(caller.isOwner),
      isModerator: Boolean(caller.isModerator),
    };
  });
