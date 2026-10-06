import { describe, expect, it } from "vitest";
import { analyzeMarket, selectBestQuotes } from "../src/index.js";
import type { MarketSnapshot } from "../src/index.js";

const now = new Date("2026-10-06T12:00:00.000Z");

function twoWayMarket(): MarketSnapshot {
  return {
    marketId: "match-winner-001",
    event: "North FC vs South FC",
    startsAt: "2026-10-06T18:00:00.000Z",
    outcomes: ["North FC", "South FC"],
    quotes: [
      { bookmaker: "Book A", outcome: "North FC", decimalOdds: 2.2, capturedAt: "2026-10-06T11:59:50.000Z" },
      { bookmaker: "Book A", outcome: "South FC", decimalOdds: 1.74, capturedAt: "2026-10-06T11:59:50.000Z" },
      { bookmaker: "Book B", outcome: "North FC", decimalOdds: 1.82, capturedAt: "2026-10-06T11:59:55.000Z" },
      { bookmaker: "Book B", outcome: "South FC", decimalOdds: 2.15, capturedAt: "2026-10-06T11:59:55.000Z" },
    ],
  };
}

describe("analyzeMarket", () => {
  it("finds the best cross-book combination and equalizes payout", () => {
    const result = analyzeMarket(twoWayMarket(), { bankroll: 1_000, now });

    expect(result.status).toBe("opportunity");
    if (result.status !== "opportunity") return;

    expect(result.allocations.map((item) => item.bookmaker)).toEqual(["Book A", "Book B"]);
    expect(result.totalStake).toBe(1_000);
    expect(result.guaranteedProfit).toBeGreaterThan(87);
    expect(Math.max(...result.allocations.map((item) => item.payout)) - result.guaranteedPayout).toBeLessThan(0.03);
  });

  it("rejects a market when the best implied probability is at least 100%", () => {
    const market = twoWayMarket();
    market.quotes = market.quotes.map((quote) => ({ ...quote, decimalOdds: 1.9 }));

    expect(analyzeMarket(market, { bankroll: 1_000, now })).toMatchObject({
      status: "rejected",
      reason: "no_arbitrage",
    });
  });

  it("fails closed when one outcome is stale", () => {
    const market = twoWayMarket();
    market.quotes = market.quotes.map((quote) =>
      quote.outcome === "South FC" ? { ...quote, capturedAt: "2026-10-06T11:58:00.000Z" } : quote,
    );

    expect(analyzeMarket(market, { bankroll: 1_000, now })).toMatchObject({
      status: "rejected",
      reason: "stale_quotes",
    });
  });

  it("rejects incomplete outcome coverage", () => {
    const market = twoWayMarket();
    market.quotes = market.quotes.filter((quote) => quote.outcome === "North FC");

    expect(analyzeMarket(market, { bankroll: 1_000, now })).toMatchObject({
      status: "rejected",
      reason: "incomplete_market",
    });
  });

  it("rejects malformed decimal odds", () => {
    const market = twoWayMarket();
    const first = market.quotes[0];
    if (!first) throw new Error("Fixture is missing its first quote");
    market.quotes[0] = { ...first, decimalOdds: 1 };

    expect(analyzeMarket(market, { bankroll: 1_000, now })).toMatchObject({
      status: "rejected",
      reason: "invalid_quote",
    });
  });
});

describe("selectBestQuotes", () => {
  it("preserves declared outcome order while choosing the highest fresh price", () => {
    const selected = selectBestQuotes(twoWayMarket(), now, 30_000);
    expect(selected.map((quote) => [quote.outcome, quote.decimalOdds])).toEqual([
      ["North FC", 2.2],
      ["South FC", 2.15],
    ]);
  });
});
