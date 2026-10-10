import { createClient } from "@supabase/supabase-js";
import { requireRole, ROLE_PERMISSIONS, hasPermission } from "../src/lib/auth.server.ts";

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").trim();
const publishableKey = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();

if (!supabaseUrl) {
  console.error("Missing required environment variable: SUPABASE_URL");
  process.exit(1);
}

if (!serviceRoleKey || !publishableKey) {
  console.error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey);
const authClient = createClient(supabaseUrl, publishableKey);

async function signInUser(email) {
  const link = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (link.error || !link.data?.properties?.hashed_token) {
    throw new Error(`Failed to generate link for ${email}: ${link.error?.message}`);
  }
  const { data, error } = await authClient.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: "magiclink",
  });
  if (error || !data.session?.access_token) {
    throw new Error(`Failed to sign in ${email}: ${error?.message}`);
  }
  return {
    email,
    token: data.session.access_token,
    userId: data.user.id,
  };
}

console.log("==========================================================================");
console.log("          SIGNING IN AS EACH ROLE AND VERIFYING ACCESS MATRIX             ");
console.log("==========================================================================\n");

// 1. Sign in as Owner, Admin, and Moderator
const ownerSession = await signInUser("ahmedjeko96@gmail.com");
console.log("✓ Signed in as Owner:      ahmedjeko96@gmail.com");

const adminSession = await signInUser("shenawyjr@gmail.com");
console.log("✓ Signed in as Admin:      shenawyjr@gmail.com");

const modSession = await signInUser("moderator@example.com");
console.log("✓ Signed in as Moderator:  moderator@example.com\n");

// 2. Define the exact actions and tabs
const ACTIONS_TO_VERIFY = [
  // Moderator allowed actions
  { tab: "التقييمات", action: "عرض واعتماد التقييمات (reviews)", allowedRoles: ["owner", "admin", "moderator"] },
  { tab: "الطلبات", action: "اقتراحات الخدمات (suggestions)", allowedRoles: ["owner", "admin", "moderator"] },
  { tab: "الطلبات", action: "رسائل واستفسارات المواطنين (messages)", allowedRoles: ["owner", "admin", "moderator"] },
  { tab: "الطلبات", action: "اعتماد طلبات الصنايعية (applications)", allowedRoles: ["owner", "admin", "moderator"] },
  { tab: "الخدمات", action: "تعديل بيانات الصنايعية (providers:edit)", allowedRoles: ["owner", "admin", "moderator"] },

  // Admin allowed, Moderator forbidden
  { tab: "الخدمات", action: "حذف صنايعي (providers:delete)", allowedRoles: ["owner", "admin"] },
  { tab: "الخدمات", action: "حذف قسم (categories:delete)", allowedRoles: ["owner", "admin"] },
  { tab: "الخدمات", action: "حذف قرية/منطقة (areas:delete)", allowedRoles: ["owner", "admin"] },
  { tab: "الإعدادات", action: "إعدادات المنصة (settings)", allowedRoles: ["owner", "admin"] },
  { tab: "الإعدادات", action: "تصدير البيانات (data:export)", allowedRoles: ["owner", "admin"] },

  // Owner only, Admin & Moderator forbidden
  { tab: "المسؤولون", action: "إضافة وحذف مسؤولين (admin:manage)", allowedRoles: ["owner"] },
  { tab: "المسؤولون", action: "تعيين كلمة مرور مسؤول (admin:password)", allowedRoles: ["owner"] },
  { tab: "المسؤولون", action: "نقل الملكية الرئيسية (owner:transfer)", allowedRoles: ["owner"] },
];

async function checkStatus(allowedRoles, token) {
  try {
    await requireRole(allowedRoles, token ? `Bearer ${token}` : undefined);
    return 200;
  } catch (err) {
    if (err instanceof Response) {
      return err.status;
    }
    return 403;
  }
}

const tableRows = [];

for (const act of ACTIONS_TO_VERIFY) {
  const anonStatus = await checkStatus(act.allowedRoles, null);
  const modStatus = await checkStatus(act.allowedRoles, modSession.token);
  const adminStatus = await checkStatus(act.allowedRoles, adminSession.token);
  const ownerStatus = await checkStatus(act.allowedRoles, ownerSession.token);

  tableRows.push({
    "التبويب (Tab)": act.tab,
    "الإجراء (Action)": act.action,
    "مشرف محتوى (Moderator)": modStatus,
    "مسؤول (Admin)": adminStatus,
    "المالك (Owner)": ownerStatus,
    "غير مسجل (Anon)": anonStatus,
  });
}

console.table(tableRows);
