import { analyzeMarket } from "./index.js";
import type { AnalysisResult, MarketSnapshot } from "./index.js";
import "./styles.css";

type Scenario = "valid" | "stale" | "no-edge";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Application root is missing");

const requestedScenario = new URLSearchParams(window.location.search).get("scenario");
const initialScenario: Scenario =
  requestedScenario === "stale" || requestedScenario === "no-edge" ? requestedScenario : "valid";

app.innerHTML = `
  <header class="topbar">
    <div class="brand-lockup">
      <span class="brand-mark" aria-hidden="true">A</span>
      <div>
        <strong>Arbitrage Engine</strong>
        <span>Deterministic market validation</span>
      </div>
    </div>
    <div class="environment"><span></span> Reference fixture</div>
  </header>

  <main class="workspace">
    <section class="operation-band" aria-labelledby="market-title">
      <div>
        <p class="eyebrow">MARKET / MATCH WINNER</p>
        <h1 id="market-title">North FC vs South FC</h1>
        <p class="subcopy">Two outcomes · four quotes · decimal odds</p>
      </div>
      <div class="scenario-control" role="group" aria-label="Market scenario">
        <button type="button" data-scenario="valid" class="${initialScenario === "valid" ? "is-active" : ""}">Valid edge</button>
        <button type="button" data-scenario="stale" class="${initialScenario === "stale" ? "is-active" : ""}">Stale quote</button>
        <button type="button" data-scenario="no-edge" class="${initialScenario === "no-edge" ? "is-active" : ""}">No edge</button>
      </div>
    </section>

    <div class="primary-grid">
      <section class="quotes-panel" aria-labelledby="quotes-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">01 / NORMALIZED INPUT</p>
            <h2 id="quotes-title">Quote matrix</h2>
          </div>
          <span class="status-pill" id="quote-status">FRESH</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Bookmaker</th><th>Outcome</th><th>Odds</th><th>Age</th><th>Selected</th></tr>
            </thead>
            <tbody id="quote-rows"></tbody>
          </table>
        </div>
        <div class="validation-strip" id="validation-strip"></div>
      </section>

      <aside class="controls-panel" aria-labelledby="controls-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">02 / PARAMETERS</p>
            <h2 id="controls-title">Calculation</h2>
          </div>
        </div>
        <label class="field">
          <span>Bankroll</span>
          <div class="input-shell"><input id="bankroll" type="number" min="1" step="10" value="1000" /><b>units</b></div>
        </label>
        <label class="field">
          <span>Freshness window</span>
          <select id="freshness">
            <option value="15000">15 seconds</option>
            <option value="30000" selected>30 seconds</option>
            <option value="60000">60 seconds</option>
          </select>
        </label>
        <label class="field">
          <span>Currency step</span>
          <select id="currency-step">
            <option value="0.01" selected>0.01</option>
            <option value="0.1">0.10</option>
            <option value="1">1.00</option>
          </select>
        </label>
        <button class="analyze-button" id="analyze" type="button">Analyze market</button>
        <p class="control-note">No network calls or bet placement. The browser invokes the same tested domain function as the CLI fixture.</p>
      </aside>
    </div>

    <section class="result-panel" aria-labelledby="result-title">
      <div class="section-heading result-heading">
        <div>
          <p class="eyebrow">03 / VERIFIED OUTPUT</p>
          <h2 id="result-title">Worst-case allocation</h2>
        </div>
        <div id="result-state"></div>
      </div>
      <div id="result-content"></div>
    </section>
  </main>
`;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required interface control is missing: ${selector}`);
  return element;
}

const bankrollInput = requiredElement<HTMLInputElement>("#bankroll");
const freshnessSelect = requiredElement<HTMLSelectElement>("#freshness");
const currencyStepSelect = requiredElement<HTMLSelectElement>("#currency-step");
const quoteRows = requiredElement<HTMLTableSectionElement>("#quote-rows");
const validationStrip = requiredElement<HTMLDivElement>("#validation-strip");
const quoteStatus = requiredElement<HTMLSpanElement>("#quote-status");
const resultState = requiredElement<HTMLDivElement>("#result-state");
const resultContent = requiredElement<HTMLDivElement>("#result-content");

let scenario: Scenario = initialScenario;

function buildSnapshot(mode: Scenario): { snapshot: MarketSnapshot; now: Date } {
  const now = new Date();
  const recent = new Date(now.getTime() - 5_000).toISOString();
  const older = new Date(now.getTime() - 45_000).toISOString();
  const southOdds = mode === "no-edge" ? 1.78 : 2.15;

  return {
    now,
    snapshot: {
      marketId: "match-winner-001",
      event: "North FC vs South FC",
      startsAt: new Date(now.getTime() + 6 * 60 * 60 * 1_000).toISOString(),
      outcomes: ["North FC", "South FC"],
      quotes: [
        { bookmaker: "Book A", outcome: "North FC", decimalOdds: 2.2, capturedAt: recent },
        {
          bookmaker: "Book A",
          outcome: "South FC",
          decimalOdds: 1.74,
          capturedAt: mode === "stale" ? older : recent,
        },
        { bookmaker: "Book B", outcome: "North FC", decimalOdds: 1.82, capturedAt: recent },
        {
          bookmaker: "Book B",
          outcome: "South FC",
          decimalOdds: southOdds,
          capturedAt: mode === "stale" ? older : recent,
        },
      ],
    },
  };
}

function money(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function quoteAge(capturedAt: string, now: Date): string {
  return `${Math.round((now.getTime() - Date.parse(capturedAt)) / 1_000)}s`;
}

function renderQuotes(snapshot: MarketSnapshot, now: Date, result: AnalysisResult): void {
  const selected = new Set(
    result.status === "opportunity"
      ? result.allocations.map((allocation) => `${allocation.bookmaker}:${allocation.outcome}`)
      : [],
  );

  quoteRows.innerHTML = snapshot.quotes
    .map((quote) => {
      const key = `${quote.bookmaker}:${quote.outcome}`;
      const age = quoteAge(quote.capturedAt, now);
      const stale = now.getTime() - Date.parse(quote.capturedAt) > Number(freshnessSelect.value);
      return `<tr class="${selected.has(key) ? "is-selected" : ""}">
        <td><strong>${quote.bookmaker}</strong></td>
        <td>${quote.outcome}</td>
        <td class="odds">${quote.decimalOdds.toFixed(2)}</td>
        <td><span class="age ${stale ? "is-stale" : ""}">${age}</span></td>
        <td>${selected.has(key) ? '<span class="selected-mark">BEST</span>' : '<span class="muted">—</span>'}</td>
      </tr>`;
    })
    .join("");

  const valid = result.status === "opportunity";
  quoteStatus.textContent = valid ? "FRESH" : result.reason.replaceAll("_", " ").toUpperCase();
  quoteStatus.className = `status-pill ${valid ? "" : "is-error"}`;
  validationStrip.innerHTML = valid
    ? `<span>✓ Complete outcome set</span><span>✓ Quotes within ${Number(freshnessSelect.value) / 1_000}s</span><span>✓ Comparable market</span>`
    : `<span>Calculation stopped</span><strong>${result.details}</strong>`;
  validationStrip.className = `validation-strip ${valid ? "" : "is-error"}`;
}

function renderOpportunity(result: Extract<AnalysisResult, { status: "opportunity" }>): void {
  resultState.innerHTML = `<span class="opportunity-state">OPPORTUNITY</span>`;
  resultContent.innerHTML = `
    <div class="metrics-row">
      <div><span>Implied probability</span><strong>${percent(result.impliedProbability)}</strong></div>
      <div><span>Theoretical ROI</span><strong>${percent(result.theoreticalRoi)}</strong></div>
      <div><span>Guaranteed payout</span><strong>${money(result.guaranteedPayout)}</strong></div>
      <div class="profit-metric"><span>Worst-case profit</span><strong>+${money(result.guaranteedProfit)}</strong></div>
    </div>
    <div class="allocation-list">
      ${result.allocations
        .map(
          (allocation, index) => `<div class="allocation-row">
            <div class="allocation-index">0${index + 1}</div>
            <div class="allocation-identity"><strong>${allocation.outcome}</strong><span>${allocation.bookmaker} · ${allocation.decimalOdds.toFixed(2)}</span></div>
            <div class="allocation-bar"><i style="width:${(allocation.stake / result.totalStake) * 100}%"></i></div>
            <div class="allocation-value"><strong>${money(allocation.stake)}</strong><span>payout ${money(allocation.payout)}</span></div>
          </div>`,
        )
        .join("")}
    </div>
    <div class="proof-line"><span>Proof</span><code>min(${result.allocations.map((item) => money(item.payout)).join(", ")}) − ${money(result.totalStake)} = ${money(result.guaranteedProfit)}</code></div>
  `;
}

function renderRejection(result: Extract<AnalysisResult, { status: "rejected" }>): void {
  resultState.innerHTML = `<span class="rejected-state">REJECTED</span>`;
  resultContent.innerHTML = `<div class="rejection-box">
    <p class="eyebrow">${result.reason.replaceAll("_", " ")}</p>
    <h3>Market cannot produce a defensible allocation.</h3>
    <p>${result.details}</p>
    <div><span>No stake plan generated</span><span>No execution requested</span></div>
  </div>`;
}

function analyze(): void {
  const { snapshot, now } = buildSnapshot(scenario);
  const result = analyzeMarket(snapshot, {
    bankroll: Number(bankrollInput.value),
    now,
    maxQuoteAgeMs: Number(freshnessSelect.value),
    currencyStep: Number(currencyStepSelect.value),
  });

  renderQuotes(snapshot, now, result);
  if (result.status === "opportunity") renderOpportunity(result);
  else renderRejection(result);
}

document.querySelectorAll<HTMLButtonElement>("[data-scenario]").forEach((button) => {
  button.addEventListener("click", () => {
    scenario = button.dataset.scenario as Scenario;
    document.querySelectorAll("[data-scenario]").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    analyze();
  });
});

document.querySelector("#analyze")?.addEventListener("click", analyze);
[bankrollInput, freshnessSelect, currencyStepSelect].forEach((control) => control.addEventListener("change", analyze));

analyze();
