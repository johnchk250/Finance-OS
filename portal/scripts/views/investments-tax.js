    function investmentsView(search) {
      const _invPeriod = taxPeriod();
      const _invEnd = _invPeriod.end;
      const rows = filterRows(state.investments || [], search);

      // Period-scoped profit / source-tax per investment. Built from the same
      // investmentTaxEntries(period) the Tax module uses so a multi-year
      // instrument's card shows only THIS period's gain, not its lifetime total.
      // PF ledger entries carry parentId; standalone entries match by name.
      const periodProfitByInv = {};
      const periodTaxByInv = {};
      investmentTaxEntries(_invPeriod).forEach(e => {
        const key = e.parentId || (state?.investments || []).find(inv => inv.name === e.name)?.id || e.name;
        periodProfitByInv[key] = num(periodProfitByInv[key]) + num(e.taxableProfit);
        periodTaxByInv[key] = num(periodTaxByInv[key]) + num(e.taxDeducted);
      });

      // Active for this period: started by period end AND not yet withdrawn/matured by period end
      const activeRows = rows.filter(i => {
        if (i.startDate && i.startDate > _invEnd) return false;
        const isClosedBeforePeriodEnd =
          (i.status === 'withdrawn' || i.status === 'matured') &&
          i.withdrawalDate && i.withdrawalDate <= _invEnd;
        return !isClosedBeforePeriodEnd;
      });
      // Historical: withdrawn/matured investments whose closure falls within or before the period
      const historicalRows = rows.filter(i =>
        (i.status === 'withdrawn' || i.status === 'matured') &&
        (!i.withdrawalDate || i.withdrawalDate <= _invEnd)
      );

      // Collect all PF investments with non-empty ledgers (for the folded
      // ledger rendering inside the PF card's <details>).
      const pfLedgerById = {};
      activeRows.forEach(i => {
        if (i.type === 'provident_fund' && Array.isArray(i.pfLedger) && i.pfLedger.length > 0) pfLedgerById[i.id] = i.pfLedger;
      });

      // ── KPI strip ── Sums over active holdings only, period-aware. Derived
      // purely from existing fields — no new tax logic. "Invested" = principal,
      // "Current" = accruedValue at period end, "Total Gain" = current − invested,
      // "Period Gain" = this AY's taxable profit (same source the Tax tab uses).
      const kpiInvested = activeRows.reduce((s, i) => s + num(i.principal), 0);
      const kpiCurrent   = activeRows.reduce((s, i) => s + num(accruedValue(i, _invEnd)), 0);
      const kpiTotalGain = kpiCurrent - kpiInvested;
      const kpiPeriodGain = activeRows.reduce((s, i) => s + num(periodProfitByInv[i.id] || 0), 0);
      const totalGainPct = kpiInvested > 0 ? (kpiTotalGain / kpiInvested) * 100 : 0;

      // ── Allocation legend ── Same type-bucketing the donut uses, exposed as
      // an HTML list with values + % so the numbers are readable/selectable
      // (the in-canvas legend had no amounts). Swatch colors mirror the chart's
      // palette so legend slices match donut slices.
      const ALLOC_COLORS = ["#2d6a4f","#52b788","#95d5b2","#c0392b","#e67e22","#285f91","#8e44ad","#2c3e50"];
      const allocTypeMap = {};
      activeRows.forEach(i => {
        const t = i.type || "other";
        allocTypeMap[t] = (allocTypeMap[t] || 0) + num(accruedValue(i, _invEnd));
      });
      const allocEntries = Object.entries(allocTypeMap);
      const allocTotal = allocEntries.reduce((s, [, v]) => s + v, 0) || 1;

      const TYPE_LABELS = {
        savings_certificate: "Savings certificate", dps: "DPS", fdr: "FDR",
        mutual_fund: "Mutual fund", provident_fund: "Provident fund", other: "Other"
      };
      const typeBadge = t => TYPE_LABELS[t] || (t || "other").replace(/_/g, " ");

      // ── Per-card derived metrics ── Yield % = (current/principal − 1) × 100;
      // annualised only when a startDate exists. Maturity progress uses the
      // window [startDate, maturityDate] clamped to period end.
      const gainState = (amt) => amt > 0 ? "up" : (amt < 0 ? "down" : "flat");
      const arrowFor  = (amt) => amt > 0 ? "▲" : (amt < 0 ? "▼" : "■");
      // CSS color class for KPI values (positive green / negative red).
      const gsFor = (amt) => amt > 0 ? "positive" : (amt < 0 ? "negative" : "");

      function yieldPct(i) {
        const p = num(i.principal);
        if (p <= 0) return null;
        const cv = num(accruedValue(i, _invEnd));
        const total = ((cv / p) - 1) * 100;
        const sd = i.startDate ? parseDate(i.startDate) : null;
        const asOf = parseDate(_invEnd);
        if (sd && asOf && asOf > sd) {
          const yrs = (asOf - sd) / (365 * 86400000);
          if (yrs >= 1) return { total, annual: total / yrs };
        }
        return { total, annual: null };
      }

      function maturityMeta(i) {
        if (!i.maturityDate || !i.startDate) return null;
        const sd = parseDate(i.startDate);
        const md = parseDate(i.maturityDate);
        const asOf = parseDate(_invEnd);
        if (!sd || !md || md <= sd) return null;
        const span = md - sd;
        const elapsed = Math.min(Math.max(asOf - sd, 0), span);
        const pct = Math.round((elapsed / span) * 100);
        return { pct, start: i.startDate, maturity: i.maturityDate, done: asOf >= md };
      }

      // One full-width ledger row per investment. Two-zone flex: left zone holds
      // title + meta + an inset details box (toggled by the whole-row click);
      // right zone is a fixed 200px right-aligned numeric column (value on top,
      // gain + yield beneath) so every value lines up across all rows. A
      // chevron sits between the kebab and the side; one row open at a time.
      function invCard(i, opts = {}) {
        const isHist = !!opts.historical;
        const principal = num(i.principal);
        const current = num(accruedValue(i, _invEnd));
        const gain = current - principal;
        const periodGain = num(periodProfitByInv[i.id] || 0);
        const periodTax = num(periodTaxByInv[i.id] || 0);
        const yld = yieldPct(i);
        const taxMethod = i.profitTaxMethod || defaultProfitTaxMethod(i.type);
        const mat = isHist ? null : maturityMeta(i);

        const faceGain = isHist ? num(i.principalReturned || principal) - principal : gain;
        const gs = gainState(faceGain);
        const faceValue = isHist ? (i.principalReturned || principal) : current;

        return
          <div class="row-card inv-row" data-inv-row>
            <div class="inv-main">
              <h3>${escapeHtml(i.name)}</h3>
              <div class="inv-meta">${typeBadge(i.type)}${i.institution ? " · " + escapeHtml(i.institution) : ""}${isHist ? " · " + escapeHtml(i.status || "closed") : ""}</div>
              <div class="inv-detail-box">
                <div class="inv-detail-grid">
                  <span class="k">Principal</span><span class="v">${money(principal)}</span>
                  ${isHis
                    ? `<span class="k">Returned</span><span class="v">${money(i.principalReturned || principal)}</span>
                    : `<span class="k">Current value</span><span class="v">${money(current)}</span>`}
                  ${i.startDate ? `<span class="k">Started</span><span class="v">${i.startDate}</span>` : ""}
                  ${isHist && i.withdrawalDate ? `<span class="k">Closed</span><span class="v">${i.withdrawalDate}</span>` : ""}
                  ${i.institution ? `<span class="k">Institution</span><span class="v">${escapeHtml(i.institution)}</span>` : ""}
                  ${num(i.profitRate) ? `<span class="k">Profit rate</span><span class="v">${i.profitRate}%</span>` : ""}
                  <span class="k">Tax method</span><span class="v">${taxMethod === "slab" ? "Slab (credit)" : "Final tax"}</span>
                  <span class="k">Gain (${_invPeriod.label})</span><span class="v positive">${money(periodGain)}</span>
                  <span class="k">Source tax (${_invPeriod.label})</span><span class="v negative">${money(periodTax)}</span>
                  ${i.withdrawalAccountId ? `<span class="k">Deposited to</span><span class="v">${escapeHtml(accountName(i.withdrawalAccountId))}</span>` : ""}
                </div>
                ${mat ?
                  <div class="mat-bar"><span style="width:${mat.pct}%"></span></div>
                  <div class="mat-meta"><span>${mat.start}</span><span>${mat.done ? "matured" : mat.maturity}</span></div>
                ` : ""}
                <div class="chips" style="margin-top:8px;">
                  ${i.rebateEligible ? chip("Rebate eligible") : ""}
                  ${taxMethod === "slab"
                    ? `<span class="chip" style="background:#e8f1fb;color:#285f91;">Slab-taxed</span>
                    : `<span class="chip" style="background:#d8f3dc;color:#2d6a4f;">Final tax</span>`}
                  ${!isHist && i.startDate && withinPeriod(i.startDate, _invPeriod) ? chip("Current year") : ""}
                  ${chip(investmentFundingLabel(i))}
                </div>
                ${pfLedgerById[i.id] ? providentFundLedgerView(i) : ""}
                ${i.notes ? `<div class="full" style="font-size:11px;color:var(--muted);margin-top:8px;white-space:pre-wrap;">${escapeHtml(i.notes)}</div>` : ""}
              </div>
            </div>
            <div class="inv-side">
              <span class="inv-value">${money(faceValue)}</span>
              <span class="inv-gain ${gs}">${arrowFor(faceGain)} ${money(Math.abs(faceGain))}${faceGain !== 0 ? ` (${(Math.abs(faceGain) / (principal || 1) * 100).toFixed(1)}%)` : ""}</span>
              ${!isHist && yld && yld.total !== 0 ? `<span class="inv-gain yield">yield ${yld.total.toFixed(1)}%${yld.annual != null ? ` · ${yld.annual.toFixed(1)}%/yr` : ""}</span>` : ""}
            </div>
            <span class="inv-chevron">▸</span>
            <div class="actions">${rowMenu(opts.menu || [])}</div>
          </div>
        `;
      }

      return
        ${recordTabs("investments")}

        <!-- KPI strip -->
        <div class="inv-kpis">
          <div class="kpi-card"><div class="kpi-info"><span>Invested</span><strong>${money(kpiInvested)}</strong><small>active holdings</small></div></div>
          <div class="kpi-card"><div class="kpi-info"><span>Current</span><strong>${money(kpiCurrent)}</strong><small>at ${_invEnd}</small></div></div>
          <div class="kpi-card"><div class="kpi-info"><span>Total gain</span><strong class="${gsFor(kpiTotalGain)}">${money(kpiTotalGain)}</strong><small>${kpiTotalGain >= 0 ? "+" : ""}${totalGainPct.toFixed(1)}% all-time</small></div></div>
          <div class="kpi-card"><div class="kpi-info"><span>Period gain</span><strong class="${gsFor(kpiPeriodGain)}">${money(kpiPeriodGain)}</strong><small>${_invPeriod.label} taxable profit</small></div></div>
        </div>

        <!-- Allocation: donut + numeric HTML legend -->
        <div class="panel" style="margin-bottom: 16px;">
          <div class="panel-head"><h2>Allocation</h2><span style="font-size:12px;color:var(--muted);">by type · current value</span></div>
          <div class="alloc-wrap">
            <div class="alloc-canvas"><div style="width:280px;"><canvas id="allocationChart"></canvas></div></div>
            <ul class="alloc-legend">
              ${allocEntries.length ? allocEntries.map(([t, v], idx) =>
                <li>
                  <span class="swatch" style="background:${ALLOC_COLORS[idx % ALLOC_COLORS.length]}"></span>
                  <span class="lg-name">${typeBadge(t)}</span>
                  <span class="lg-val">${money(v)}</span>
                  <span class="lg-pct">${Math.round((v / allocTotal) * 100)}%</span>
                </li>
              `).join("") : `<li class="empty-note">No active investment data.</li>`}
            </ul>
          </div>
        </div>

        <!-- Active investments -->
        <div class="panel">
          <div class="panel-head"><h2>Active Investments</h2><button data-add="investments">Add Investment</button></div>
          <div class="panel-body">
            ${activeRows.length
              ? `<div class="inv-rows split-list">${activeRows.map(i => invCard(i, {
                  menu: [
                    { settle: i.id, label: "Withdraw / Mature" },
                    { copy: `investments:${i.id}`, label: "Copy" },
                    { edit: `investments:${i.id}`, label: "Edit" },
                    { sep: true },
                    { delete: `investments:${i.id}`, label: "Delete", danger: true }
                  ]
                })).join("")}</div>
              : `<div class="empty" style="padding:24px;">No active investments.</div>`}
          </div>
        </div>

        <!-- Historical / past investments -->
        ${historicalRows.length ?
          <div class="panel" style="margin-top:16px;">
            <div class="panel-head"><h2 style="color:var(--muted);">Past Investments</h2>
            <span style="font-size:12px;color:var(--muted);">withdrawn / matured · retained for tax filing</span></div>
            <div class="panel-body">
              <div class="inv-rows split-list">
                ${historicalRows.map(i => invCard(i, {
                  historical: true,
                  menu: [
                    { settle: i.id, label: "Edit Settlement" },
                    { copy: `investments:${i.id}`, label: "Copy" },
                    { sep: true },
                    { delete: `investments:${i.id}`, label: "Delete", danger: true }
                  ]
                })).join("")}
              </div>
            </div>
          </div>
        ` : ''}
      `;

    }
          function providentFundLedgerView(inv) {
      const ledger = Array.isArray(inv.pfLedger) ? inv.pfLedger : [];
      if (!ledger.length) return `<div class="empty" style="padding:10px 0;text-align:left">No PF yearly entries yet.</div>`;

      // Sort ledger by date (most recent first) for better viewing
      const sortedLedger = [...ledger].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

      return
        <div style="border:1px solid var(--border); border-radius:8px; padding:8px; max-height:220px; overflow-y:auto; margin-top:6px;">
          ${sortedLedger.map(entry =>
            <div style="display:flex; flex-direction:column; gap:4px; padding:6px 0; border-bottom:1px solid var(--border);">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; font-size:12px;">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                  <span style="font-weight:600; white-space:nowrap;">${entry.date || "N/A"}</span>
                  <span style="color:var(--muted);">|</span>
                  <span>Contribution: <strong>${money(entry.principal)}</strong></span>
                  <span style="color:var(--muted);">|</span>
                  <span style="color:var(--green);">Gain: <strong>${money(entry.taxableProfit)}</strong></span>
                  <span style="color:var(--muted);">|</span>
                  <span>Balance: <strong>${money(entry.currentValue || entry.principal)}</strong></span>
                  <span style="color:var(--muted);">|</span>
                  <span style="color:var(--red);">Tax: <strong>${money(entry.taxDeducted)}</strong></span>
                </div>
                <div style="display:flex; gap:4px; flex-shrink:0;">
                  ${rowMenu([
                    { pfCopy: `${inv.id}:${entry.id}`, label: "Copy" },
                    { pfEdit: `${inv.id}:${entry.id}`, label: "Edit" },
                    { sep: true },
                    { pfDelete: `${inv.id}:${entry.id}`, label: "Delete", danger: true }
                  ])}
                </div>
              </div>
              ${entry.notes ?
                <details style="font-size:11px; color:var(--muted); margin-top:2px;">
                  <summary style="cursor:pointer; color:var(--green-light);">Show Full Details</summary>
                  <div style="padding:6px 8px; background:var(--surface-soft); border-radius:4px; margin-top:4px; white-space:pre-wrap; word-break:break-word;">${escapeHtml(entry.notes)}</div>
                </details>
              ` : ''}
            </div>
          `).join("")}
        </div>
      `;
    }
                        function taxView() {
      // Use existing utilities
      const summary = yearTaxSummary();
      const period = summary.period;
      const formatBD = val => Math.round(val).toLocaleString("en-IN"); // SAFE: defined locally
      const taxRules = getTaxRulesForYear(period.label);
      const stdDed = taxRules.standardDeduction || { fraction: 0.3333, cap: 500000 };
      const deduction = Math.min(summary.ordinaryIncome * stdDed.fraction, stdDed.cap);
      const taxableIncome = Math.max(0, summary.ordinaryIncome - deduction);
      const slabInfo = getTaxSlabs(taxableIncome, period.label);
      const grossSlabTax = slabInfo.totalGrossTax;

      // --- REBATE CALCULATIONS ---
      const rebateDefaults = { rate: 0.15, investmentCapPercent: 0.20, maxCapAbsolute: 10000000 };
      const rp = { ...rebateDefaults, ...(taxRules.rebateParams || {}) };
      const rebateRate = num(rp.rate);
      const investmentCapPercent = num(rp.investmentCapPercent);
      const maxInvestmentCap = num(rp.maxCapAbsolute);
      const formatPercent = value => `${(num(value) * 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;
      const rebateRateLabel = formatPercent(rebateRate);
      const investmentCapLabel = formatPercent(investmentCapPercent);
      const actualEligibleInvestments = Math.min(summary.rebateBase, taxableIncome * investmentCapPercent, maxInvestmentCap);
      const actualRebate = Math.round(actualEligibleInvestments * rebateRate);
      const maxRebateAllowedBySlab = Math.round(taxableIncome * 0.03);
      const finalActualRebate = Math.min(actualRebate, maxRebateAllowedBySlab);

      const maxPrincipalInvestible = Math.round(Math.min(taxableIncome * investmentCapPercent, maxInvestmentCap));
      const absoluteMaxRebate = maxRebateAllowedBySlab;

      // GAP ANALYSIS
      const rebateGapAmount = Math.max(0, absoluteMaxRebate - finalActualRebate);
      const additionalPrincipalNeeded = rebateGapAmount > 0 ? Math.round(rebateGapAmount / rebateRate) : 0;

      // --- INVESTMENT BREAKDOWN (USE EXISTING WITHINPERIOD) ---
      let pfPrincipal = 0;
      let mutualFundPrincipal = 0;
      let otherPrincipal = 0;

      (state?.investments || []).forEach(inv => {
        if (inv.type === "provident_fund" && Array.isArray(inv.pfLedger)) {
          pfPrincipal += inv.pfLedger
            .filter(entry => withinPeriod(entry.date, period)) // ✅ SAFE: uses existing function
            .reduce((sum, e) => sum + num(e.principal), 0);
        } else if (inv.type === "mutual_fund" && withinPeriod(inv.startDate, period)) {
          mutualFundPrincipal += num(inv.principal);
        } else if (withinPeriod(inv.startDate, period)) {
          otherPrincipal += num(inv.principal);
        }
      });

      // --- PREPARE ORDINARY ROWS ---
      // Salary rows show their cash gross only. The non-cash Employer PF
      // contribution is aggregated into a single line (sum of pfEmployer from
      // the start of the financial year to date) so the taxable composition is
      // transparent without cluttering the table. The total of all rows equals
      // gross + pfEmployer — the same base the slab calculation uses.
      const totalEmployerPf = summary.salaryRows.reduce((sum, s) => sum + num(s.pfEmployer), 0);
      // Grouped taxable-income breakdown. Each group carries a label, a tint,
      // its child rows, and a live subtotal. Empty groups are dropped before
      // rendering so the list stays clean. The grand total of all group
      // subtotals equals summary.ordinaryIncome (verified by reconciler).
      const groupTints = {
        salary: "#d8f3dc", pf: "#e8f1fb", other: "#fbfdfc", slab: "#fff3e0"
      };
      const sumGroup = rows => rows.reduce((acc, r) => {
        acc.amount += num(r.amount); acc.taxPaid += num(r.taxPaid); return acc;
      }, { amount: 0, taxPaid: 0 });
      const incomeGroups = [
        {
          key: "salary", label: "Salary (gross)", tint: groupTints.salary,
          rows: summary.salaryRows.map(s => ({
            date: s.date, name: s.name,
            amount: num(s.gross), taxPaid: num(s.tds)
          }))
        },
        {
          key: "pf", label: "Employer PF contribution (taxable, non-cash)", tint: groupTints.pf,
          rows: totalEmployerPf > 0 ? [{
            date: "", name: "Total employer PF (FY start to date)",
            amount: totalEmployerPf, taxPaid: 0
          }] : []
        },
        {
          key: "other", label: "Other taxable income (reimbursements, encashment, etc.)", tint: groupTints.other,
          rows: summary.ordinaryTransactions
            .filter(t => t.category !== 'Salary')
            .map(t => ({
              date: t.date, name: `${t.category || 'Income'} — ${t.name}`,
              amount: num(t.taxableAmount ?? t.amount), taxPaid: 0
            }))
        },
        {
          key: "slab", label: "Slab-taxed investment profit (joins the slab base)", tint: groupTints.slab,
          // Slab-taxed investment profit (DPS/FDR/mutual funds etc.) is added
          // into summary.ordinaryIncome, so it must appear here too or the lis
          // sum is short of the taxable total. Source tax on these is a
          // prepayment credit against the slab tax on the profit.
          rows: summary.slabTaxEntries
            .filter(i => num(i.taxableProfit))
            .map(i => ({
              date: i.date, name: i.name,
              amount: num(i.taxableProfit), taxPaid: num(i.taxDeducted)
            }))
        }
      ].map(g => ({ ...g, subtotal: sumGroup(g.rows) }))
       .filter(g => g.rows.length > 0);
      // Flat view kept for the grand-total footer and any other consumer.
      const ordinaryRows = incomeGroups.flatMap(g => g.rows);

      const investmentRows = summary.investmentEntries
        .filter(i => num(i.taxableProfit) || num(i.taxDeducted))
        .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
      // Split by profit tax treatment for the two investment tables below.
      const finalInvestmentRows = investmentRows.filter(i => i.profitTaxMethod !== "slab");
      const slabInvestmentRows = investmentRows.filter(i => i.profitTaxMethod === "slab");

      const slabRows = slabInfo.rows.map(r =>
        <tr>
          <td>${r.label}</td>
          <td class="amount">${r.slice > 0 ? formatBD(r.slice) : "0"}</td>
          <td class="amount">${r.tax > 0 ? formatBD(r.tax) : "0"}</td>
        </tr>
      `).join("");

      const historyRows = taxHistoryPeriods()
        .filter(p => p.label !== period.label)
        .map(p => {
          const h = yearTaxSummary(p);
          return `<tr><td>${p.label}<br><span class="muted">${p.start} to ${p.end}</span></td><td class="amount">${money(h.ordinaryIncome)}</td><td class="amount">${money(h.investmentIncome)}</td><td class="amount">${money(h.totalTax)}</td><td class="amount">${money(h.taxPaid)}</td><td class="amount ${h.taxDue ? "negative" : "positive"}">${h.taxDue ? money(h.taxDue) : money(h.refundable)}</td></tr>`;
        }).join("");

      // ── Shared context passed to every segment helper. All values above are
      // unchanged from the pre-redesign taxView(); only the markup dispatch is new.
      const taxCtx = {
        summary, period, formatBD, taxRules, deduction, taxableIncome, slabInfo,
        grossSlabTax, rp, rebateRateLabel, investmentCapLabel, actualEligibleInvestments, actualRebate,
        maxRebateAllowedBySlab, finalActualRebate, maxPrincipalInvestible,
        absoluteMaxRebate, rebateGapAmount, additionalPrincipalNeeded,
        pfPrincipal, mutualFundPrincipal, otherPrincipal,
        ordinaryRows, incomeGroups, investmentRows, finalInvestmentRows,
        slabInvestmentRows, slabRows, historyRows
      };
      state.taxSeg = state.taxSeg || "summary";
      const segs = [
        { key: "summary", label: "Summary" },
        { key: "breakdown", label: "Breakdown" },
        { key: "investments", label: "Investments" },
        { key: "history", label: "History" }
      ];
      const segBody =
        state.taxSeg === "breakdown" ? taxBreakdownSeg(taxCtx) :
        state.taxSeg === "investments" ? taxInvestmentsSeg(taxCtx) :
        state.taxSeg === "history" ? taxHistorySeg(taxCtx) :
        taxSummarySeg(taxCtx);

      return
        ${taxHeroBand(taxCtx)}
        <div class="tax-segs">
          ${segs.map(s => `<button class="${s.key === state.taxSeg ? "active" : ""}" data-seg="${s.key}">${s.label}</button>`).join("")}
        </div>
        ${segBody}
      `;
    }

    // Persistent hero band — the headline answer, visible in every segment.
    function taxHeroBand(ctx) {
      const { summary, period } = ctx;
      const isDue = summary.taxDue > 0;
      const isRefund = summary.refundable > 0;
      const sideLine = isDue
        ? `<div>TDS paid ${money(summary.salaryTds)}</div><div class="due">Due ${money(summary.taxDue)}</div>
        : isRefund
          ? `<div>Paid in full</div><div class="refund">Refund ${money(summary.refundable)}</div>
          : `<div>Paid in full</div><div class="clear">Nothing due</div>`;
      return
        <div class="tax-hero">
          <div>
            <div class="hero-label">Net payable · ${period.label}</div>
            <div class="hero-value">${money(summary.totalTax)}</div>
          </div>
          <div class="hero-side">${sideLine}</div>
        </div>
      `;
    }

    // Summary segment — mini KPIs + rebate progress + breakdown + gap callout.
    function taxSummarySeg(ctx) {
      const { summary, period, formatBD, slabInfo, grossSlabTax,
              finalActualRebate, absoluteMaxRebate, maxPrincipalInvestible,
              rebateGapAmount, additionalPrincipalNeeded,
              pfPrincipal, mutualFundPrincipal, otherPrincipal,
              rebateRateLabel, investmentCapLabel } = ctx;
      const rebatePct = absoluteMaxRebate > 0
        ? Math.min(100, Math.round((finalActualRebate / absoluteMaxRebate) * 100))
        : 0;
      return
        <div class="tax-mini-kpis">
          <div class="panel"><div>
            <span>Ordinary slab income</span>
            <strong>${money(summary.ordinaryIncome)}</strong>
            <small>${period.start} to ${period.end}${summary.slabInvestmentProfit ? ` · incl. ${money(summary.slabInvestmentProfit)} slab profit` : ""}</small>
          </div></div>
          <div class="panel"><div>
            <span>Final-tax income</span>
            <strong>${money(summary.finalTaxIncome)}</strong>
            <small>Source tax = final tax</small>
          </div></div>
          <div class="panel"><div>
            <span>Total tax for year</span>
            <strong>${money(summary.totalTax)}</strong>
            <small>Slab ${money(grossSlabTax - finalActualRebate)}${summary.finalSourceTax ? ` + final source tax ${money(summary.finalSourceTax)}` : ""}</small>
          </div></div>
        </div>

        <div class="panel">
          <div class="panel-head"><h2>Rebate &amp; tax savings</h2></div>
          <div class="panel-body split-list">
            <div class="rebate-bar">
              <div style="display:flex; justify-content:space-between; font-size:13px;">
                <span>Rebate used</span>
                <strong>${money(finalActualRebate)}</strong>
              </div>
              <div class="track" style="margin-top:6px;"><div class="fill" style="width:${rebatePct}%;"></div></div>
              <div class="cap-row">
                <span>${rebatePct}% of max ${money(absoluteMaxRebate)}</span>
                <span>${rebateGapAmount > 0 ? `gap ${money(rebateGapAmount)}` : "cap reached"}</span>
              </div>
            </div>

            ${syncCard("Max tax saving possible", "3% of your taxable income", money(absoluteMaxRebate))}
            ${syncCard("Actual tax saved", `${rebateRateLabel} of eligible investments (capped at max)`, money(finalActualRebate))}

            <div style="border-top: 1px solid var(--border); padding-top: 10px; margin-top: 10px;">
              <h3 style="font-size: 13px; font-weight: 600; margin-bottom: 6px;">Eligible investments this year</h3>
              <div style="display:flex; justify-content:space-between; font-size:13px; padding:3px 0;">
                <span>Provident Fund (PF)</span><strong>${money(pfPrincipal)}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:13px; padding:3px 0;">
                <span>Mutual Fund</span><strong>${money(mutualFundPrincipal)}</strong>
              </div>
              ${otherPrincipal > 0 ? `<div style="display:flex; justify-content:space-between; font-size:13px; padding:3px 0;"><span>Other eligible</span><strong>${money(otherPrincipal)}</strong></div>` : ""}
              <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:700; padding-top:6px; border-top:1px solid var(--border); margin-top:4px;">
                <span>Total principal invested</span><span>${money(summary.rebateBase)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--muted); padding-top:3px;">
                <span>Max eligible principal (cap, ${investmentCapLabel} of taxable)</span><span>${money(maxPrincipalInvestible)}</span>
              </div>
            </div>

            ${rebateGapAmount > 0 ?
              <div class="notice warning" style="margin-top:10px;">
                <strong>You can save more tax!</strong><br>
                Invest an additional principal of <strong>BDT ${formatBD(additionalPrincipalNeeded)}</strong> in eligible instruments (Sanchayapatra/DPS/PF) to save an additional <strong>BDT ${formatBD(rebateGapAmount)}</strong> in tax.
                <br><br>
                <button data-open="investments" class="primary" style="font-size:12px; padding:4px 12px;">Go to Investments</button>
              </div>
            ` :
              <div class="notice" style="margin-top:10px;">
                <strong>Congratulations!</strong> You've invested the maximum eligible for the tax rebate — saving the full BDT ${formatBD(absoluteMaxRebate)} allowed by law.
              </div>
            `}
          </div>
        </div>
      `;
    }
    // Breakdown segment — two columns: slab-walk ledger | taxable income records.
    function taxBreakdownSeg(ctx) {
      const { summary, formatBD, deduction, taxableIncome, slabInfo,
              grossSlabTax, finalActualRebate, incomeGroups } = ctx;
      const slabLedgerRows = slabInfo.rows.map(r =>
        <div class="lr"><span class="lab">${r.label}</span><span class="amt">${r.slice > 0 ? formatBD(r.slice) : "0"} · ${r.tax > 0 ? formatBD(r.tax) : "0"}</span></div>
      `).join("");
      const grandTotal = incomeGroups.reduce((s, g) => s + g.subtotal.amount, 0);
      const grandTaxPaid = incomeGroups.reduce((s, g) => s + g.subtotal.taxPaid, 0);

      return
        <div class="tax-breakdown-grid">
          <div class="panel">
            <div class="panel-head"><h2>How your tax is built</h2></div>
            <div class="panel-body">
              <div class="tax-ledger">
                <div class="lr"><span class="lab">Ordinary gross income</span><span class="amt">${formatBD(summary.ordinaryIncome)}</span></div>
                <div class="lr minus"><span class="lab">− Standard deduction (1/3, cap 5L)</span><span class="amt">−${formatBD(deduction)}</span></div>
                <div class="div-strong"></div>
                <div class="lr total"><span class="lab">Net taxable ordinary income</span><span class="amt">${formatBD(taxableIncome)}</span></div>
                <div class="sub-h">Slab tax</div>
                ${slabLedgerRows}
                <div class="div"></div>
                <div class="lr total"><span class="lab">Gross slab tax</span><span class="amt">${formatBD(grossSlabTax)}</span></div>
                <div class="lr rebate-line"><span class="lab">− Rebate (eligible investments)</span><span class="amt">−${formatBD(finalActualRebate)}</span></div>
                <div class="div-strong"></div>
                <div class="lr grand-total"><span class="lab">Ordinary slab tax payable</span><span class="amt">${formatBD(grossSlabTax - finalActualRebate)}</span></div>
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head"><h2>Taxable income records</h2></div>
            <div class="panel-body">
              <div style="overflow-x: auto;">
                <table style="width:100%; font-size:12.5px; table-layout:fixed; border-collapse:collapse;">
                  <colgroup>
                    <col style="width:16%"><col style="width:46%"><col style="width:18%"><col style="width:20%">
                  </colgroup>
                  <thead>
                    <tr style="border-bottom:1px solid var(--border);">
                      <th style="text-align:left; padding:6px 8px;">Date</th>
                      <th style="text-align:left; padding:6px 8px;">Description</th>
                      <th style="text-align:right; padding:6px 8px;">Amount (BDT)</th>
                      <th style="text-align:right; padding:6px 8px;">TDS (BDT)</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${incomeGroups.length ? incomeGroups.map(g =>
                      <tr style="background:${g.tint}; border-bottom:1px solid var(--border);">
                        <td colspan="2" style="padding:7px 8px; font-weight:700; font-size:12px; color:var(--text);">${escapeHtml(g.label)}</td>
                        <td class="amount" style="text-align:right; padding:7px 8px; font-weight:700; white-space:nowrap;">${formatBD(g.subtotal.amount)}</td>
                        <td class="amount negative" style="text-align:right; padding:7px 8px; font-weight:700; white-space:nowrap;">${formatBD(g.subtotal.taxPaid)}</td>
                      </tr>
                      ${g.rows.map(r =>
                        <tr style="border-bottom:1px solid var(--border); color:var(--muted); font-size:12px;">
                          <td style="text-align:left; padding:5px 8px 5px 20px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r.date || ""}</td>
                          <td style="text-align:left; padding:5px 8px; word-break:break-word;">↳ ${escapeHtml(r.name || "")}</td>
                          <td class="amount" style="text-align:right; padding:5px 8px; white-space:nowrap;">${money(r.amount)}</td>
                          <td class="amount negative" style="text-align:right; padding:5px 8px; white-space:nowrap; font-weight:600;">${money(r.taxPaid)}</td>
                        </tr>
                      `).join("")}
                    `).join("") : `<tr><td colspan="4" class="empty">No records</td></tr>`}
                  </tbody>
                  ${incomeGroups.length ?
                  <tfoot>
                    <tr style="border-top:2px solid var(--border-strong); font-weight:700;">
                      <td colspan="2" style="text-align:right; padding:10px 8px;">Total taxable ordinary income</td>
                      <td class="amount" style="text-align:right; padding:10px 8px;">${formatBD(grandTotal)}</td>
                      <td class="amount negative" style="text-align:right; padding:10px 8px;">${formatBD(grandTaxPaid)}</td>
                    </tr>
                  </tfoot>` : ""}
                </table>
              </div>
            </div>
          </div>
        </div>
      `;
    }
    // Investments segment — final-tax and slab-taxed profit, stacked vertically.
    function taxInvestmentsSeg(ctx) {
      const { finalInvestmentRows, slabInvestmentRows } = ctx;
      return
        <div class="panel" style="margin-bottom:14px;">
          <div class="panel-head"><h2>Final-tax investments <span style="font-weight:400;color:var(--muted);font-size:11px;">source tax = final tax</span></h2><button data-open="investments">Manage investments</button></div>
          <div class="panel-body">
            ${finalInvestmentRows.length ?
              <div style="overflow-x:auto;">
                <table style="width:100%; font-size:13px;">
                  <thead><tr>
                    <th style="text-align:left;">Date</th>
                    <th style="text-align:left;">Instrument</th>
                    <th style="text-align:right;">Gain (BDT)</th>
                    <th style="text-align:right;">Source Tax (BDT)</th>
                  </tr></thead>
                  <tbody>
                    ${finalInvestmentRows.map(i =>
                      <tr>
                        <td style="text-align:left; white-space:nowrap;">${i.date || ""}</td>
                        <td style="text-align:left; word-break:break-word;"><strong>${i.name}</strong><br><span class="muted">${i.type}</span></td>
                        <td class="amount" style="text-align:right; white-space:nowrap;">${money(i.taxableProfit)}</td>
                        <td class="amount negative" style="text-align:right; white-space:nowrap; font-weight:600;">${money(i.taxDeducted)}</td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            ` : `<div class="empty">No final-tax investment gains for this year.</div>`}
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><h2>Slab-taxed investments <span style="font-weight:400;color:var(--muted);font-size:11px;">profit in slab, source tax = credit</span></h2></div>
          <div class="panel-body">
            ${slabInvestmentRows.length ?
              <div class="notice" style="margin-bottom:10px;">Profit below is included in the ordinary slab income (Breakdown tab). Source tax shown here is a prepayment credit toward the slab tax on that profit.</div>
              <div style="overflow-x:auto;">
                <table style="width:100%; font-size:13px;">
                  <thead><tr>
                    <th style="text-align:left;">Date</th>
                    <th style="text-align:left;">Instrument</th>
                    <th style="text-align:right;">Gain (BDT)</th>
                    <th style="text-align:right;">Source Tax credited (BDT)</th>
                  </tr></thead>
                  <tbody>
                    ${slabInvestmentRows.map(i =>
                      <tr>
                        <td style="text-align:left; white-space:nowrap;">${i.date || ""}</td>
                        <td style="text-align:left; word-break:break-word;"><strong>${i.name}</strong><br><span class="muted">${i.type}</span></td>
                        <td class="amount" style="text-align:right; white-space:nowrap;">${money(i.taxableProfit)}</td>
                        <td class="amount" style="text-align:right; white-space:nowrap; font-weight:600; color:var(--green);">${money(i.taxDeducted)}</td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            ` : `<div class="empty">No slab-taxed investment gains for this year.</div>`}
          </div>
        </div>
      `;
    }
    // History segment — previous-year tax tracker table.
    function taxHistorySeg(ctx) {
      const { historyRows } = ctx;
      return
        <div class="panel">
          <div class="panel-head"><h2>Previous-year tax tracker</h2></div>
          <div class="panel-body">
            <div style="overflow-x:auto;">
              ${historyRows ? `<table><thead><tr>
                <th>Tax year</th><th>Ordinary income</th><th>Investment income</th>
                <th>Total tax</th><th>Paid/credited</th><th>Gap/refund</th>
              </tr></thead><tbody>${historyRows}</tbody></table>` : `<div class="empty">No previous-year tax records found.</div>`}
            </div>
          </div>
        </div>
      `;
    }
    /* ════════════════════════════════════════════════════════════════════════
       PHASE 2/3/4 VIEWS
       automationPanel (P2, sub-tab of Transactions) · budgetsView (P3) ·
       forecastPanel (P4, tab inside Planning)
       ════════════════════════════════════════════════════════════════════════ */

    // ── PHASE 2: Automation sub-tab (embedded in Transactions view) ──
