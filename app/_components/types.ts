export type AttemptStatus =
  | "sent"
  | "already_texted"
  | "invalid_phone"
  | "opted_out"
  | "error"
  | "over_cap";

export type Attempt = {
  name: string;
  phone: string;
  qb_customer_id: string;
  status: AttemptStatus;
  error?: string;
  at: string;
};

export type Run = {
  id: string;
  status: "running" | "completed" | "failed" | "cancelled";
  source: "manual" | "cron";
  started_at: string;
  finished_at: string | null;
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  results?: Attempt[];
  error: string | null;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  qb_customer_id: string;
  texted_at: string | null;
  next_eligible_at: string | null;
  created_at: string;
  last_status: string | null;
  last_error: string | null;
};

export type OptOut = {
  id: string;
  phone: string;
  reason: string;
  created_at: string;
};

export type Settings = {
  isConnected: boolean;
  qbCompanyName: string | null;
  messageTemplate: string;
  defaultTemplate: string;
  automationEnabled: boolean;
  businessTimezone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  lastRunAt: string | null;
  reviewLinkOk: boolean;
  smsNumber: string | null;
  businessName: string | null;
};

export type PreviewResult = {
  daily_cap: number;
  total_found: number;
  eligible: number;
  already_texted: number;
  opted_out: number;
  invalid_phone: number;
  over_cap: number;
  sample_message: string;
};
