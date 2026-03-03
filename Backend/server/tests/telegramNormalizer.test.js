import test from "node:test";
import assert from "node:assert/strict";
import {
  detectTelegramMessageType,
  normalizeTelegramUpdate,
} from "../services/telegramService.js";

test("detects text message type", () => {
  const message = { text: "There is smoke near block 10" };
  assert.equal(detectTelegramMessageType(message), "text");
});

test("normalizes text update into report draft", async () => {
  const update = {
    update_id: 1,
    message: {
      text: "There is a traffic accident at junction",
      chat: { id: 101 },
      from: { id: 501, first_name: "Alex" },
    },
  };

  const normalized = await normalizeTelegramUpdate(update, {
    geocodeLocation: async () => ({
      lat: 1.3001,
      lng: 103.845,
      display_name: "Junction, Singapore",
    }),
  });
  assert.equal(normalized.ignored, false);
  assert.equal(normalized.messageType, "text");
  assert.equal(normalized.reportDraft.type, "Accident/Traffic");
  assert.equal(normalized.reportDraft.location_source, "telegram_text_geocoded");
});

test("normalizes voice update using transcription dependency", async () => {
  const update = {
    update_id: 2,
    message: {
      voice: { file_id: "voice-file-1" },
      chat: { id: 102 },
      from: { id: 502, first_name: "Sam" },
    },
  };

  const normalized = await normalizeTelegramUpdate(update, {
    getFilePath: async () => "voice/file/path.ogg",
    downloadFile: async () => Buffer.from("ogg"),
    transcribeVoice: async () => "Large fire with smoke near warehouse.",
    geocodeLocation: async () => {
      throw new Error("skip geocode");
    },
  });

  assert.equal(normalized.ignored, false);
  assert.equal(normalized.messageType, "voice");
  assert.equal(normalized.reportDraft.type, "Fire/Smoke");
  assert.equal(normalized.reportDraft.location_source, "telegram_voice_extracted");
});

test("normalizes location update", async () => {
  const update = {
    update_id: 3,
    message: {
      location: { latitude: 1.3, longitude: 103.8 },
      chat: { id: 103 },
      from: { id: 503, first_name: "Lee" },
    },
  };

  const normalized = await normalizeTelegramUpdate(update, {
    geocodeLocation: async () => ({
      lat: 1.436,
      lng: 103.786,
      display_name: "Woodlands, Singapore",
    }),
  });
  assert.equal(normalized.ignored, false);
  assert.equal(normalized.messageType, "location");
  assert.equal(normalized.reportDraft.location_source, "telegram_location");
  assert.equal(normalized.reportDraft.latitude, 1.3);
  assert.equal(normalized.reportDraft.longitude, 103.8);
});

test("classifies sexual assault text as violence with critical priority", async () => {
  const update = {
    update_id: 4,
    message: {
      text: "I am being raped at woodlands help me",
      chat: { id: 104 },
      from: { id: 504, first_name: "Pat" },
    },
  };

  const normalized = await normalizeTelegramUpdate(update);
  assert.equal(normalized.ignored, false);
  assert.equal(normalized.reportDraft.type, "Violence/Assault");
  assert.equal(normalized.reportDraft.priority, "Critical");
});

test("extracts and geocodes location phrase from text narrative", async () => {
  const update = {
    update_id: 5,
    message: {
      text: "I am being raped at woodlands help me",
      chat: { id: 105 },
      from: { id: 505, first_name: "Kim" },
    },
  };

  const normalized = await normalizeTelegramUpdate(update, {
    geocodeLocation: async (payload) => ({
      lat: 1.436,
      lng: 103.786,
      display_name: `${payload.query} (Woodlands, North Region, Singapore)`,
    }),
  });

  assert.equal(normalized.ignored, false);
  assert.equal(
    normalized.reportDraft.location_label,
    "woodlands (Woodlands, North Region, Singapore)",
  );
  assert.equal(normalized.reportDraft.latitude, 1.436);
  assert.equal(normalized.reportDraft.longitude, 103.786);
  assert.equal(normalized.reportDraft.location_source, "telegram_text_geocoded");
});
