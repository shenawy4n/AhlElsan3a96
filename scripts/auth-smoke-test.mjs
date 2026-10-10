import { createClient } from "@supabase/supabase-js";
import { toJSONAsync } from "seroval";

// 1. Resolve tokens from environment variables or bootstrap from server admin credentials if not set
async function ensureTokens() {
  if (process.env.TOKEN_OWNER && process.env.TOKEN_ADMIN && process.env.TOKEN_NON_ADMIN) {
    return;
  }

  // Bootstrap tokens using server environment credentials without exposing or logging them
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").trim();
  const publishableKey = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();

  if (!supabaseUrl) {
    throw new Error("Missing required environment variable: SUPABASE_URL");
  }

  if (!serviceRoleKey || !publishableKey) {
    throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_PUBLISHABLE_KEY");
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const authClient = createClient(supabaseUrl, publishableKey);

  async function fetchTokenForEmail(email) {
    const link = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const { data, error } = await authClient.auth.verifyOtp({
      token_hash: link.data?.properties?.hashed_token,
      type: "magiclink",
    });
    if (error || !data?.session?.access_token) {
      throw new Error(`Failed to generate test token for ${email}: ${error?.message}`);
    }
    return data.session.access_token;
  }

  if (!process.env.TOKEN_OWNER) {
    process.env.TOKEN_OWNER = await fetchTokenForEmail("ahmedjeko96@gmail.com");
  }
  if (!process.env.TOKEN_ADMIN) {
    process.env.TOKEN_ADMIN = await fetchTokenForEmail("shenawyjr@gmail.com");
  }
  if (!process.env.TOKEN_MODERATOR) {
    process.env.TOKEN_MODERATOR = await fetchTokenForEmail("moderator@example.com");
  }
  if (!process.env.TOKEN_NON_ADMIN) {
    process.env.TOKEN_NON_ADMIN = await fetchTokenForEmail("4n.ai@gmail.com");
  }
}

await ensureTokens();

const TOKEN_OWNER = process.env.TOKEN_OWNER;
const TOKEN_ADMIN = process.env.TOKEN_ADMIN;
const TOKEN_MODERATOR = process.env.TOKEN_MODERATOR;
const TOKEN_NON_ADMIN = process.env.TOKEN_NON_ADMIN;

const APP_URL = process.env.TEST_APP_URL || "http://localhost:3000";

function getFunctionId(file, exportName) {
  return Buffer.from(
    JSON.stringify({
      file: `${file}?tss-serverfn-split`,
      export: `${exportName}_createServerFn_handler`,
    })
  ).toString("base64url");
}

async function requestServerFn(endpointId, method, token, payload) {
  const url = `${APP_URL}/_serverFn/${endpointId}`;
  const headers = {
    "x-tsr-serverFn": "true",
    Origin: APP_URL,
    Referer: `${APP_URL}/`,
    "Sec-Fetch-Site": "same-origin",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let body = undefined;
  if (method === "POST" && payload !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(await toJSONAsync({ data: payload }));
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
    });
    return res.status;
  } catch (err) {
    return 500;
  }
}

