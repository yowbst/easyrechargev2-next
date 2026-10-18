import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/directus", () => ({ directusFetch: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

import { DEFAULT_REMINDER_RULES, reminderKey, selectDueReminders } from "./reminders";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 18, 7);
const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const lead = (id: string, stage: string, daysAgo: number, disqualified: boolean | null = null) => ({
  id,
  stage,
  stage_entered_at: at(daysAgo),
  disqualified,
});

describe("selectDueReminders", () => {
  const rules = DEFAULT_REMINDER_RULES;

  it("sends nothing before the first rule is due", () => {
    expect(selectDueReminders([lead("a", "new", 1)], rules, new Set(), NOW)).toEqual([]);
  });

  it("picks the rule that has fallen due", () => {
    const [r] = selectDueReminders([lead("a", "new", 2)], rules, new Set(), NOW);
    expect(r.rule.key).toBe("new_d2");
    expect(r.daysInStage).toBe(2);
  });

  it("picks only the most advanced due rule, never two at once", () => {
    // A wide grace keeps new_d2 due too; only new_d5 goes out.
    const out = selectDueReminders([lead("a", "new", 6)], rules, new Set(), NOW, 10);
    expect(out.map((o) => o.rule.key)).toEqual(["new_d5"]);
  });

  it("leaves a lead alone once the last rule's grace has passed (no backlog mailing)", () => {
    expect(selectDueReminders([lead("a", "new", 8)], rules, new Set(), NOW)).toEqual([]);
    expect(selectDueReminders([lead("b", "new", 98)], rules, new Set(), NOW)).toEqual([]);
  });

  it("still sends within the grace after a missed run (weekend)", () => {
    const out = selectDueReminders([lead("a", "new", 7.5)], rules, new Set(), NOW);
    expect(out.map((o) => o.rule.key)).toEqual(["new_d5"]);
  });

  it("does not resend a rule already logged for this stay at the stage", () => {
    const l = lead("a", "new", 3);
    const sent = new Set([reminderKey("a", "new_d2", l.stage_entered_at)]);
    expect(selectDueReminders([l], rules, sent, NOW)).toEqual([]);
  });

  it("does not catch up an earlier rule once a later one was sent", () => {
    const l = lead("a", "new", 6);
    const sent = new Set([reminderKey("a", "new_d5", l.stage_entered_at)]);
    expect(selectDueReminders([l], rules, sent, NOW)).toEqual([]);
  });

  it("reminds again after the lead re-enters the stage", () => {
    const old = lead("a", "contacted", 30);
    const sent = new Set([reminderKey("a", "contacted_d7", old.stage_entered_at)]);
    const reopened = lead("a", "contacted", 8);
    expect(selectDueReminders([reopened], rules, sent, NOW).map((o) => o.rule.key)).toEqual(["contacted_d7"]);
  });

  it("matches the log whatever the timestamp format", () => {
    const l = lead("a", "new", 3);
    const sent = new Set([reminderKey("a", "new_d2", l.stage_entered_at.replace(".000Z", "Z"))]);
    expect(selectDueReminders([l], rules, sent, NOW)).toEqual([]);
  });

  it("reads Directus zone-less timestamps as UTC", () => {
    const l = lead("a", "new", 2);
    const zoneless = { ...l, stage_entered_at: l.stage_entered_at.replace(".000Z", "") };
    expect(selectDueReminders([zoneless], rules, new Set(), NOW).map((o) => o.rule.key)).toEqual(["new_d2"]);
    const sent = new Set([reminderKey("a", "new_d2", l.stage_entered_at)]);
    expect(selectDueReminders([zoneless], rules, sent, NOW)).toEqual([]);
  });

  it("skips disqualified and closed leads", () => {
    const out = selectDueReminders(
      [lead("a", "new", 9, true), lead("b", "won", 90), lead("c", "lost", 90)],
      rules,
      new Set(),
      NOW,
    );
    expect(out).toEqual([]);
  });
});
