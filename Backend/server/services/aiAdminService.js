import { env } from "../config/env.js";

const ALLOWED_PRIORITIES = new Set(["Low", "Medium", "High", "Critical"]);

function withTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

export async function enrichUserReport(payload) {
  if (!env.AI_ADMIN_ENRICH_URL || !env.AI_ADMIN_KEY) {
    return null;
  }

  const timeoutMs = Number.isFinite(env.AI_ADMIN_TIMEOUT_MS)
    ? Math.max(1000, env.AI_ADMIN_TIMEOUT_MS)
    : 8000;
  const { signal, clear } = withTimeoutSignal(timeoutMs);

  try {
    const response = await fetch(env.AI_ADMIN_ENRICH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ai-admin-key": env.AI_ADMIN_KEY,
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const cleanedDescription = String(data?.cleaned_description || "").trim();
    const priorityCandidate = String(data?.priority || "").trim();
    const priority = ALLOWED_PRIORITIES.has(priorityCandidate)
      ? priorityCandidate
      : null;

    return {
      cleaned_description: cleanedDescription || null,
      priority,
      safe_to_continue:
        typeof data?.safe_to_continue === "boolean" ? data.safe_to_continue : null,
      used_ai: Boolean(data?.used_ai),
      summary: String(data?.summary || "").trim(),
      validation_notes: String(data?.validation_notes || "").trim(),
    };
  } catch {
    return null;
  } finally {
    clear();
  }
}
