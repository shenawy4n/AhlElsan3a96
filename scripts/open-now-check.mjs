import assert from "node:assert/strict";
import { isOpenNow, hasWorkingHoursSet, getCairoNow } from "../src/lib/working-hours.ts";

console.log("=================================================================");
console.log("             RUNNING UNIT TESTS FOR isOpenNow                    ");
console.log("=================================================================\n");

let passed = 0;
let total = 0;

function test(description, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✓ [PASS] ${description}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${description}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Helper: Cairo ISO timestamp builder for reliable time mock
// Cairo in January is UTC+2, Cairo in July is UTC+3 (DST)
const satDaytimeCairo = "2026-01-10T10:00:00+02:00"; // Saturday 10:00 AM Cairo
const satLateNightCairo = "2026-01-10T23:00:00+02:00"; // Saturday 11:00 PM Cairo
const sunEarlyMorningCairo = "2026-01-11T01:30:00+02:00"; // Sunday 01:30 AM Cairo
const sunMorningCairo = "2026-01-11T10:00:00+02:00"; // Sunday 10:00 AM Cairo

const regularSchedule = JSON.stringify({
  timezone: "Africa/Cairo",
  isEmergency24h: false,
  schedule: [
    { dayKey: "sat", isOpen: true, openTime: "09:00", closeTime: "17:00" },
    { dayKey: "sun", isOpen: false, openTime: "09:00", closeTime: "17:00" },
    { dayKey: "mon", isOpen: true, openTime: "09:00", closeTime: "17:00" },
  ],
});

const overnightSchedule = JSON.stringify({
  timezone: "Africa/Cairo",
  isEmergency24h: false,
  schedule: [
    { dayKey: "sat", isOpen: true, openTime: "18:00", closeTime: "02:00" },
    { dayKey: "sun", isOpen: false, openTime: "09:00", closeTime: "17:00" },
  ],
});

const emergency24hSchedule = JSON.stringify({
  timezone: "Africa/Cairo",
  isEmergency24h: true,
  schedule: [],
});

// 1. OPEN test
test("open: provider open during regular schedule hours", () => {
  const result = isOpenNow(regularSchedule, satDaytimeCairo);
  assert.equal(result, true, "Expected to be open at Saturday 10:00 AM");
});

// 2. CLOSED test
test("closed: provider closed outside regular hours", () => {
  const resultLate = isOpenNow(regularSchedule, satLateNightCairo);
  assert.equal(resultLate, false, "Expected to be closed at Saturday 11:00 PM");

  const resultOffDay = isOpenNow(regularSchedule, sunMorningCairo);
  assert.equal(resultOffDay, false, "Expected to be closed on Sunday (isOpen: false)");
});

// 3. OVERNIGHT tests
test("overnight: open before midnight during overnight range (18:00 - 02:00)", () => {
  const result = isOpenNow(overnightSchedule, satLateNightCairo);
  assert.equal(result, true, "Expected open at Saturday 23:00 for 18:00-02:00 shift");
});

test("overnight: open after midnight (tail belonging to previous day's shift)", () => {
  // Sunday 01:30 AM is within Saturday's 18:00-02:00 overnight window
  const result = isOpenNow(overnightSchedule, sunEarlyMorningCairo);
  assert.equal(result, true, "Expected open at Sunday 01:30 AM from Saturday night shift");
});

test("overnight: closed after overnight window expires", () => {
  // Sunday 03:00 AM is after 02:00 closing time
  const sunLateOvernight = "2026-01-11T03:00:00+02:00";
  const result = isOpenNow(overnightSchedule, sunLateOvernight);
  assert.equal(result, false, "Expected closed at Sunday 03:00 AM after shift ends");
});

// 4. 24H Emergency tests
test("24h: isEmergency24h is always open at any time", () => {
  assert.equal(isOpenNow(emergency24hSchedule, satDaytimeCairo), true);
  assert.equal(isOpenNow(emergency24hSchedule, satLateNightCairo), true);
  assert.equal(isOpenNow(emergency24hSchedule, sunEarlyMorningCairo), true);
});

// 5. INVALID JSON / NULL tests (never throws)
test("invalid JSON: handles null, undefined, malformed JSON safely without throwing", () => {
  assert.equal(isOpenNow(null), null);
  assert.equal(isOpenNow(undefined), null);
  assert.equal(isOpenNow(""), null);
  assert.equal(isOpenNow("   "), null);
  assert.equal(isOpenNow("not valid json"), null);
  assert.equal(isOpenNow("{ broken json"), null);
  assert.equal(isOpenNow("{}"), null);
});

// 6. DST EDGE test (Egypt DST in summer UTC+3 vs winter UTC+2)
test("DST edge: Africa/Cairo handles DST clock changes accurately", () => {
  // Summer: 2026-07-15 07:00 UTC = 10:00 Cairo (UTC+3)
  const summerUtc = "2026-07-15T07:00:00Z";
  const summerCairo = getCairoNow(summerUtc);
  assert.equal(summerCairo.hours, 10, "Summer Cairo time should be UTC+3 (10:00)");

  // Winter: 2026-01-15 08:00 UTC = 10:00 Cairo (UTC+2)
  const winterUtc = "2026-01-15T08:00:00Z";
  const winterCairo = getCairoNow(winterUtc);
  assert.equal(winterCairo.hours, 10, "Winter Cairo time should be UTC+2 (10:00)");

  const wedSchedule = JSON.stringify({
    timezone: "Africa/Cairo",
    isEmergency24h: false,
    schedule: [{ dayKey: "wed", isOpen: true, openTime: "09:00", closeTime: "17:00" }],
  });

  // July 15, 2026 is Wednesday
  assert.equal(isOpenNow(wedSchedule, summerUtc), true, "Open during Cairo summer DST 10:00 AM");
  // 15:00 UTC = 18:00 Cairo (closed after 17:00)
  assert.equal(isOpenNow(wedSchedule, "2026-07-15T15:00:00Z"), false, "Closed after 17:00 Cairo summer");
});

console.log(`\nResults: ${passed}/${total} unit tests passed.`);
if (passed === total) {
  console.log("SUCCESS: All availability logic tests passed perfectly!\n");
} else {
  process.exit(1);
}
