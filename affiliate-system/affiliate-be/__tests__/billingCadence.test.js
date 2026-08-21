"use strict";

// The reminder cadence is the whole point of this job, and it is easy to break
// silently: a window that is off by half a day simply never fires, and nobody
// notices until an operator is suspended without warning.

jest.mock("../utils/mailer", () => ({
  sendBillingUpcoming: jest.fn(),
  sendBillingDueToday: jest.fn(),
  sendBillingPastDueReminder: jest.fn(),
  sendBillingSuspendedNotice: jest.fn(),
}));

const { pickStage } = require("../jobs/billingExpiryJob");

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-08-21T12:00:00Z");
// Positive `daysBefore` = due date is that many days in the future.
const dueIn = (days) => new Date(NOW.getTime() + days * DAY);

describe("pre-due reminders", () => {
  it("fires at 7, 5, 3 and 1 days before, and on the day", () => {
    expect(pickStage(dueIn(7), NOW).kind).toBe("upcoming_7d");
    expect(pickStage(dueIn(5), NOW).kind).toBe("upcoming_5d");
    expect(pickStage(dueIn(3), NOW).kind).toBe("upcoming_3d");
    expect(pickStage(dueIn(1), NOW).kind).toBe("upcoming_1d");
    expect(pickStage(dueIn(0), NOW).kind).toBe("due_today");
  });

  it("stays quiet on days with no reminder", () => {
    for (const d of [6, 4, 2]) expect(pickStage(dueIn(d), NOW)).toBeNull();
  });
});

describe("post-due reminders", () => {
  it("fires at 1, 3, 5 and 7 days after", () => {
    expect(pickStage(dueIn(-1), NOW).kind).toBe("past_due_1d");
    expect(pickStage(dueIn(-3), NOW).kind).toBe("past_due_3d");
    expect(pickStage(dueIn(-5), NOW).kind).toBe("past_due_5d");
    expect(pickStage(dueIn(-7), NOW).kind).toBe("past_due_7d");
  });

  it("counts down to suspension so the email can name the day", () => {
    expect(pickStage(dueIn(-1), NOW).daysUntilSuspension).toBe(9);
    expect(pickStage(dueIn(-7), NOW).daysUntilSuspension).toBe(3);
  });

  it("stays quiet on days with no reminder", () => {
    for (const d of [-2, -4, -6]) expect(pickStage(dueIn(d), NOW)).toBeNull();
  });
});

describe("suspension", () => {
  it("does not suspend before day 10", () => {
    expect(pickStage(dueIn(-9), NOW)).toBeNull();
  });

  it("suspends from day 10 and stays suspended after", () => {
    expect(pickStage(dueIn(-10), NOW).kind).toBe("suspended");
    expect(pickStage(dueIn(-30), NOW).kind).toBe("suspended");
  });

  it("reports how overdue, so the notice is not stuck on a fixed number", () => {
    expect(pickStage(dueIn(-10), NOW).daysOverdue).toBe(10);
    expect(pickStage(dueIn(-30), NOW).daysOverdue).toBe(30);
  });
});

describe("firing window", () => {
  // The job runs daily at an arbitrary hour; each stage must fire once
  // regardless of when in the day that is.
  it("catches a stage from any hour of its day", () => {
    for (const hours of [-11, -6, 0, 6, 11]) {
      const due = new Date(dueIn(7).getTime() + hours * 60 * 60 * 1000);
      expect(pickStage(due, NOW).kind).toBe("upcoming_7d");
    }
  });
});

describe("late interest", () => {
  const { accruedInterestCents } = require("../jobs/billingExpiryJob");

  // The rate is read from the environment at module load, and the default is
  // 0 on purpose: this figure lands on a real invoice, so nothing is charged
  // until an operator picks a rate.
  it("charges nothing by default", () => {
    expect(accruedInterestCents("tier1", 5)).toBe(0);
    expect(accruedInterestCents("pro", 30)).toBe(0);
  });

  it("charges nothing before the due date passes", () => {
    expect(accruedInterestCents("tier1", 0)).toBe(0);
    expect(accruedInterestCents("tier1", -3)).toBe(0);
  });

  it("returns 0 for an unknown plan rather than NaN", () => {
    expect(accruedInterestCents("no-such-plan", 5)).toBe(0);
  });
});
