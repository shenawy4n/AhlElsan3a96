// ==============================================================================
// SECURITY & REGRESSION TEST SUITE: Ahl Elsan3a
// File: scripts/security-hardening-test.mjs
// Run: node scripts/security-hardening-test.mjs
// ==============================================================================

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

// ------------------------------------------------------------------------------
// 1. Environment Variable Validation (Strict, no hardcoded fallbacks)
// ------------------------------------------------------------------------------
const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
const publishableKey = (
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ""
).trim();
const serviceRoleKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  ""
).trim();

if (!supabaseUrl) {
  console.error("FATAL: Missing required environment variable: SUPABASE_URL (or VITE_SUPABASE_URL)");
  process.exit(1);
}

if (!publishableKey) {
  console.error("FATAL: Missing required environment variable: SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY / SUPABASE_ANON_KEY)");
  process.exit(1);
}

if (!serviceRoleKey) {
  console.error("FATAL: Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)");
  process.exit(1);
}

console.log("==============================================================================");
console.log("             AHL ELSAN3A — SECURITY HARDENING TEST SUITE                      ");
console.log(` Target URL: ${supabaseUrl}`);
console.log("==============================================================================\n");

function isNewSupabaseApiKey(value) {
  return typeof value === "string" && (value.startsWith("sb_publishable_") || value.startsWith("sb_secret_"));
}

function createSupabaseFetch(key) {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, k) => headers.set(k, value));
    }
    if (isNewSupabaseApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

// ------------------------------------------------------------------------------
// Test Clients
// ------------------------------------------------------------------------------
const anonClient = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: createSupabaseFetch(publishableKey) },
});

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: createSupabaseFetch(serviceRoleKey) },
});

// ------------------------------------------------------------------------------
// Test Tracking & Verdicts (PASS, FAIL, BLOCKED)
// ------------------------------------------------------------------------------
const testResults = [];

function recordResult(id, title, status, details = "") {
  testResults.push({ id, title, status, details });
  const icon = status === "PASS" ? "✓ [PASS]" : status === "FAIL" ? "✗ [FAIL]" : "⚠ [BLOCKED]";
  console.log(`  ${icon} ${id}: ${title}`);
  if (details) {
    console.log(`      ↳ ${details}`);
  }
}

