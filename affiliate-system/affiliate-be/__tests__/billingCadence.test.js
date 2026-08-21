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

describe("run time does not shift the calendar", () => {
  // The job runs once a day at whatever hour the scheduler wakes it. A stage
  // must land on its real date either way — an earlier version compared
  // elapsed hours and sent "due today" the day before the invoice was due.
  const DUE = new Date("2026-09-01T00:00:00Z");

  it("fires due_today on the due date itself, at any hour", () => {
    for (const hour of ["00:01", "06:00", "12:00", "23:59"]) {
      const now = new Date(`2026-09-01T${hour}:00Z`);
      expect(pickStage(DUE, now).kind).toBe("due_today");
    }
  });

  it("does not call the day before due 'due today'", () => {
    expect(pickStage(DUE, new Date("2026-08-31T12:00:00Z")).kind).toBe("upcoming_1d");
    expect(pickStage(DUE, new Date("2026-08-31T23:59:00Z")).kind).toBe("upcoming_1d");
  });

  it("suspends on day 10 after the due date, not day 9", () => {
    expect(pickStage(DUE, new Date("2026-09-10T12:00:00Z"))).toBeNull();
    expect(pickStage(DUE, new Date("2026-09-11T00:00:00Z")).kind).toBe("suspended");
  });
});
