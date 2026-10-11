import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ContactKindSchema = z.enum(["phone_click", "whatsapp_click"]);

const ContactInputSchema = z.object({
  providerId: z.string().uuid(),
  kind: ContactKindSchema,
});

export type ContactGatewayResult =
  | { ok: true; phone: string | null; whatsapp: string | null }
  | { ok: false; code: "invalid" | "rate_limited" | "not_found" | "error" };

export const contactProviderServerFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const res = ContactInputSchema.safeParse(d);
    if (!res.success) {
      throw new Error("invalid_input");
    }
    return res.data;
  })
  .handler(async ({ data }): Promise<ContactGatewayResult> => {
    const { providerId, kind } = data;

    // Rate-limiting check backed by DB check_rate_limit with in-memory fallback
    const { checkCurrentRequestRateLimit } = await import("./rate-limit.server");
    const allowed = await checkCurrentRequestRateLimit("provider_contact");
    if (!allowed) {
      return { ok: false, code: "rate_limited" };
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Canonical database contact path: invoke the atomic, minimum-disclosure contact_provider RPC
      // using service_role. Direct public execution of this RPC by anon/authenticated is revoked.
      const { data: rpcRows, error: rpcError } = await supabaseAdmin.rpc("contact_provider", {
        _provider_id: providerId,
        _kind: kind,
      });

      if (rpcError) {
        console.warn("[contactProviderServerFn] RPC error code:", rpcError.code);
        if (rpcError.message?.includes("invalid_kind")) {
          return { ok: false, code: "invalid" };
        }
        return { ok: false, code: "error" };
      }

      if (!rpcRows || !Array.isArray(rpcRows) || rpcRows.length === 0) {
        return { ok: false, code: "not_found" };
      }

      const row = rpcRows[0];

      // Minimum disclosure guarantee:
      // - phone_click returns ONLY primary phone (whatsapp is null)
      // - whatsapp_click returns ONLY whatsapp (phone is null)
      // - secondary_phone is NEVER exposed or returned
      if (kind === "phone_click") {
        return {
          ok: true,
          phone: row.phone ?? null,
          whatsapp: null,
        };
      } else if (kind === "whatsapp_click") {
        return {
          ok: true,
          phone: null,
          whatsapp: row.whatsapp ?? null,
        };
      }

      return { ok: false, code: "invalid" };
    } catch (err) {
      console.error("[contactProviderServerFn] unexpected exception occurred");
      return { ok: false, code: "error" };
    }
  });
