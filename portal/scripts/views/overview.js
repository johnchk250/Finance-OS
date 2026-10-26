        function homeView() {
      const d = derive();
      const period = taxPeriod();
      const allTx = state?.transactions || [];

      // ── Cash-flow trend across the assessment year (by month) ──
      const yearMonths = [];
      {
        const start = parseDate(period.start);
        const end = parseDate(period.end);
        if (start && end) {
          const cur = new Date(start.getFullYear(), start.getMonth(), 1);
          while (cur <= end) {
            yearMonths.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
            cur.setMonth(cur.getMonth() + 1);
          }
        }
      }
      const cfSeries = yearMonths.map(ym => {
        const txs = allTx.filter(t => (t.date || "").startsWith(ym));
        const inc = txs.filter(t => t.type === "income" && t.generatedKind !== "assetTransfer").reduce((s, t) => s + num(t.amount), 0);
        const exp = txs.filter(t => t.type === "expense").reduce((s, t) => s + num(t.amount), 0);
        return { ym, inc, exp, net: inc - exp };
      });
      const cfMax = Math.max(1, ...cfSeries.map(p => Math.max(p.inc, p.exp)));

      // ── Period (income year) totals for headline strip ──
      const periodNet = d.txIncome - d.txExpense;

      // ── Net-worth breakdown by source (liquid / invested / assets) ──
      const accounts = state?.accounts || [];
      const liquidTotal = accounts.reduce((s, a) => s + accountCurrentBalance(a.id, period.end), 0);
      const periodInvestments = (state?.investments || [])
        .filter(i => !i.startDate || i.startDate <= period.end)
        .filter(i => {
          const closedBefore = (i.status === "withdrawn" || i.status === "matured") && i.withdrawalDate && i.withdrawalDate <= period.end;
          return !closedBefore;
        });
      const investedTotal = periodInvestments.reduce((s, i) => s + accruedValue(i, period.end), 0);
      const periodAssets = (state?.assets || []).filter(a => !a.acquiredDate || a.acquiredDate <= period.end);
      const assetTotal = periodAssets.reduce((s, a) => s + valueOfAsset(a, period.end), 0);
      const netWorthSources = [
        { label: "Liquid", value: liquidTotal, color: "#285f91" },
        { label: "Invested", value: investedTotal, color: "#2d6a4f" },
        { label: "Assets", value: assetTotal, color: "#52b788" }
      ].filter(s => s.value > 0);
      const nwTotal = Math.max(1, netWorthSources.reduce((s, x) => s + x.value, 0));

      // ── Period income by source (salary vs investments vs other) ──
      const periodTxs = allTx.filter(t => withinPeriod(t.date, period));
      const salaryGross = (state?.salary || []).filter(s => withinPeriod(s.date, period)).reduce((s, r) => s + num(r.gross) + num(r.pfEmployer), 0);
      const otherIncome = periodTxs.filter(t => t.type === "income" && t.generatedKind !== "salaryNet" && t.generatedKind !== "assetTransfer").reduce((s, t) => s + num(t.amount), 0);
      // Period-scoped investment profit — same engine the Tax module uses,
      // so past-year profit (e.g. FY24-25 PF interest) doesn't leak in.
      const invProfit = num(yearTaxSummary(period).investmentIncome);
      const incomeBySource = [
        { label: "Salary", value: salaryGross, color: "#2d6a4f" },
        { label: "Investment profit", value: invProfit, color: "#52b788" },
        { label: "Other", value: otherIncome, color: "#285f91" }
      ].filter(s => s.value > 0);
      const incTotal = Math.max(1, incomeBySource.reduce((s, x) => s + x.value, 0));

      // ── Period expense by category (top 5) ──
      const expByCat = {};
      periodTxs.filter(t => t.type === "expense").forEach(t => {
        const k = t.category || "Uncategorized";
        expByCat[k] = (expByCat[k] || 0) + num(t.amount);
      });
      const expTotal = Math.max(1, Object.values(expByCat).reduce((s, v) => s + v, 0));
      const expColors = ["#c0392b", "#e67e22", "#d35400", "#a04000", "#7f8c8d", "#95a5a6"];
      const expTop = Object.entries(expByCat).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([label, value], i) => ({ label, value, color: expColors[i % expColors.length] }));
      const expOther = Object.entries(expByCat).sort((a, b) => b[1] - a[1]).slice(5)
        .reduce((s, [, v]) => s + v, 0);
      if (expOther > 0) expTop.push({ label: "Other", value: expOther, color: "#95a5a6" });

      // ── Upcoming maturities (strictly future) ──
      function isFutureDate(dateStr) {
        if (!dateStr) return false;
        const dt = parseDate(dateStr);
        if (!dt) return false;
        const now = new Date();
        const dateOnly = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
        const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return dateOnly >= todayOnly;
      }
      const upcoming = (state?.investments || [])
        .filter(i => i.maturityDate && isFutureDate(i.maturityDate))
        .sort((a, b) => String(a.maturityDate).localeCompare(String(b.maturityDate)))
        .slice(0, 5);

      // ── Recent activity (last 6 within period, desc) ──
      const recent = periodTxs
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 6);

      // ── Goals snapshot ──
      const goals = (state?.goals || []).slice(0, 5);

      // ── Quick actions strip ──
      function quickAction(addType, label, preset) {
        const dataAttrs = preset ? ` data-presets='${JSON.stringify(preset)}'` : "";
        return `<button class="qa" data-add="${addType}"${dataAttrs}>${label}</button>`;
      }

      // ── Reusable horizontal bar (a labelled progress bar with value) ──
      function barRow(item, total) {
        const pct = Math.max(0, Math.min(100, (item.value / total) * 100));
        return `<div class="bar-row">
          <div class="bar-row-top"><span>${item.label}</span><strong>${money(item.value)} <em>${pct.toFixed(0)}%</em></strong></div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${item.color}"></div></div>
        </div>`;
      }

      return
        <div class="home-head">
          <div class="home-head-left">
            <span class="workspace-label">THE BIG PICTURE</span><h2>Your money, in focus.</h2>
            <p>${period.label} income year · ${period.start} → ${period.end}</p>
          </div>
          <div class="home-head-right">
            ${quickAction("transactions", "+ Expense", { type: "expense" })}
            ${quickAction("transactions", "+ Income", { type: "income" })}
            ${quickAction("salary", "+ Salary")}
          </div>
        </div>

        <div class="grid kpis">
          ${kpi("Net worth", d.netWorth, "Across liquid, invested & assets", d.netWorth >= 0)}
          ${kpi("Year cash flow", periodNet, `${money(d.txIncome)} in / ${money(d.txExpense)} out`, periodNet >= 0)}
          ${kpi("Estimated tax due", d.taxDue, `${money(d.taxPaid)} paid / TDS · ${money(d.estimatedTax)} total`, d.taxDue === 0)}
          ${kpi("Savings rate", `${d.savingsRate.toFixed(1)}%`, "This calendar month", d.savingsRate >= 20)}
        </div>
        ${budgetAlertsStrip()}

        <div class="grid two" style="margin-top:14px">
          <div class="panel">
            <div class="panel-head"><h2>Financial map</h2><div class="chips">${chip("Assets " + money(d.assets))}${chip("Liabilities " + money(d.liabilities))}${chip("Net " + money(d.netWorth))}</div></div>
            <div class="panel-body">
              <div class="seg" id="netChartToggle" style="margin-bottom:8px;">
                <button type="button" class="seg-btn active" data-netview="breakdown">Breakdown</button>
                <button type="button" class="seg-btn" data-netview="history">History</button>
              </div>
              <div class="seg" id="netRangeRow" style="margin-bottom:8px;display:none;">
                <button type="button" class="seg-btn" data-netrange="6">6M</button>
                <button type="button" class="seg-btn active" data-netrange="12">1Y</button>
                <button type="button" class="seg-btn" data-netrange="36">3Y</button>
                <button type="button" class="seg-btn" data-netrange="all">All</button>
              </div>
              <div class="chart-wrap" id="netChartBreakdownWrap"><canvas id="netChart"></canvas></div>
              <div class="chart-wrap" id="netChartHistoryWrap" style="display:none;"><canvas id="netHistoryChart"></canvas></div>
            </div>
          </div>
          <div class="panel">
            <div class="panel-head"><h2>Net worth by source</h2><span class="muted">${money(d.netWorth)} total</span></div>
            <div class="panel-body split-list">
              ${netWorthSources.length ? netWorthSources.map(s => barRow(s, nwTotal)).join("") : `<div class="empty">No positions to break down.</div>`}
            </div>
          </div>
        </div>

        <div class="grid two" style="margin-top:14px">
          <div class="panel">
            <div class="panel-head"><h2>Cash flow across the year</h2><span class="muted">Income vs expense by month</span></div>
            <div class="panel-body">
              <div class="cf-chart" id="cfChart">${cfSeries.map(p => {
                const incH = Math.round((p.inc / cfMax) * 100);
                const expH = Math.round((p.exp / cfMax) * 100);
                const [y, m] = p.ym.split("-");
                const monLabel = new Date(Number(y), Number(m) - 1, 1).toLocaleString("en", { month: "short" });
                return `<div class="cf-col">
                  <div class="cf-bars">
                    <div class="cf-bar cf-inc" style="height:${incH}%" title="Income ${money(p.inc)}"></div>
                    <div class="cf-bar cf-exp" style="height:${expH}%" title="Expense ${money(p.exp)}"></div>
                  </div>
                  <div class="cf-label">${monLabel}</div>
                </div>`;
              }).join("")}</div>
              <div class="cf-legend"><span><i style="background:#2d6a4f"></i>Income</span><span><i style="background:#c0392b"></i>Expense</span><span class="cf-net ${periodNet >= 0 ? "positive" : "negative"}">Net ${money(periodNet)}</span></div>
            </div>
          </div>
          <div class="panel">
            <div class="panel-head"><h2>Income mix</h2><span class="muted">${money(incTotal)} this year</span></div>
            <div class="panel-body split-list">
              ${incomeBySource.length ? incomeBySource.map(s => barRow(s, incTotal)).join("") : `<div class="empty">No income recorded yet.</div>`}
            </div>
          </div>
        </div>

        <div class="grid three" style="margin-top:14px">
          ${miniList("Upcoming maturities", upcoming, i => `<strong>${i.name}</strong><br><span class="muted">Matures ${i.maturityDate} · ${money(i.currentValue || i.principal)}</span>`, "investments")}
          <div class="panel">
            <div class="panel-head"><h2>Top expenses</h2><span class="muted">${money(d.txExpense)} this year</span></div>
            <div class="panel-body split-list">
              ${expTop.length ? expTop.map(s => barRow(s, expTotal)).join("") : `<div class="empty">No expenses logged yet.</div>`}
            </div>
          </div>
          ${miniList("Open goals", goals, g => {
            const pct = g.target ? Math.min(100, Math.round((num(g.current) / num(g.target)) * 100)) : 0;
            return `<strong>${g.name}</strong><br><div class="bar-track" style="margin:4px 0"><div class="bar-fill" style="width:${pct}%;background:var(--green)"></div></div><span class="muted">${money(g.current)} of ${money(g.target)} · ${pct}%</span>`;
          }, "planning")}
        </div>

        <div class="grid two" style="margin-top:14px">
          ${miniList("Recent activity", recent, t => `<strong>${t.name || "Untitled"}</strong><br><span class="muted">${t.date} · ${t.category || "—"}</span>`, "transactions", t => (t.type === "income" ? "+" : "−") + money(num(t.amount)), t => t.type === "income")}
          <div class="panel">
            <div class="panel-head"><h2>Tax pulse</h2><button data-open="tax">Open tax</button></div>
            <div class="panel-body split-list">
              <div class="row-card"><div><h3>Estimated tax</h3><p>Slab tax after standard deduction & rebate</p></div><div class="amount">${money(d.estimatedTax)}</div></div>
              <div class="row-card"><div><h3>Paid / TDS</h3><p>Salary TDS + manual payments + source tax</p></div><div class="amount">${money(d.taxPaid)}</div></div>
              <div class="row-card"><div><h3 class="${d.taxDue > 0 ? "negative" : "positive"}">${d.taxDue > 0 ? "Still due" : (d.taxPaid > d.estimatedTax ? "Refundable surplus" : "Settled")}</h3><p>${d.taxDue > 0 ? "Top up before filing" : "No further payment required"}</p></div><div class="amount ${d.taxDue > 0 ? "negative" : "positive"}">${money(d.taxDue > 0 ? d.taxDue : (d.taxPaid - d.estimatedTax))}</div></div>
            </div>
          </div>
        </div>
      `;
    }

    function kpi(label, value, sub, good) {
      return `<div class="panel kpi"><div><span>${label}</span><strong class="${good ? "positive" : "negative"}">${typeof value === "number" ? money(value) : value}</strong></div><small>${sub}</small></div>`;
    }

    function chip(text) {
      return `<span class="chip">${text}</span>`;
    }

    function syncCard(title, text, count) {
      return `<div class="row-card"><div><h3>${title}</h3><p>${text}</p></div><div class="amount">${count}</div></div>`;
    }

    function miniList(title, items, mapper, openView, amountFn, positiveFn) {
      const headRight = openView ? `<button data-open="${openView}">View all</button>` : "";
      const body = items.length ? items.map(item => {
        const right = amountFn ? `<div class="amount ${positiveFn && positiveFn(item) ? "" : "negative"}">${amountFn(item)}</div>` : "";
        return `<div class="row-card"><div>${mapper(item)}</div>${right}</div>`;
      }).join("") : `<div class="empty">No records yet.</div>`;
      return `<div class="panel"><div class="panel-head"><h2>${title}</h2>${headRight}</div><div class="panel-body split-list">${body}</div></div>`;
    }
