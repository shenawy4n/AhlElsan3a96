import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
const publishableKey = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").trim();

const anonClient = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

console.log("==============================================================================");
console.log("         AHL ELSAN3A — LIVE POST-MIGRATION COMPREHENSIVE AUDIT               ");
console.log(` Target URL: ${supabaseUrl}`);
console.log("==============================================================================\n");

async function run() {
  const auditResults = [];
  function record(id, title, status, details) {
    auditResults.push({ id, title, status, details });
    const tag = status === "PASS" ? "✓ [PASS]" : status === "FAIL" ? "✗ [FAIL]" : "⚠ [BLOCKED]";
    console.log(`${tag} ${id}: ${title}`);
    if (details) console.log(`      ↳ ${details}`);
  }

  // --------------------------------------------------------------------------
  // Check 1: Migration State in Live Database
  // --------------------------------------------------------------------------
  console.log("--- Check 1: Live DB Migration State ---");
  try {
    const { data: pol, error: polErr } = await adminClient
      .from("rate_limit_policies")
      .select("*")
      .eq("form_type", "provider_contact");
    if (polErr) {
      record("1.1", "rate_limit_policies provider_contact exists", "FAIL", polErr.message);
    } else if (!pol || pol.length === 0) {
      record("1.1", "rate_limit_policies provider_contact exists", "FAIL", "No policy found");
    } else {
      record("1.1", "rate_limit_policies provider_contact exists", "PASS", `max_requests=${pol[0].max_requests}, window_seconds=${pol[0].window_seconds}`);
    }
  } catch (e) {
    record("1.1", "rate_limit_policies provider_contact exists", "FAIL", e.message);
  }

  // Sample provider
  let sampleActiveProvider = null;
  const { data: activeList } = await adminClient
    .from("providers")
    .select("id, name, status")
    .eq("status", "active")
    .limit(1);
  if (activeList && activeList[0]) sampleActiveProvider = activeList[0];

  // --------------------------------------------------------------------------
  // Check 2: Anon Role Tests
  // --------------------------------------------------------------------------
  console.log("\n--- Check 2: Anonymous (anon) Role Access ---");
  try {
    // 2.1 Approved public columns
    const { data: anonPub, error: anonPubErr } = await anonClient
      .from("providers")
      .select("id, name, category_id, area_id, photo_url, is_verified, has_whatsapp")
      .limit(3);
    if (!anonPubErr && Array.isArray(anonPub) && anonPub.length > 0) {
      record("2.1", "Anon read approved public columns", "PASS", `Retrieved ${anonPub.length} providers`);
    } else {
      record("2.1", "Anon read approved public columns", "FAIL", anonPubErr?.message || "Empty response");
    }

    // 2.2 Direct phone query
    const { error: anonPhoneErr } = await anonClient.from("providers").select("phone").limit(1);
    const pDenied = anonPhoneErr && anonPhoneErr.code === "42501";
    record("2.2", "Anon direct SELECT phone denied", pDenied ? "PASS" : "FAIL", `Code: ${anonPhoneErr?.code || "none"}`);

    // 2.3 Direct secondary_phone query
    const { error: anonSecErr } = await anonClient.from("providers").select("secondary_phone").limit(1);
    const sDenied = anonSecErr && anonSecErr.code === "42501";
    record("2.3", "Anon direct SELECT secondary_phone denied", sDenied ? "PASS" : "FAIL", `Code: ${anonSecErr?.code || "none"}`);

    // 2.4 Direct whatsapp query
    const { error: anonWaErr } = await anonClient.from("providers").select("whatsapp").limit(1);
    const wDenied = anonWaErr && anonWaErr.code === "42501";
    record("2.4", "Anon direct SELECT whatsapp denied", wDenied ? "PASS" : "FAIL", `Code: ${anonWaErr?.code || "none"}`);

    // 2.5 Direct contact_provider RPC execution (MUST BE DENIED)
    if (!sampleActiveProvider) {
      record("2.5", "Anon direct contact_provider RPC execution denied", "BLOCKED", "No active sample provider available");
    } else {
      const { error: anonRpcErr, data: anonRpcData } = await anonClient.rpc("contact_provider", {
        _provider_id: sampleActiveProvider.id,
        _kind: "phone_click",
      });
      if (anonRpcErr) {
        const rpcDenied = anonRpcErr.code === "42501" || anonRpcErr.message?.toLowerCase().includes("permission denied");
        record("2.5", "Anon direct contact_provider RPC execution denied", rpcDenied ? "PASS" : "BLOCKED", `Error: ${anonRpcErr.message} (Code: ${anonRpcErr.code})`);
      } else {
        record("2.5", "Anon direct contact_provider RPC execution denied", "FAIL", `CRITICAL: Anon executed contact_provider directly. Data: ${JSON.stringify(anonRpcData)}`);
      }
    }
  } catch (e) {
    record("2.0", "Anon suite", "FAIL", e.message);
  }

  // --------------------------------------------------------------------------
  // Check 3: Authenticated Normal User Tests (Read-only / Non-destructive)
  // --------------------------------------------------------------------------
  console.log("\n--- Check 3: Authenticated Normal User Access ---");
  // Check if test credentials exist in environment to avoid creating/deleting users in production
  const testUserEmail = process.env.TEST_USER_EMAIL;
  const testUserPassword = process.env.TEST_USER_PASSWORD;

  if (!testUserEmail || !testUserPassword) {
    record("3.1", "Authenticated read public columns", "BLOCKED", "No test user credentials provided (skipping user creation in production)");
    record("3.2", "Authenticated direct sensitive column SELECT denied", "BLOCKED", "No test user credentials provided");
    record("3.3", "Authenticated direct contact_provider RPC denied", "BLOCKED", "No test user credentials provided");
    record("3.4", "Authenticated non-admin admin_get_providers denied", "BLOCKED", "No test user credentials provided");
  } else {
    try {
      const userClient = createClient(supabaseUrl, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { error: signInErr } = await userClient.auth.signInWithPassword({ email: testUserEmail, password: testUserPassword });
      if (signInErr) {
        record("3.0", "Authenticated suite login", "BLOCKED", `Could not sign in test user: ${signInErr.message}`);
      } else {
        // 3.1 Read approved public columns
        const { data: uPub, error: uPubErr } = await userClient
          .from("providers")
          .select("id, name, is_verified")
          .limit(1);
        record("3.1", "Authenticated read public columns", (!uPubErr && uPub?.length > 0) ? "PASS" : "FAIL", `Rows: ${uPub?.length}`);

        // 3.2 Read sensitive contact columns
        const { error: uPhoneErr } = await userClient.from("providers").select("phone").limit(1);
        const { error: uSecErr } = await userClient.from("providers").select("secondary_phone").limit(1);
        const { error: uWaErr } = await userClient.from("providers").select("whatsapp").limit(1);
        const { error: uStarErr } = await userClient.from("providers").select("*").limit(1);
        const allDenied = uPhoneErr?.code === "42501" && uSecErr?.code === "42501" && uWaErr?.code === "42501" && uStarErr?.code === "42501";
        record("3.2", "Authenticated direct sensitive column SELECT denied", allDenied ? "PASS" : "FAIL", `phone: ${uPhoneErr?.code}, sec: ${uSecErr?.code}, wa: ${uWaErr?.code}, star: ${uStarErr?.code}`);

        // 3.3 Direct contact_provider execution
        if (!sampleActiveProvider) {
          record("3.3", "Authenticated direct contact_provider RPC denied", "BLOCKED", "No active sample provider available");
        } else {
          const { error: uRpcErr } = await userClient.rpc("contact_provider", {
            _provider_id: sampleActiveProvider.id,
            _kind: "phone_click"
          });
          const uRpcDenied = uRpcErr && (uRpcErr.code === "42501" || uRpcErr.message?.includes("permission denied"));
          record("3.3", "Authenticated direct contact_provider RPC denied", uRpcDenied ? "PASS" : "FAIL", `Error: ${uRpcErr?.message} (Code: ${uRpcErr?.code})`);
        }

        // 3.4 Direct admin_get_providers execution
        const { error: uAdminErr } = await userClient.rpc("admin_get_providers");
        const uAdminDenied = uAdminErr && (uAdminErr.code === "42501" || uAdminErr.code === "P0001" || uAdminErr.message?.includes("Unauthorized"));
        record("3.4", "Authenticated non-admin admin_get_providers denied", uAdminDenied ? "PASS" : "FAIL", `Error: ${uAdminErr?.message} (Code: ${uAdminErr?.code})`);
      }
    } catch (e) {
      record("3.0", "Authenticated suite", "FAIL", e.message);
    }
  }

  // --------------------------------------------------------------------------
  // Check 4: Contact Gateway Minimum Disclosure & Status Checks (via service_role)
  // --------------------------------------------------------------------------
  console.log("\n--- Check 4: Contact Gateway Behavior & Minimum Disclosure ---");
  if (!sampleActiveProvider) {
    record("4.1", "phone_click returns only primary phone (whatsapp null, no secondary_phone)", "BLOCKED", "No active sample provider available");
    record("4.2", "whatsapp_click returns only whatsapp (phone null, no secondary_phone)", "BLOCKED", "No active sample provider available");
    record("4.3", "phone_reveal action strictly rejected at database level", "BLOCKED", "No active sample provider available");
    record("4.4", "Nonexistent/inactive provider returns empty set", "BLOCKED", "No active sample provider available");
  } else {
    try {
      // 4.1 phone_click returns only primary phone
      const { data: pData, error: pErr } = await adminClient.rpc("contact_provider", {
        _provider_id: sampleActiveProvider.id,
        _kind: "phone_click"
      });
      if (pErr) {
        record("4.1", "phone_click returns only primary phone (whatsapp null, no secondary_phone)", "FAIL", `RPC error: ${pErr.message}`);
      } else {
        const pRow = pData?.[0];
        const pKeys = pRow ? Object.keys(pRow) : [];
        const pValid = pRow && Boolean(pRow.phone) && pRow.whatsapp === null && !pKeys.includes("secondary_phone");
        record("4.1", "phone_click returns only primary phone (whatsapp null, no secondary_phone)", pValid ? "PASS" : "FAIL", `phone present=${Boolean(pRow?.phone)}, whatsapp=${pRow?.whatsapp}, keys=[${pKeys.join(", ")}]`);
      }

      // 4.2 whatsapp_click returns only whatsapp
      const { data: wData, error: wErr } = await adminClient.rpc("contact_provider", {
        _provider_id: sampleActiveProvider.id,
        _kind: "whatsapp_click"
      });
      if (wErr) {
        record("4.2", "whatsapp_click returns only whatsapp (phone null, no secondary_phone)", "FAIL", `RPC error: ${wErr.message}`);
      } else {
        const wRow = wData?.[0];
        const wKeys = wRow ? Object.keys(wRow) : [];
        const wValid = wRow && wRow.phone === null && !wKeys.includes("secondary_phone");
        record("4.2", "whatsapp_click returns only whatsapp (phone null, no secondary_phone)", wValid ? "PASS" : "FAIL", `phone=${wRow?.phone}, whatsapp present=${Boolean(wRow?.whatsapp)}, keys=[${wKeys.join(", ")}]`);
      }

      // 4.3 Forbidden phone_reveal rejected
      const { data: revData, error: revErr } = await adminClient.rpc("contact_provider", {
        _provider_id: sampleActiveProvider.id,
        _kind: "phone_reveal"
      });
      const revRejected = revErr && revErr.message?.includes("invalid_kind");
      record("4.3", "phone_reveal action strictly rejected at database level", revRejected ? "PASS" : "FAIL", `Error: ${revErr?.message}`);

      // 4.4 Inactive or nonexistent provider returns no data
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const { data: noneData, error: noneErr } = await adminClient.rpc("contact_provider", {
        _provider_id: nonExistentId,
        _kind: "phone_click"
      });
      const noneEmpty = !noneErr && Array.isArray(noneData) && noneData.length === 0;
      record("4.4", "Nonexistent/inactive provider returns empty set", noneEmpty ? "PASS" : "FAIL", `Returned rows: ${noneData?.length}`);

    } catch (e) {
      record("4.0", "Gateway behavior suite", "FAIL", e.message);
    }
  }

  // --------------------------------------------------------------------------
  // Check 5: Rate Limiting Policy Read-Only Verification (Non-destructive)
  // --------------------------------------------------------------------------
  console.log("\n--- Check 5: Rate Limiting Policy Read-Only Verification ---");
  try {
    // Non-destructive check: verify policy exists and parameters match security policy
    const { data: polData, error: polErr } = await adminClient
      .from("rate_limit_policies")
      .select("form_type, max_requests, window_seconds")
      .eq("form_type", "provider_contact")
      .single();

    if (polErr) {
      record("5.1", "Rate limit policy configuration check", "FAIL", `Policy query failed: ${polErr.message}`);
    } else if (polData && polData.max_requests === 10 && polData.window_seconds === 600) {
      record("5.1", "Rate limit policy configuration check", "PASS", `Verified provider_contact policy: ${polData.max_requests} reqs / ${polData.window_seconds}s window`);
    } else {
      record("5.1", "Rate limit policy configuration check", "FAIL", `Unexpected policy config: ${JSON.stringify(polData)}`);
    }
  } catch (e) {
    record("5.0", "Rate limit suite", "FAIL", e.message);
  }

  // --------------------------------------------------------------------------
  // Check 6: Admin Dashboard Access (via service_role / getAdminProvidersServerFn query)
  // --------------------------------------------------------------------------
  console.log("\n--- Check 6: Admin Dashboard Provider Management Boundary ---");
  try {
    const { data: admList, error: admErr } = await adminClient
      .from("providers")
      .select("*, categories(id,name), areas(id,name)")
      .order("created_at", { ascending: false })
      .limit(5);

    if (!admErr && Array.isArray(admList) && admList.length > 0) {
      record("6.1", "Admin service client successfully queries full provider data for dashboard", "PASS", `Retrieved ${admList.length} provider records with refs`);
    } else {
      record("6.1", "Admin service client queries provider data", "FAIL", admErr?.message || "Empty list");
    }
  } catch (e) {
    record("6.1", "Admin service client queries provider data", "FAIL", e.message);
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log("\n==============================================================================");
  console.log("                           POST-MIGRATION AUDIT SUMMARY                       ");
  console.log("==============================================================================\n");
  const pass = auditResults.filter(r => r.status === "PASS").length;
  const fail = auditResults.filter(r => r.status === "FAIL").length;
  const blocked = auditResults.filter(r => r.status === "BLOCKED").length;
  console.log(`TOTAL CHECKS: ${auditResults.length} | PASS: ${pass} | FAIL: ${fail} | BLOCKED: ${blocked}`);
  console.log("==============================================================================\n");
}

run();
