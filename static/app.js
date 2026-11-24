const state = {
  quotes: [], // Map-like array keyed by symbol:interval
};

const quoteForm = document.getElementById("quote-form");
const symbolInput = document.getElementById("symbol-input");
const intervalSelect = document.getElementById("interval-select");
const fetchBtn = document.getElementById("fetch-btn");
const sampleBtn = document.getElementById("sample-btn");
const statusBanner = document.getElementById("status-banner");

const filterSearch = document.getElementById("filter-search");
const directionFilter = document.getElementById("direction-filter");
const sortSelect = document.getElementById("sort-select");

const quotesTbody = document.getElementById("quotes-tbody");
const quoteCount = document.getElementById("quote-count");
const lastUpdated = document.getElementById("last-updated");

const detailCard = document.getElementById("detail-card");
const detailTitle = document.getElementById("detail-title");
const detailGrid = document.getElementById("detail-grid");
const closeDetailBtn = document.getElementById("close-detail-btn");

function showBanner(message, isInfo = false) {
  statusBanner.textContent = message;
  statusBanner.classList.toggle("info", isInfo);
  statusBanner.classList.remove("hidden");
}

function hideBanner() {
  statusBanner.classList.add("hidden");
  statusBanner.textContent = "";
}

function fmtNum(val, decimals = 2) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return "—";
  return Number(val).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtInt(val) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return "—";
  return Number(val).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

async function fetchSymbolQuote(symbol, interval) {
  const cleanSymbol = symbol.trim().toUpperCase();
  const params = new URLSearchParams({ symbol: cleanSymbol, interval });
  const response = await fetch(`/api/quote?${params.toString()}`);
  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || `Failed to fetch quote for ${cleanSymbol}.`);
  }

  const key = `${data.quote.symbol}:${data.quote.interval}`;
  const entry = {
    key,
    cached: Boolean(data.cached),
    ...data.quote,
  };

  const existingIdx = state.quotes.findIndex((item) => item.key === key);
  if (existingIdx >= 0) {
    state.quotes[existingIdx] = entry;
  } else {
    state.quotes.push(entry);
  }

  return entry;
}

function getFilteredAndSortedQuotes() {
  const q = filterSearch.value.trim().toLowerCase();
  const dir = directionFilter.value;
  const sortVal = sortSelect.value;

  const filtered = state.quotes.filter((item) => {
    const matchesText =
      !q ||
      item.symbol.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      item.exchange.toLowerCase().includes(q);

    const pct = item.percent_change ?? 0;
    const matchesDir =
      dir === "all" ||
      (dir === "gainers" && pct > 0) ||
      (dir === "losers" && pct < 0);

    return matchesText && matchesDir;
  });

  const [field, order] = sortVal.split("-");
  const mult = order === "asc" ? 1 : -1;

  filtered.sort((a, b) => {
    if (field === "symbol") {
      return a.symbol.localeCompare(b.symbol) * mult;
    }
    const mapField = field === "change" ? "percent_change" : field;
    const valA = a[mapField] ?? -Infinity;
    const valB = b[mapField] ?? -Infinity;
    return (valA - valB) * mult;
  });

  return filtered;
}

function renderQuotes() {
  const rows = getFilteredAndSortedQuotes();
  quoteCount.textContent = String(rows.length);

  if (state.quotes.length > 0) {
    lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  }

  if (rows.length === 0) {
    quotesTbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="9">No matching quotes to display. Try fetching a symbol or adjusting filters.</td>
      </tr>
    `;
    return;
  }

  quotesTbody.innerHTML = rows
    .map((item) => {
      const chg = item.change ?? 0;
      const pct = item.percent_change ?? 0;
      const cls = chg > 0 ? "pos" : chg < 0 ? "neg" : "";
      const sign = chg > 0 ? "+" : "";

      return `
        <tr>
          <td><strong>${item.symbol}</strong> <span class="muted">(${item.interval})</span></td>
          <td>${item.name}</td>
          <td>${item.exchange}</td>
          <td>${fmtNum(item.price)} <span class="muted">${item.currency}</span></td>
          <td class="${cls}">${sign}${fmtNum(chg)}</td>
          <td class="${cls}">${sign}${fmtNum(pct)}%</td>
          <td>${fmtNum(item.open)} / ${fmtNum(item.high)} / ${fmtNum(item.low)}</td>
          <td>${fmtInt(item.volume)}</td>
          <td><button type="button" class="btn btn-small inspect-btn" data-key="${item.key}">Inspect</button></td>
        </tr>
      `;
    })
    .join("");

  document.querySelectorAll(".inspect-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = state.quotes.find((q) => q.key === btn.dataset.key);
      if (item) openDetail(item);
    });
  });
}

function openDetail(item) {
  detailTitle.textContent = `${item.name} (${item.symbol}) — ${item.interval}`;
  const fields = [
    ["Symbol", item.symbol],
    ["Exchange", item.exchange],
    ["Currency", item.currency],
    ["Latest Price", fmtNum(item.price)],
    ["Open", fmtNum(item.open)],
    ["High", fmtNum(item.high)],
    ["Low", fmtNum(item.low)],
    ["Close", fmtNum(item.close)],
    ["Previous Close", fmtNum(item.previous_close)],
    ["Change", fmtNum(item.change)],
    ["% Change", `${fmtNum(item.percent_change)}%`],
    ["Volume", fmtInt(item.volume)],
    ["Datetime", item.datetime || "—"],
    ["Cache Status", item.cached ? "Cached" : "Fresh API Call"],
  ];

  detailGrid.innerHTML = fields
    .map(
      ([label, val]) => `
      <div class="detail-item">
        <span>${label}</span>
        <strong>${val}</strong>
      </div>
    `
    )
    .join("");

  detailCard.classList.remove("hidden");
}

closeDetailBtn.addEventListener("click", () => {
  detailCard.classList.add("hidden");
});

quoteForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideBanner();

  const rawSymbol = symbolInput.value.trim();
  if (!rawSymbol) {
    showBanner("Please enter a ticker symbol before submitting.");
    return;
  }

  fetchBtn.disabled = true;
  fetchBtn.textContent = "Fetching...";

  try {
    const entry = await fetchSymbolQuote(rawSymbol, intervalSelect.value);
    renderQuotes();
    openDetail(entry);
    showBanner(
      `Loaded ${entry.symbol} (${entry.interval})${entry.cached ? " from server cache" : " from Twelve Data"}.`,
      true
    );
    symbolInput.value = "";
  } catch (err) {
    showBanner(err.message);
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.textContent = "Fetch Quote";
  }
});

sampleBtn.addEventListener("click", async () => {
  hideBanner();
  sampleBtn.disabled = true;
  sampleBtn.textContent = "Loading...";

  const samples = ["AAPL", "MSFT", "NVDA"];
  const interval = intervalSelect.value;

  try {
    for (let i = 0; i < samples.length; i += 1) {
      await fetchSymbolQuote(samples[i], interval);
      renderQuotes();
      if (i < samples.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    showBanner("Loaded sample quotes (AAPL, MSFT, NVDA).", true);
  } catch (err) {
    showBanner(err.message);
  } finally {
    sampleBtn.disabled = false;
    sampleBtn.textContent = "Load Sample Quotes";
  }
});

filterSearch.addEventListener("input", renderQuotes);
directionFilter.addEventListener("change", renderQuotes);
sortSelect.addEventListener("change", renderQuotes);