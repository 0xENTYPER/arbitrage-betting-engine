import type {
  AnalysisOptions,
  AnalysisResult,
  ArbitrageOpportunity,
  MarketQuote,
  MarketSnapshot,
  RejectedMarket,
  StakeAllocation,
} from "./types.js";

const DEFAULT_MAX_QUOTE_AGE_MS = 30_000;
const DEFAULT_CURRENCY_STEP = 0.01;

function reject(marketId: string, reason: RejectedMarket["reason"], details: string): RejectedMarket {
  return { status: "rejected", marketId, reason, details };
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

function isValidQuote(quote: MarketQuote): boolean {
  return (
    quote.bookmaker.trim().length > 0 &&
    quote.outcome.trim().length > 0 &&
    Number.isFinite(quote.decimalOdds) &&
    quote.decimalOdds > 1 &&
    Number.isFinite(Date.parse(quote.capturedAt))
  );
}

export function selectBestQuotes(snapshot: MarketSnapshot, now: Date, maxQuoteAgeMs: number): MarketQuote[] {
  const expected = new Set(snapshot.outcomes);
  const best = new Map<string, MarketQuote>();

  for (const quote of snapshot.quotes) {
    if (!expected.has(quote.outcome) || now.getTime() - Date.parse(quote.capturedAt) > maxQuoteAgeMs) {
      continue;
    }

    const current = best.get(quote.outcome);
    if (!current || quote.decimalOdds > current.decimalOdds) {
      best.set(quote.outcome, quote);
    }
  }

  return snapshot.outcomes.flatMap((outcome) => {
    const quote = best.get(outcome);
    return quote ? [quote] : [];
  });
}

function allocateBankroll(quotes: MarketQuote[], bankroll: number, currencyStep: number): StakeAllocation[] {
  const inverseTotal = quotes.reduce((sum, quote) => sum + 1 / quote.decimalOdds, 0);
  const units = Math.round(bankroll / currencyStep);
  const stakes = quotes.map((quote) =>
    Math.floor((bankroll * (1 / quote.decimalOdds)) / inverseTotal / currencyStep),
  );
  let remainingUnits = units - stakes.reduce((sum, stake) => sum + stake, 0);

  while (remainingUnits > 0) {
    let lowestPayoutIndex = 0;
    for (let index = 1; index < quotes.length; index += 1) {
      const currentPayout = (stakes[index] ?? 0) * currencyStep * (quotes[index]?.decimalOdds ?? 0);
      const lowestPayout =
        (stakes[lowestPayoutIndex] ?? 0) * currencyStep * (quotes[lowestPayoutIndex]?.decimalOdds ?? 0);
      if (currentPayout < lowestPayout) lowestPayoutIndex = index;
    }
    stakes[lowestPayoutIndex] = (stakes[lowestPayoutIndex] ?? 0) + 1;
    remainingUnits -= 1;
  }

  return quotes.map((quote, index) => {
    const stake = (stakes[index] ?? 0) * currencyStep;
    return {
      bookmaker: quote.bookmaker,
      outcome: quote.outcome,
      decimalOdds: quote.decimalOdds,
      stake: roundCurrency(stake),
      payout: roundCurrency(stake * quote.decimalOdds),
    };
  });
}

export function analyzeMarket(snapshot: MarketSnapshot, options: AnalysisOptions): AnalysisResult {
  const now = options.now ?? new Date();
  const maxQuoteAgeMs = options.maxQuoteAgeMs ?? DEFAULT_MAX_QUOTE_AGE_MS;
  const currencyStep = options.currencyStep ?? DEFAULT_CURRENCY_STEP;

  if (options.bankroll <= 0 || currencyStep <= 0 || snapshot.outcomes.length < 2) {
    return reject(snapshot.marketId, "invalid_quote", "Bankroll, currency step, and outcome set must be valid.");
  }

  if (snapshot.quotes.some((quote) => !isValidQuote(quote))) {
    return reject(snapshot.marketId, "invalid_quote", "Every quote needs a bookmaker, known outcome, odds above 1, and timestamp.");
  }

  const bestQuotes = selectBestQuotes(snapshot, now, maxQuoteAgeMs);
  if (bestQuotes.length !== snapshot.outcomes.length) {
    const hasAllOutcomesBeforeFreshness = snapshot.outcomes.every((outcome) =>
      snapshot.quotes.some((quote) => quote.outcome === outcome),
    );
    return reject(
      snapshot.marketId,
      hasAllOutcomesBeforeFreshness ? "stale_quotes" : "incomplete_market",
      hasAllOutcomesBeforeFreshness
        ? "At least one required outcome has no fresh quote."
        : "Quotes do not cover every declared market outcome.",
    );
  }

  const impliedProbability = bestQuotes.reduce((sum, quote) => sum + 1 / quote.decimalOdds, 0);
  if (impliedProbability >= 1) {
    return reject(snapshot.marketId, "no_arbitrage", `Best available books total ${(impliedProbability * 100).toFixed(2)}%.`);
  }

  const allocations = allocateBankroll(bestQuotes, options.bankroll, currencyStep);
  const totalStake = roundCurrency(allocations.reduce((sum, allocation) => sum + allocation.stake, 0));
  const guaranteedPayout = Math.min(...allocations.map((allocation) => allocation.payout));
  const guaranteedProfit = roundCurrency(guaranteedPayout - totalStake);

  if (guaranteedProfit <= 0) {
    return reject(snapshot.marketId, "rounding_removed_edge", "The theoretical edge disappears at the configured stake increment.");
  }

  const timestamps = bestQuotes.map((quote) => Date.parse(quote.capturedAt));
  const result: ArbitrageOpportunity = {
    status: "opportunity",
    marketId: snapshot.marketId,
    event: snapshot.event,
    impliedProbability,
    theoreticalRoi: 1 / impliedProbability - 1,
    totalStake,
    guaranteedPayout,
    guaranteedProfit,
    realizedRoi: guaranteedProfit / totalStake,
    allocations,
    freshestQuoteAt: new Date(Math.max(...timestamps)).toISOString(),
    oldestQuoteAt: new Date(Math.min(...timestamps)).toISOString(),
  };

  return result;
}
