import { describe, expect, it } from "vitest";
import { money } from "@/lib/money";
import { classify, rankFollowUps, rankOne, summarise, valueBump, type FollowUpInput } from "./rank";

const NOW = new Date("2026-08-20T09:00:00.000Z");
const daysAgo = (days: number, hours = 0) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000 - hours * 60 * 60 * 1000);

const proposal = (overrides: Partial<FollowUpInput> = {}): FollowUpInput => ({
  proposalId: "p1",
  title: "Local search, twelve months",
  businessId: "b1",
  businessName: "Rivera Plumbing",
  contractValue: money(1_590_000, "CAD"),
  sentAt: daysAgo(3),
  views: 0,
  lastViewedAt: null,
  ...overrides,
});

describe("classifying what a proposal is doing", () => {
  it("leaves something sent this morning alone", () => {
    expect(classify(proposal({ sentAt: daysAgo(0, 2) }), NOW)).toBe("fresh");
    expect(classify(proposal({ sentAt: daysAgo(1) }), NOW)).toBe("fresh");
  });

  it("moves to waiting once a couple of days pass unopened", () => {
    expect(classify(proposal({ sentAt: daysAgo(2) }), NOW)).toBe("waiting");
    expect(classify(proposal({ sentAt: daysAgo(6) }), NOW)).toBe("waiting");
  });

  it("calls a week of silence what it is", () => {
    expect(classify(proposal({ sentAt: daysAgo(7) }), NOW)).toBe("unopened");
    expect(classify(proposal({ sentAt: daysAgo(40) }), NOW)).toBe("unopened");
  });

  it("counts a reader from their last visit, not from the send", () => {
    const old = proposal({ sentAt: daysAgo(30), views: 4, lastViewedAt: daysAgo(0, 3) });
    expect(classify(old, NOW)).toBe("reading");
  });

  it("cools off as the reading recedes", () => {
    expect(classify(proposal({ views: 1, lastViewedAt: daysAgo(1) }), NOW)).toBe("reading");
    expect(classify(proposal({ views: 1, lastViewedAt: daysAgo(2) }), NOW)).toBe("opened");
    expect(classify(proposal({ views: 1, lastViewedAt: daysAgo(6) }), NOW)).toBe("opened");
    expect(classify(proposal({ views: 1, lastViewedAt: daysAgo(7) }), NOW)).toBe("cold");
  });

  it("ignores a view count with no view behind it", () => {
    // Defensive: a count without a timestamp is not evidence anyone read anything.
    expect(classify(proposal({ views: 3, lastViewedAt: null, sentAt: daysAgo(9) }), NOW)).toBe("unopened");
  });
});

describe("value only ever breaks a tie", () => {
  it("grows with the size of the deal, and stops", () => {
    expect(valueBump(money(0, "CAD"))).toBe(0);
    expect(valueBump(money(100, "CAD"))).toBe(2);
    expect(valueBump(money(1_590_000, "CAD"))).toBe(6);
    expect(valueBump(money(999_999_999_999, "CAD"))).toBe(9);
  });

  it("never lifts a silent proposal above a live reader", () => {
    const huge = rankOne(
      proposal({ contractValue: money(50_000_000, "EUR"), views: 1, lastViewedAt: daysAgo(6) }),
      NOW,
    );
    const tiny = rankOne(
      proposal({ contractValue: money(100, "EUR"), views: 1, lastViewedAt: daysAgo(0, 4) }),
      NOW,
    );
    // This is the invariant the capped bump exists to protect.
    expect(tiny.urgency).toBeGreaterThan(huge.urgency);
  });

  it("does break the tie between two proposals in the same state", () => {
    const [first, second] = rankFollowUps(
      [
        proposal({ proposalId: "small", contractValue: money(50_000, "CAD"), sentAt: daysAgo(3) }),
        proposal({ proposalId: "big", contractValue: money(5_000_000, "CAD"), sentAt: daysAgo(3) }),
      ],
      NOW,
    );
    expect(first.proposalId).toBe("big");
    expect(second.proposalId).toBe("small");
  });
});

describe("the queue", () => {
  it("puts the person reading it right now at the top", () => {
    const queue = rankFollowUps(
      [
        proposal({ proposalId: "never-opened", sentAt: daysAgo(20) }),
        proposal({ proposalId: "reading", views: 2, lastViewedAt: daysAgo(0, 1) }),
        proposal({ proposalId: "just-sent", sentAt: daysAgo(0, 1) }),
        proposal({ proposalId: "went-quiet", views: 1, lastViewedAt: daysAgo(11), sentAt: daysAgo(14) }),
      ],
      NOW,
    );

    expect(queue.map((f) => f.proposalId)).toEqual(["reading", "never-opened", "went-quiet", "just-sent"]);
  });

  it("breaks a tie towards whoever has been silent longest", () => {
    const queue = rankFollowUps(
      [
        proposal({ proposalId: "quiet-3", title: "A", sentAt: daysAgo(3) }),
        proposal({ proposalId: "quiet-6", title: "B", sentAt: daysAgo(6) }),
      ],
      NOW,
    );
    expect(queue[0].proposalId).toBe("quiet-6");
  });

  it("says something true and something to do, in words a rep would use", () => {
    const [reading] = rankFollowUps([proposal({ views: 3, lastViewedAt: daysAgo(0, 5) })], NOW);
    expect(reading.because).toBe("Opened 3 times, most recently today.");
    expect(reading.next).toBe("Call now. They have it open.");

    const [unopened] = rankFollowUps([proposal({ sentAt: daysAgo(9) })], NOW);
    expect(unopened.because).toBe("Sent 9 days ago and never opened.");
    expect(unopened.next).toMatch(/never landed/);

    const [once] = rankFollowUps([proposal({ views: 1, lastViewedAt: daysAgo(1) })], NOW);
    expect(once.because).toBe("Opened 1 time, most recently yesterday.");
  });

  it("never reports negative time when a clock is a little ahead", () => {
    const [item] = rankFollowUps([proposal({ sentAt: new Date(NOW.getTime() + 60_000) })], NOW);
    expect(item.daysSinceSent).toBe(0);
    expect(item.silentDays).toBe(0);
    expect(item.because).toBe("Sent today.");
  });

  it("summarises the morning before anyone reads a row", () => {
    const queue = rankFollowUps(
      [
        proposal({ proposalId: "a", views: 1, lastViewedAt: daysAgo(0, 2) }),
        proposal({ proposalId: "b", views: 1, lastViewedAt: daysAgo(4) }),
        proposal({ proposalId: "c", sentAt: daysAgo(30) }),
        proposal({ proposalId: "d", sentAt: daysAgo(0, 3) }),
      ],
      NOW,
    );
    expect(summarise(queue)).toEqual({ total: 4, callNow: 1, chasing: 2 });
  });

  it("is empty when there is nothing to chase", () => {
    expect(rankFollowUps([], NOW)).toEqual([]);
    expect(summarise([])).toEqual({ total: 0, callNow: 0, chasing: 0 });
  });
});
