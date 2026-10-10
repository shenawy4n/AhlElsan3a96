import { supabase } from "@/integrations/supabase/client";

type EventType =
  | "profile_view"
  | "phone_click"
  | "whatsapp_click"
  | "search"
  | "category_view";

let cachedIsAdmin: boolean | null = null;
let adminCheckPromise: Promise<boolean> | null = null;

async function isAdmin(): Promise<boolean> {
  if (cachedIsAdmin !== null) return cachedIsAdmin;
  if (adminCheckPromise) return adminCheckPromise;

  adminCheckPromise = (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) {
        cachedIsAdmin = false;
        return false;
      }
      const { data: r } = await supabase.rpc("has_role", {
        _user_id: uid,
        _role: "admin",
      });
      cachedIsAdmin = Boolean(r);
      return cachedIsAdmin;
    } catch {
      cachedIsAdmin = false;
      return false;
    } finally {
      adminCheckPromise = null;
    }
  })();

  return adminCheckPromise;
}

if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange(() => {
    cachedIsAdmin = null;
    adminCheckPromise = null;
  });
}

// Queue and batch events to avoid bursting network requests
let eventQueue: {
  event_type: EventType;
  provider_id: string | null;
  category_id: string | null;
  query: string | null;
}[] = [];
let flushTimeout: any = null;

async function flushEvents() {
  if (!eventQueue.length) return;
  const toSend = [...eventQueue];
  eventQueue = [];

  const admin = await isAdmin();
  if (admin) return;

  try {
    await supabase.from("analytics_events").insert(toSend);
  } catch {
    // Non-blocking fail silently
  }
}

/** Lightweight, anonymous event logging. Batched to prevent network flooding. */
export function track(
  event_type: EventType,
  extra: {
    provider_id?: string | undefined;
    category_id?: string | undefined;
    query?: string | undefined;
  } = {}
) {
  if (typeof window === "undefined") return;

  eventQueue.push({
    event_type,
    provider_id: extra.provider_id ?? null,
    category_id: extra.category_id ?? null,
    query: extra.query?.slice(0, 80) ?? null,
  });

  if (!flushTimeout) {
    flushTimeout = setTimeout(() => {
      flushTimeout = null;
      void flushEvents();
    }, 1500);
  }
}
