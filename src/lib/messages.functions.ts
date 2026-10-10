import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminAuth, requireModeratorAuth } from "./auth-middleware";

const messageSchema = z.object({
  name: z.string().trim().min(2, "يرجى كتابة الاسم").max(100),
  phone: z
    .string()
    .trim()
    .min(10, "يرجى إدخال رقم هاتف صحيح للتواصل")
    .max(20),
  subject: z.string().trim().max(150).optional().default(""),
  message: z
    .string()
    .trim()
    .min(5, "يرجى كتابة نص الرسالة (٥ أحرف على الأقل)")
    .max(2000),
});

/** Public: Send a contact message directly to admin requests & inbox with validation & rate limit. */
export const sendContactMessage = createServerFn({ method: "POST" })
  .inputValidator((d) => messageSchema.parse(d))
  .handler(async ({ data }) => {
    const { checkCurrentRequestRateLimit } = await import("./rate-limit.server");

    // Rate limiting by client IP
    const allowed = await checkCurrentRequestRateLimit("service_suggestion");
    if (!allowed) {
      throw new Response(
        JSON.stringify({ ok: false, error: "تم إرسال عدد كبير من الطلبات مؤخراً. يرجى المحاولة بعد قليل." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    const { supabaseAdmin } = await import("../integrations/supabase/client.server");

    // Sanitize phone
    const cleanPhone = data.phone.replace(/[^\d+]/g, "");

    const titlePrefix = data.subject ? `${data.subject} — ` : "";
    const fullName = `[رسالة تواصل] ${titlePrefix}${data.name}`;

    const { data: inserted, error } = await (supabaseAdmin.from("service_suggestions" as never) as any)
      .insert({
        name: fullName,
        phone: cleanPhone,
        note: data.message,
        status: "new",
      })
      .select()
      .single();

    if (error) {
      console.error("[Messages] Error saving contact message:", error);
      throw new Response(
        JSON.stringify({ ok: false, error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return { ok: true as const, id: inserted.id };
  });

/** Admin & Moderator: update message status (new, contacted, resolved, archived). */
export const updateMessageStatus = createServerFn({ method: "POST" })
  .middleware([requireModeratorAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid("معرف الرسالة غير صالح"),
        status: z.enum(["new", "contacted", "resolved", "archived"]),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("service_suggestions")
      .update({ status: data.status })
      .eq("id", data.id);

    if (error) {
      throw new Response(
        JSON.stringify({ ok: false, error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return { ok: true as const };
  });

/** Admin-only: delete message. */
export const deleteMessage = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid("معرف الرسالة غير صالح"),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("service_suggestions")
      .delete()
      .eq("id", data.id);

    if (error) {
      throw new Response(
        JSON.stringify({ ok: false, error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return { ok: true as const };
  });