// 20 Admin & Owner Server Functions Under Test
const FUNCTIONS_TO_TEST = [
  // Reviews (Moderator, Admin, Owner)
  {
    name: "adminListReviews",
    file: "/src/lib/reviews.functions.ts",
    method: "GET",
    scope: "moderator",
  },
  {
    name: "adminModerateReview",
    file: "/src/lib/reviews.functions.ts",
    method: "POST",
    scope: "moderator",
    validPayload: { reviewId: "00000000-0000-0000-0000-000000000000", action: "approve" },
  },
  // Messages (Moderator: update / resolve; Admin: delete)
  {
    name: "updateMessageStatus",
    file: "/src/lib/messages.functions.ts",
    method: "POST",
    scope: "moderator",
    validPayload: { id: "00000000-0000-0000-0000-000000000000", status: "contacted" },
  },
  {
    name: "deleteMessage",
    file: "/src/lib/messages.functions.ts",
    method: "POST",
    scope: "admin",
    validPayload: { id: "00000000-0000-0000-0000-000000000000" },
  },
  // Admin Actions - Suggestions (Moderator, Admin, Owner)
  {
    name: "getSuggestionsAdminFn",
    file: "/src/lib/admin-actions.functions.ts",
    method: "GET",
    scope: "moderator",
  },
  {
    name: "getSuggestionDetailAdminFn",
    file: "/src/lib/admin-actions.functions.ts",
    method: "POST",
    scope: "moderator",
    validPayload: { id: "00000000-0000-0000-0000-000000000000" },
  },
  {
    name: "updateSuggestionStatusAdminFn",
    file: "/src/lib/admin-actions.functions.ts",
    method: "POST",
    scope: "moderator",
    validPayload: { id: "00000000-0000-0000-0000-000000000000", status: "approved" },
  },
  {
    name: "approveSuggestionAndCreateCategoryAdminFn",
    file: "/src/lib/admin-actions.functions.ts",
    method: "POST",
    scope: "moderator",
    validPayload: { id: "00000000-0000-0000-0000-000000000000", categoryName: "قسم اختباري تجريبي" },
  },
  // Deletions (Admin & Owner only, Moderator forbidden 403)
  {
    name: "deleteProvidersAdminFn",
    file: "/src/lib/admin-actions.functions.ts",
    method: "POST",
    scope: "admin",
    validPayload: { ids: ["00000000-0000-0000-0000-000000000000"] },
  },
  {
    name: "deleteCategoryAdminFn",
    file: "/src/lib/admin-actions.functions.ts",
    method: "POST",
    scope: "admin",
    validPayload: { id: "00000000-0000-0000-0000-000000000000" },
  },
  {
    name: "deleteAreaAdminFn",
    file: "/src/lib/admin-actions.functions.ts",
    method: "POST",
    scope: "admin",
    validPayload: { id: "00000000-0000-0000-0000-000000000000" },
  },
  {
    name: "deleteExperienceAdminFn",
    file: "/src/lib/admin-actions.functions.ts",
    method: "POST",
    scope: "admin",
    validPayload: { id: "00000000-0000-0000-0000-000000000000" },
  },
  {
    name: "deleteReviewAdminFn",
    file: "/src/lib/admin-actions.functions.ts",
    method: "POST",
    scope: "admin",
    validPayload: { id: "00000000-0000-0000-0000-000000000000" },
  },
  {
    name: "deleteMessageAdminFn",
    file: "/src/lib/admin-actions.functions.ts",
    method: "POST",
    scope: "admin",
    validPayload: { id: "00000000-0000-0000-0000-000000000000" },
  },
  {
    name: "deleteSuggestionAdminFn",
    file: "/src/lib/admin-actions.functions.ts",
    method: "POST",
    scope: "admin",
    validPayload: { id: "00000000-0000-0000-0000-000000000000" },
  },
  // Admins & System Management (Owner only)
  {
    name: "addAdmin",
    file: "/src/lib/admins.functions.ts",
    method: "POST",
    scope: "owner",
    validPayload: { email: "shenawyjr@gmail.com", role: "admin" },
  },
  {
    name: "transferOwnership",
    file: "/src/lib/admins.functions.ts",
    method: "POST",
    scope: "owner",
    validPayload: { targetAdminId: "00000000-0000-0000-0000-000000000000" },
  },
  {
    name: "setAdminActiveStatus",
    file: "/src/lib/admins.functions.ts",
    method: "POST",
    scope: "owner",
    validPayload: { id: "211bdf7e-7719-432f-bd76-66bc866d2706", active: true },
  },
  {
    name: "revokeAdminAccount",
    file: "/src/lib/admins.functions.ts",
    method: "POST",
    scope: "owner",
    validPayload: { id: "00000000-0000-0000-0000-000000000000" },
  },
  {
    name: "setAdminPassword",
    file: "/src/lib/admins.functions.ts",
    method: "POST",
    scope: "owner",
    validPayload: { id: "00000000-0000-0000-0000-000000000000", password: "NewStrongPassword123!" },
  },
];

console.log("=========================================================================================");
console.log("                     HTTP-LEVEL AUTHORIZATION SMOKE TEST PROOF                           ");
console.log("=========================================================================================\n");

const results = [];

for (const fn of FUNCTIONS_TO_TEST) {
  const fnId = getFunctionId(fn.file, fn.name);

  // 1. No token -> expect 401
  const sNoToken = await requestServerFn(fnId, fn.method, null, fn.validPayload);

  // 2. Non-admin token -> expect 403
  const sNonAdmin = await requestServerFn(fnId, fn.method, TOKEN_NON_ADMIN, fn.validPayload);

  // 3. Moderator token
  const sModerator = await requestServerFn(fnId, fn.method, TOKEN_MODERATOR, fn.validPayload);

  // 4. Admin token
  const sAdmin = await requestServerFn(fnId, fn.method, TOKEN_ADMIN, fn.validPayload);

  // 5. Owner token
  const sOwner = await requestServerFn(fnId, fn.method, TOKEN_OWNER, fn.validPayload);

  const passed =
    fn.scope === "owner"
      ? sNoToken === 401 && sNonAdmin === 403 && sModerator === 403 && sAdmin === 403 && (sOwner === 200 || sOwner === 400 || sOwner === 404)
      : fn.scope === "admin"
      ? sNoToken === 401 && sNonAdmin === 403 && sModerator === 403 && (sAdmin === 200 || sAdmin === 400 || sAdmin === 404) && (sOwner === 200 || sOwner === 400 || sOwner === 404)
      : sNoToken === 401 && sNonAdmin === 403 && (sModerator === 200 || sModerator === 400 || sModerator === 404) && (sAdmin === 200 || sAdmin === 400 || sAdmin === 404) && (sOwner === 200 || sOwner === 400 || sOwner === 404);

  results.push({
    Function: fn.name,
    Scope: fn.scope === "owner" ? "Owner-only" : fn.scope === "admin" ? "Admin+Owner" : "Moderator+",
    "Anon": sNoToken,
    "Non-Admin": sNonAdmin,
    "Moderator": sModerator,
    "Admin": sAdmin,
    "Owner": sOwner,
    Status: passed ? "PASS" : "FAIL",
  });
}

console.table(results);
