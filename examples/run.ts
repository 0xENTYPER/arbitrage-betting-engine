import { analyzeMarket } from "../src/index.js";
import type { MarketSnapshot } from "../src/index.js";

const snapshot: MarketSnapshot = {
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

console.log(
  JSON.stringify(
    analyzeMarket(snapshot, {
      bankroll: 1_000,
      now: new Date("2026-10-06T12:00:00.000Z"),
    }),
    null,
    2,
  ),
);
