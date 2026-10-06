export interface MarketQuote {
  bookmaker: string;
  outcome: string;
  decimalOdds: number;
  capturedAt: string;
}

export interface MarketSnapshot {
  marketId: string;
  event: string;
  startsAt: string;
  outcomes: string[];
  quotes: MarketQuote[];
}

export interface StakeAllocation {
  bookmaker: string;
  outcome: string;
  decimalOdds: number;
  stake: number;
  payout: number;
}

export interface RejectedMarket {
  status: "rejected";
  marketId: string;
  reason: "incomplete_market" | "invalid_quote" | "stale_quotes" | "no_arbitrage" | "rounding_removed_edge";
  details: string;
}

export interface ArbitrageOpportunity {
  status: "opportunity";
  marketId: string;
  event: string;
  impliedProbability: number;
  theoreticalRoi: number;
  totalStake: number;
  guaranteedPayout: number;
  guaranteedProfit: number;
  realizedRoi: number;
  allocations: StakeAllocation[];
  freshestQuoteAt: string;
  oldestQuoteAt: string;
}

export type AnalysisResult = ArbitrageOpportunity | RejectedMarket;

export interface AnalysisOptions {
  bankroll: number;
  now?: Date;
  maxQuoteAgeMs?: number;
  currencyStep?: number;
}
