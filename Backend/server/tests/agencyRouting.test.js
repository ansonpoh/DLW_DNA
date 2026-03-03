import test from "node:test";
import assert from "node:assert/strict";
import { buildAgencyDispatch, routeAgencyForReport } from "../services/agencyRoutingService.js";

test("routes fire reports to SCDF", () => {
  const agency = routeAgencyForReport({
    type: "Fire/Smoke",
    description: "Heavy smoke and flames seen from apartment unit.",
  });
  assert.equal(agency, "SCDF");
});

test("builds structured and readable dispatch output", () => {
  const dispatch = buildAgencyDispatch(
    {
      report_id: "ea6c0fd3-cbb0-4e9b-a96a-964f748f63ba",
      type: "Accident/Traffic",
      description: "Crash with blocked lane.",
      happening_now: true,
      safe_to_continue: false,
      location_label: "Main junction",
      location_source: "telegram_location",
      latitude: 1.31,
      longitude: 103.81,
      priority: "High",
      status: "submitted",
      created_at: "2026-03-02T00:00:00.000Z",
    },
    {
      summary: "Likely active traffic incident.",
      reassurance_message: "Emergency teams advised.",
      next_steps: ["Move to safety", "Call emergency services"],
      validation_notes: "Keyword triage",
    },
  );

  assert.equal(dispatch.agency, "LTA_SPF");
  assert.equal(dispatch.payload_json.report.report_id, "ea6c0fd3-cbb0-4e9b-a96a-964f748f63ba");
  assert.match(dispatch.readable_summary, /Agency: LTA_SPF/);
  assert.match(dispatch.readable_summary, /Type: Accident\/Traffic/);
});

test("routes sexual assault reports to SPF", () => {
  const agency = routeAgencyForReport({
    type: "Violence/Assault",
    description: "I am being raped and need immediate help.",
  });
  assert.equal(agency, "SPF");
});
