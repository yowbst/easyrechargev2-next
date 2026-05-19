export type DispatchMode = "off" | "shadow" | "live";

export type PartnerStatus = "active" | "paused";
export type AreaMode = "exclusive" | "shared";
export type Language = "fr" | "de";
export type Environment = "development" | "staging" | "production";

export type DispatchStatus =
  | "dispatched"
  | "skipped_quota"
  | "skipped_no_partner"
  | "skipped_test";

export interface Canton {
  id: string;
  code: string;
  is_active: boolean;
}

export interface Partner {
  id: string;
  status: PartnerStatus;
  name: string;
  slug: string;
  notification_email: string;
  monthly_quota: number;
  priority: number;
  language: Language;
  billable_rate: number;
  environment: Environment;
}

export interface PartnerArea {
  id: string;
  partner: Partner;
  canton: Canton;
  mode: AreaMode;
  priority_override: number | null;
  quota_override: number | null;
}

export interface DispatchContext {
  submissionId: string;
  canton: string;
  locale: Language;
  environment: Environment;
  isTest: boolean;
}

export interface DispatchTarget {
  partnerSlug: string;
  displayName: string;
  email: string;
  language: Language;
  mode: AreaMode;
  billableRate: number;
}

export interface DispatchSummary {
  resolved: number;
  dispatched: number;
  skipped: number;
  reasons: string[];
}

export interface DispatchResult {
  mode: DispatchMode;
  canton: string;
  isTest: boolean;
  billableRate: number | null;
  summary: DispatchSummary;
  targets: DispatchTarget[];
}