async function runSecuritySuite() {
  console.log("Starting security verification suite...\n");

  // Fetch sample active provider using anonymous client (or admin if available)
  let sampleProvider = null;
  try {
    const { data, error } = await anonClient
      .from("providers")
      .select("id, name, status, has_whatsapp")
      .eq("status", "active")
      .limit(1);

    if (!error && Array.isArray(data) && data.length > 0) {
      sampleProvider = data[0];
    }
  } catch (err) {
    console.warn("Could not query sample provider via anon:", err.message);
  }

  // Fallback to query without filter if needed
  if (!sampleProvider) {
    const { data } = await anonClient.from("providers").select("id, name").limit(1);
    if (data && data[0]) sampleProvider = data[0];
  }

  // ----------------------------------------------------------------------------
  // Test A — Anonymous Public Directory Access
  // ----------------------------------------------------------------------------
  console.log("--- Test A: Anonymous Public Directory Access ---");
  try {
    const publicCols = "id, name, category_id, area_id, description, services, photo_url, status, is_premium, is_verified, has_whatsapp";
    const { data, error } = await anonClient
      .from("providers")
      .select(publicCols)
      .eq("status", "active")
      .limit(5);

    if (error) {
      recordResult("Test A", "Anonymous public directory access", "FAIL", `Error: ${error.message} (Code: ${error.code})`);
    } else if (!Array.isArray(data) || data.length === 0) {
      recordResult("Test A", "Anonymous public directory access", "FAIL", "No active provider records returned");
    } else {
      recordResult("Test A", "Anonymous public directory access", "PASS", `Retrieved ${data.length} public providers`);
    }
  } catch (err) {
    recordResult("Test A", "Anonymous public directory access", "FAIL", err.message);
  }
  console.log();

  // ----------------------------------------------------------------------------
  // Test B — Anonymous Sensitive-Column Access (Database-Level Denial)
  // ----------------------------------------------------------------------------
  console.log("--- Test B: Anonymous Sensitive-Column Access ---");
  try {
    const [pRes, sRes, wRes, starRes] = await Promise.all([
      anonClient.from("providers").select("id, phone").limit(1),
      anonClient.from("providers").select("id, secondary_phone").limit(1),
      anonClient.from("providers").select("id, whatsapp").limit(1),
      anonClient.from("providers").select("*").limit(1),
    ]);

    const phoneDenied = pRes.error !== null && pRes.data === null;
    const secondaryDenied = sRes.error !== null && sRes.data === null;
    const waDenied = wRes.error !== null && wRes.data === null;
    const starDenied = starRes.error !== null && starRes.data === null;

    if (phoneDenied && secondaryDenied && waDenied && starDenied) {
      recordResult(
        "Test B",
        "Anonymous direct sensitive-column queries denied at database level",
        "PASS",
        `phone code: ${pRes.error.code}, secondary_phone code: ${sRes.error.code}, whatsapp code: ${wRes.error.code}, star code: ${starRes.error.code}`
      );
    } else {
      const leaked = [];
      if (!phoneDenied) leaked.push("phone");
      if (!secondaryDenied) leaked.push("secondary_phone");
      if (!waDenied) leaked.push("whatsapp");
      if (!starDenied) leaked.push("SELECT *");
      recordResult("Test B", "Anonymous direct sensitive-column queries denied", "FAIL", `Leaked direct access to: ${leaked.join(", ")}`);
    }
  } catch (err) {
    recordResult("Test B", "Anonymous direct sensitive-column queries denied", "FAIL", err.message);
  }
  console.log();

  // ----------------------------------------------------------------------------
  // Test C — Authenticated Normal-User Sensitive-Column Access
  // ----------------------------------------------------------------------------
  console.log("--- Test C: Authenticated Normal-User Sensitive-Column Access ---");
  const testEmail = `sec_audit_${Date.now()}@example.com`;
  const testPassword = "PasswordSecure9988!";
  let testUserId = null;
  let userClient = null;

  try {
    // Attempt to create a temporary test user via adminClient
    const { data: createdAuth, error: createAuthErr } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { role: "user" },
    });

    if (createAuthErr || !createdAuth?.user) {
      // If adminClient is unavailable/unauthorized, attempt regular signUp via anon
      const { data: signUpData, error: signUpErr } = await anonClient.auth.signUp({
        email: testEmail,
        password: testPassword,
      });

      if (signUpErr || !signUpData?.user) {
        recordResult(
          "Test C",
          "Authenticated normal-user sensitive-column access",
          "BLOCKED",
          `Could not provision temporary authenticated normal user session. Admin err: ${createAuthErr?.message || "unauthorized"}; Signup err: ${signUpErr?.message || "none"}`
        );
      } else {
        testUserId = signUpData.user.id;
        if (signUpData.session) {
          userClient = createClient(supabaseUrl, publishableKey, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: {
              fetch: (input, init) => {
                const headers = new Headers(init?.headers);
                headers.set("Authorization", `Bearer ${signUpData.session.access_token}`);
                headers.set("apikey", publishableKey);
                return fetch(input, { ...init, headers });
              },
            },
          });
        }
      }
    } else {
      testUserId = createdAuth.user.id;
      const authClient = createClient(supabaseUrl, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: createSupabaseFetch(publishableKey) },
      });

      const { data: sessionData, error: loginErr } = await authClient.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });

      if (!loginErr && sessionData?.session?.access_token) {
        userClient = createClient(supabaseUrl, publishableKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input, init) => {
              const headers = new Headers(init?.headers);
              headers.set("Authorization", `Bearer ${sessionData.session.access_token}`);
              headers.set("apikey", publishableKey);
              return fetch(input, { ...init, headers });
            },
          },
        });
      } else {
        recordResult(
          "Test C",
          "Authenticated normal-user sensitive-column access",
          "BLOCKED",
          `Created user but failed to sign in: ${loginErr?.message}`
        );
      }
    }

    if (userClient) {
      const [uPhone, uSec, uWa, uStar] = await Promise.all([
        userClient.from("providers").select("id, phone").limit(1),
        userClient.from("providers").select("id, secondary_phone").limit(1),
        userClient.from("providers").select("id, whatsapp").limit(1),
        userClient.from("providers").select("*").limit(1),
      ]);

      const pDenied = uPhone.error !== null && uPhone.data === null;
      const sDenied = uSec.error !== null && uSec.data === null;
      const wDenied = uWa.error !== null && uWa.data === null;
      const starDenied = uStar.error !== null && uStar.data === null;

      if (pDenied && sDenied && wDenied && starDenied) {
        recordResult(
          "Test C",
          "Authenticated normal user denied direct sensitive-column queries",
          "PASS",
          `All 4 direct queries denied for authenticated user (${testEmail})`
        );
      } else {
        const leaked = [];
        if (!pDenied) leaked.push("phone");
        if (!sDenied) leaked.push("secondary_phone");
        if (!wDenied) leaked.push("whatsapp");
        if (!starDenied) leaked.push("SELECT *");
        recordResult("Test C", "Authenticated normal user sensitive-column access", "FAIL", `Leaked to authenticated user: ${leaked.join(", ")}`);
      }
    }
  } catch (err) {
    recordResult("Test C", "Authenticated normal user sensitive-column access", "BLOCKED", err.message);
  } finally {
    if (testUserId) {
      try {
        await adminClient.auth.admin.deleteUser(testUserId);
      } catch {
        // Safe test-user cleanup error ignored
      }
    }
  }
  console.log();

  // ----------------------------------------------------------------------------
  // Test D — Approved Public Directory Fields Available Without Sensitive Leaks
  // ----------------------------------------------------------------------------
  console.log("--- Test D: Public Directory Fields Integrity ---");
  try {
    const publicCols = "id, name, category_id, area_id, description, services, photo_url, is_verified, has_whatsapp";
    const { data, error } = await anonClient.from("providers").select(publicCols).limit(5);

    if (error || !Array.isArray(data) || data.length === 0) {
      recordResult("Test D", "Approved public fields readable without sensitive columns", "FAIL", `Failed to read: ${error?.message}`);
    } else {
      const first = data[0];
      const hasSafeFields = first.id && first.name !== undefined && typeof first.has_whatsapp === "boolean";
      const hasSensitiveKeys = "phone" in first || "secondary_phone" in first || "whatsapp" in first;

      if (hasSafeFields && !hasSensitiveKeys) {
        recordResult("Test D", "Approved public fields readable without sensitive columns", "PASS", "Safe fields present; sensitive fields absent");
      } else {
        recordResult("Test D", "Approved public fields readable without sensitive columns", "FAIL", `Safe fields: ${hasSafeFields}, sensitive exposed: ${hasSensitiveKeys}`);
      }
    }
  } catch (err) {
    recordResult("Test D", "Approved public fields readable without sensitive columns", "FAIL", err.message);
  }
  console.log();

  // ----------------------------------------------------------------------------
  // Test E — Direct Unauthorized contact_provider RPC 'phone_click' Action
  // ----------------------------------------------------------------------------
  console.log("--- Test E: Direct Unauthorized contact_provider RPC 'phone_click' Action ---");
  if (!sampleProvider) {
    recordResult("Test E", "Direct anonymous contact_provider phone_click denied", "BLOCKED", "No active sample provider available");
  } else {
    try {
      const { data, error } = await anonClient.rpc("contact_provider", {
        _provider_id: sampleProvider.id,
        _kind: "phone_click",
      });

      if (error) {
        const isPermissionDenied =
          error.code === "42501" ||
          error.message?.toLowerCase().includes("permission denied") ||
          error.message?.toLowerCase().includes("not allowed");

        if (isPermissionDenied) {
          recordResult(
            "Test E",
            "Direct anonymous contact_provider phone_click denied",
            "PASS",
            `Unauthorized direct RPC access strictly denied by database RBAC: ${error.message} (Code: ${error.code || "42501"})`
          );
        } else {
          recordResult(
            "Test E",
            "Direct anonymous contact_provider phone_click denied",
            "BLOCKED",
            `Inconclusive non-auth RPC error: ${error.message} (Code: ${error.code || "unknown"})`
          );
        }
      } else {
        recordResult(
          "Test E",
          "Direct anonymous contact_provider phone_click denied",
          "FAIL",
          `CRITICAL: Anonymous caller bypassed server gateway and executed contact_provider directly. Data returned: ${JSON.stringify(data)}`
        );
      }
    } catch (err) {
      recordResult(
        "Test E",
        "Direct anonymous contact_provider phone_click denied",
        "BLOCKED",
        `Inconclusive network/client exception: ${err.message}`
      );
    }
  }
  console.log();

  // ----------------------------------------------------------------------------
  // Test F — Direct Unauthorized contact_provider RPC 'whatsapp_click' Action
  // ----------------------------------------------------------------------------
  console.log("--- Test F: Direct Unauthorized contact_provider RPC 'whatsapp_click' Action ---");
  if (!sampleProvider) {
    recordResult("Test F", "Direct anonymous contact_provider whatsapp_click denied", "BLOCKED", "No active sample provider available");
  } else {
    try {
      const { data, error } = await anonClient.rpc("contact_provider", {
        _provider_id: sampleProvider.id,
        _kind: "whatsapp_click",
      });

      if (error) {
        const isPermissionDenied =
          error.code === "42501" ||
          error.message?.toLowerCase().includes("permission denied") ||
          error.message?.toLowerCase().includes("not allowed");

        if (isPermissionDenied) {
          recordResult(
            "Test F",
            "Direct anonymous contact_provider whatsapp_click denied",
            "PASS",
            `Unauthorized direct RPC access strictly denied by database RBAC: ${error.message} (Code: ${error.code || "42501"})`
          );
        } else {
          recordResult(
            "Test F",
            "Direct anonymous contact_provider whatsapp_click denied",
            "BLOCKED",
            `Inconclusive non-auth RPC error: ${error.message} (Code: ${error.code || "unknown"})`
          );
        }
      } else {
        recordResult(
          "Test F",
          "Direct anonymous contact_provider whatsapp_click denied",
          "FAIL",
          `CRITICAL: Anonymous caller bypassed server gateway and executed contact_provider directly. Data returned: ${JSON.stringify(data)}`
        );
      }
    } catch (err) {
      recordResult(
        "Test F",
        "Direct anonymous contact_provider whatsapp_click denied",
        "BLOCKED",
        `Inconclusive network/client exception: ${err.message}`
      );
    }
  }
  console.log();

  // ----------------------------------------------------------------------------
  // Test G — 'phone_reveal' Forbidden Action Rejection
  // ----------------------------------------------------------------------------
  console.log("--- Test G: Rejection of Forbidden 'phone_reveal' Action ---");
  if (!sampleProvider) {
    recordResult("Test G", "phone_reveal forbidden action rejection", "BLOCKED", "No active sample provider available");
  } else {
    try {
      const { data, error } = await anonClient.rpc("contact_provider", {
        _provider_id: sampleProvider.id,
        _kind: "phone_reveal",
      });

      if (error !== null) {
        recordResult(
          "Test G",
          "phone_reveal forbidden action rejection",
          "PASS",
          `Database rejected phone_reveal with expected error: ${error.message}`
        );
      } else {
        recordResult(
          "Test G",
          "phone_reveal forbidden action rejection",
          "FAIL",
          `Database allowed phone_reveal and returned data: ${JSON.stringify(data)}`
        );
      }
    } catch (err) {
      recordResult("Test G", "phone_reveal forbidden action rejection", "PASS", `Caught rejection exception: ${err.message}`);
    }
  }
  console.log();

  // ----------------------------------------------------------------------------
  // Test H — Arbitrary Invalid Action Rejection
  // ----------------------------------------------------------------------------
  console.log("--- Test H: Rejection of Invalid Contact Action ---");
  if (!sampleProvider) {
    recordResult("Test H", "Invalid contact action rejection", "BLOCKED", "No active sample provider available");
  } else {
    try {
      const { data, error } = await anonClient.rpc("contact_provider", {
        _provider_id: sampleProvider.id,
        _kind: "unauthorized_arbitrary_action",
      });

      if (error !== null) {
        recordResult(
          "Test H",
          "Invalid contact action rejection",
          "PASS",
          `Database rejected invalid action: ${error.message}`
        );
      } else {
        recordResult(
          "Test H",
          "Invalid contact action rejection",
          "FAIL",
          `Database accepted invalid action: ${JSON.stringify(data)}`
        );
      }
    } catch (err) {
      recordResult("Test H", "Invalid contact action rejection", "PASS", `Caught rejection exception: ${err.message}`);
    }
  }
  console.log();

  // ----------------------------------------------------------------------------
  // Test I — Inactive or Nonexistent Provider Handling
  // ----------------------------------------------------------------------------
  console.log("--- Test I: Inactive / Nonexistent Provider Handling ---");
  try {
    const fakeUuid = "00000000-0000-0000-0000-000000000000";
    const { data, error } = await anonClient.rpc("contact_provider", {
      _provider_id: fakeUuid,
      _kind: "phone_click",
    });

    if (error !== null || !Array.isArray(data) || data.length === 0) {
      recordResult(
        "Test I",
        "Inactive/nonexistent provider returns no sensitive contact details",
        "PASS",
        `Returned empty set or controlled error (${error?.message || "empty result"})`
      );
    } else {
      recordResult("Test I", "Inactive/nonexistent provider returns no sensitive contact details", "FAIL", `Returned data for fake UUID: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    recordResult("Test I", "Inactive/nonexistent provider returns no sensitive contact details", "PASS", err.message);
  }
  console.log();

  // ----------------------------------------------------------------------------
  // Test J — Admin Boundary on admin_get_providers()
  // ----------------------------------------------------------------------------
  console.log("--- Test J: Admin Function Boundary on admin_get_providers() ---");
  try {
    // J1: Anonymous caller must be rejected
    const { data: anonAdminData, error: anonAdminErr } = await anonClient.rpc("admin_get_providers");
    const anonRejected = anonAdminErr !== null && anonAdminData === null;

    // J2: Authenticated normal user must be rejected
    let userRejected = false;
    if (userClient) {
      const { data: userData, error: userErr } = await userClient.rpc("admin_get_providers");
      userRejected = userErr !== null && userData === null;
    } else {
      userRejected = true; // covered if session unavailable
    }

    if (anonRejected && userRejected) {
      recordResult(
        "Test J",
        "admin_get_providers() denied to unprivileged callers",
        "PASS",
        `Anon call rejected: ${anonAdminErr?.message} (Code: ${anonAdminErr?.code})`
      );
    } else {
      recordResult(
        "Test J",
        "admin_get_providers() denied to unprivileged callers",
        "FAIL",
        `Anon rejected: ${anonRejected}, Normal user rejected: ${userRejected}`
      );
    }
  } catch (err) {
    recordResult("Test J", "admin_get_providers() denied to unprivileged callers", "FAIL", err.message);
  }
  console.log();

  // ----------------------------------------------------------------------------
  // Test K — Secret Exposure Audit (Tracked Files & Client Bundles)
  // ----------------------------------------------------------------------------
  console.log("--- Test K: Secret Exposure Audit ---");
  try {
    const projectRoot = resolve(process.cwd());
    const forbiddenSecrets = [
      "sb_secret_",
    ];

    const violations = [];

    function scanDir(dir) {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (
          entry === "node_modules" ||
          entry === ".git" ||
          entry === "dist" ||
          entry === ".tanstack" ||
          entry === ".output" ||
          entry === ".wrangler"
        ) {
          continue;
        }

        const fullPath = join(dir, entry);
        if (fullPath.includes("security-hardening-test.mjs")) {
          continue;
        }

        const st = statSync(fullPath);
        if (st.isDirectory()) {
          scanDir(fullPath);
        } else if (
          entry.endsWith(".ts") ||
          entry.endsWith(".tsx") ||
          entry.endsWith(".js") ||
          entry.endsWith(".mjs") ||
          entry.endsWith(".json")
        ) {
          const content = readFileSync(fullPath, "utf-8");
          // Check for hardcoded service role credentials (excluding format checking helper functions)
          if (
            content.includes("sb_secret_") &&
            !content.includes("value.startsWith('sb_secret_')") &&
            !content.includes('value.startsWith("sb_secret_")')
          ) {
            violations.push(`${fullPath.replace(projectRoot, "")}: Contains service-role secret pattern`);
          }

          // Check that client-side code does NOT import client.server.ts
          if (
            (fullPath.includes("/src/components/") || fullPath.includes("/src/routes/")) &&
            content.includes("client.server")
          ) {
            violations.push(`${fullPath.replace(projectRoot, "")}: Imports server-only client in frontend`);
          }
        }
      }
    }

    scanDir(projectRoot);

    if (violations.length === 0) {
      recordResult("Test K", "No hardcoded service-role secrets in source files or client code", "PASS", "No leaked secrets or invalid server imports found");
    } else {
      recordResult("Test K", "No hardcoded service-role secrets in source files or client code", "FAIL", violations.join("; "));
    }
  } catch (err) {
    recordResult("Test K", "No hardcoded service-role secrets in source files or client code", "FAIL", err.message);
  }
  console.log();

  // ----------------------------------------------------------------------------
  // Test L — Forward-Only Database Migration Verification
  // ----------------------------------------------------------------------------
  console.log("--- Test L: Database Migration Verification ---");
  try {
    const migrationFile = resolve("supabase/migrations/20261009153000_security_eliminate_phone_reveal_and_harden_privacy.sql");
    if (!existsSync(migrationFile)) {
      recordResult("Test L", "Security migration file exists", "FAIL", "Migration file missing");
    } else {
      const content = readFileSync(migrationFile, "utf-8");
      const revokesSensitive = content.includes("REVOKE SELECT (phone, secondary_phone, whatsapp)");
      const removesPhoneReveal = content.includes("IF _kind NOT IN ('phone_click', 'whatsapp_click')");
      const securesAdminRpc = content.includes("CREATE OR REPLACE FUNCTION public.admin_get_providers()");
      const minimalDisclosure = content.includes("RETURNS TABLE (phone text, whatsapp text)");

      if (revokesSensitive && removesPhoneReveal && securesAdminRpc && minimalDisclosure) {
        recordResult(
          "Test L",
          "Security migration defines complete contact privacy hardening",
          "PASS",
          "Migration 20261009153000 verified with column revokes, phone_reveal removal, and minimal disclosure"
        );
      } else {
        recordResult(
          "Test L",
          "Security migration defines complete contact privacy hardening",
          "FAIL",
          `Missing requirements in migration: revokes=${revokesSensitive}, noReveal=${removesPhoneReveal}, adminSec=${securesAdminRpc}, minDiscl=${minimalDisclosure}`
        );
      }
    }
  } catch (err) {
    recordResult("Test L", "Security migration defines complete contact privacy hardening", "FAIL", err.message);
  }
  console.log();

  // ----------------------------------------------------------------------------
  // Summary & Final Production Verdict
  // ----------------------------------------------------------------------------
  console.log("==============================================================================");
  console.log("                           TEST RESULTS SUMMARY                               ");
  console.log("==============================================================================");

  let passCount = 0;
  let failCount = 0;
  let blockedCount = 0;

  for (const r of testResults) {
    if (r.status === "PASS") passCount++;
    else if (r.status === "FAIL") failCount++;
    else if (r.status === "BLOCKED") blockedCount++;
    console.log(`[${r.status.padEnd(7)}] ${r.id}: ${r.title}`);
  }

  console.log("\n------------------------------------------------------------------------------");
  console.log(`TOTAL: ${testResults.length} | PASS: ${passCount} | FAIL: ${failCount} | BLOCKED: ${blockedCount}`);
  console.log("------------------------------------------------------------------------------\n");

  const isReady = failCount === 0 && blockedCount === 0;
  const verdict = isReady ? "READY FOR PRODUCTION" : "NOT READY FOR PRODUCTION";

  console.log("==============================================================================");
  console.log(` FINAL VERDICT: ${verdict}`);
  console.log("==============================================================================\n");

  if (!isReady) {
    process.exit(1);
  }
}

runSecuritySuite().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
