import { supabaseAdmin } from "./supabase";

// SMS copy for review requests. The template is editable per shop from the
// dashboard (stored in settings.message_template); env vars supply branding.
//
// Supported placeholders: {first_name}, {business_name}, {review_link}

export const DEFAULT_TEMPLATE =
  "Hi {first_name}! This is {business_name}. We hope your visit went well! " +
  "We'd really appreciate it if you could leave us a quick review — it helps us out a lot. {review_link}";

// A2P 10DLC compliance: every outbound message must include opt-out language.
export const OPT_OUT_SUFFIX = "Reply STOP to opt out.";

// Two GSM-7 segments. Keeps cost predictable and copy focused.
export const MAX_TEMPLATE_LENGTH = 320;

export interface MessageVars {
  firstName: string;
  businessName: string;
  reviewLink: string;
}

export function renderMessage(template: string, vars: MessageVars): string {
  const body = template
    .replaceAll("{first_name}", vars.firstName)
    .replaceAll("{business_name}", vars.businessName)
    .replaceAll("{review_link}", vars.reviewLink)
    .trim();

  // Never send without opt-out language, whatever the template says.
  if (body.toUpperCase().includes("STOP")) return body;
  return `${body} ${OPT_OUT_SUFFIX}`;
}

export type TemplateValidation = { ok: true } | { ok: false; error: string };

export function validateTemplate(template: string): TemplateValidation {
  const trimmed = template.trim();
  if (!trimmed) {
    return { ok: false, error: "Template cannot be empty." };
  }
  if (trimmed.length > MAX_TEMPLATE_LENGTH) {
    return {
      ok: false,
      error: `Template is too long (${trimmed.length} chars, max ${MAX_TEMPLATE_LENGTH}).`,
    };
  }
  if (!trimmed.includes("{review_link}")) {
    return {
      ok: false,
      error: "Template must include the {review_link} placeholder.",
    };
  }
  return { ok: true };
}

// Stored template, or the default when unset/blank.
export async function getMessageTemplate(): Promise<string> {
  const { data } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", "message_template")
    .maybeSingle();
  const stored = data?.value?.trim();
  return stored || DEFAULT_TEMPLATE;
}
