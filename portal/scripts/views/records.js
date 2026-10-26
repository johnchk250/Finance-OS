    /* ── Period filter for transactions ──
       "current" = the selected AY (default), "<YYYY-YY>" = that specific AY, "all" = no filter.
       Transactions without a usable date are kept when "all" is selected and dropped otherwise. */
    function transactionMatchesPeriod(tx) {
      const sel = state?.settings?.transactionPeriodFilter || "current";
      if (sel === "all") return true;
      const period = sel === "current" ? taxPeriod() : taxPeriodFromLabel(sel);
      return withinPeriod(tx.date, period);
    }

    function tableView(type, search) {
      // Phase 2: Automation sub-tab (only for the transactions view)
      if (type === "transactions" && state.settings.transactionViewTab === "automation") {
        return automationPanel();
      }
      let rows = filterRows(state[type] || [], search);
      if (type === "transactions") {
        const catFilter = state?.settings?.transactionCategoryFilter || "";
        if (catFilter) rows = rows.filter(r => r.category === catFilter);
        const typeFilter = state?.settings?.transactionTypeFilter || "";
        if (typeFilter) rows = rows.filter(r => r.type === typeFilter);
        // Period filter (assessment year) — default to the currently selected AY
        rows = rows.filter(r => transactionMatchesPeriod(r));
        rows = sortTransactions(rows);
      }
      const headers = type === "transactions"
        ? ["Date", "Name", "Type", "Amount", "Linked"]
        : type === "assets"
          ? ["Name", "Type", "Value", "Institution", "Linked"]
          : ["Name", "Type", "Balance", "Due date", "Linked"];
      const typeFilter = state?.settings?.transactionTypeFilter || "";
      let expenseKpiHtml = "";
      if (type === "transactions" && typeFilter === "expense") {
        const periodSel = state?.settings?.transactionPeriodFilter || "current";
        const period = periodSel === "all" ? null : (periodSel === "current" ? taxPeriod() : taxPeriodFromLabel(periodSel));
        const expRows = (state.transactions || []).filter(t => t.type === "expense" && (!period || withinPeriod(t.date, period)));
        const totalExp = expRows.reduce((s, t) => s + num(t.amount), 0);
        const catSumsEx = {};
        expRows.forEach(t => { if (t.category) catSumsEx[t.category] = (catSumsEx[t.category] || 0) + num(t.amount); });
        let topCatEx = "None"; let topCatValEx = 0;
        for (const [c, s] of Object.entries(catSumsEx)) { if (s > topCatValEx) { topCatEx = c; topCatValEx = s; } }
        const monthsWithExpEx = new Set(expRows.map(t => (t.date || "").slice(0, 7)));
        const monthlyAvgEx = monthsWithExpEx.size ? (totalExp / monthsWithExpEx.size) : 0;
        const periodLabelEx = periodSel === "all" ? "all years" : ("AY " + (periodSel === "current" ? (state?.settings?.taxYear || currentTaxYear()) : periodSel));
        expenseKpiHtml = `<div class="kpis-wrap" style="margin-bottom:16px;">
          <div class="kpi-card" style="flex:1;"><div class="kpi-info"><span>Total Expenses</span><strong style="color:var(--red);">${money(totalExp)}</strong><small>For ${escapeHtml(periodLabelEx)}</small></div></div>
          <div class="kpi-card" style="flex:1;"><div class="kpi-info"><span>Top Category</span><strong>${escapeHtml(topCatEx === "None" ? "None" : topCatEx + " (" + money(topCatValEx) + ")")}</strong><small>Highest total spending</small></div></div>
          <div class="kpi-card" style="flex:1;"><div class="kpi-info"><span>Monthly Average</span><strong>${money(monthlyAvgEx)}</strong><small>Based on months with expenses</small></div></div>
        </div>`;
      }
      return
        ${type === "transactions" ? `<div class="seg" id="txViewSeg" style="margin-bottom:12px;"><button type="button" class="seg-btn ${(state.settings.transactionViewTab || "transactions") === "transactions" ? "active" : ""}" data-txview="transactions">Transactions</button><button type="button" class="seg-btn ${state.settings.transactionViewTab === "automation" ? "active" : ""}" data-txview="automation">Automation</button></div>` : ""}
        ${recordTabs(type)}
        ${type === "transactions" ? transactionSortControl() : ""}
        ${expenseKpiHtml}
        <div class="panel"><div class="panel-body">
          ${rows.length ? `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}<th></th></tr></thead><tbody>${rows.map(r => tableRow(type, r)).join("")}</tbody></table>` : empty(type)}
        </div></div>`;
    }


    function valueOfAsset(row, asOfDate = null) {
      const base = num(row?.currentValue || row?.amount || row?.principal);
      if (!Array.isArray(row?.transfers) || !row.transfers.length) return base;
      // Reduce by transfers that occurred on or before asOfDate (or all if no asOfDate)
      const transferred = row.transfers.reduce((sum, tr) => {
        if (asOfDate && tr.date > asOfDate) return sum;
        return sum + num(tr.amount);
      }, 0);
      return Math.max(0, base - transferred);
    }

    function isBeforePeriod(dateStr, period = taxPeriod()) {
      const d = parseDate(dateStr);
      const start = parseDate(period.start);
      if (!d || !start) return false;
      return d < start;
    }

    function openingInvestmentValue(inv, period = taxPeriod()) {
      if (inv.type === "provident_fund" && Array.isArray(inv.pfLedger)) {
        return inv.pfLedger
          .filter(entry => isBeforePeriod(entry.date, period))
          .reduce((sum, entry) => sum + num(entry.currentValue || entry.principal), 0);
      }
      return isBeforePeriod(inv.startDate, period) ? num(inv.currentValue || inv.principal) : 0;
    }

    function periodPayrollPfAdditions(period = taxPeriod()) {
      const pfLedgerPrincipal = (state?.investments || []).reduce((sum, inv) => {
        if (inv.type !== "provident_fund" || !Array.isArray(inv.pfLedger)) return sum;
        return sum + inv.pfLedger
          .filter(entry => withinPeriod(entry.date, period))
          .reduce((s, entry) => s + num(entry.principal), 0);
      }, 0);
      if (pfLedgerPrincipal) return pfLedgerPrincipal;
      return (state?.salary || [])
        .filter(row => withinPeriod(row.date, period))
        .reduce((sum, row) => sum + num(row.pfEmployee) + num(row.pfEmployer), 0);
    }

    function assetFlowAudit() {
      const period = taxPeriod();
      const periodEnd = period.end;
      const txs = state?.transactions || [];
      const periodTxs = txs.filter(t => withinPeriod(t.date, period));
      const cashPeriodTxs = periodTxs.filter(transactionAffectsAccount);
      const manualOpeningAssets = (state?.assets || [])
        .filter(asset => isBeforePeriod(asset.acquiredDate, period))
        .reduce((sum, asset) => sum + valueOfAsset(asset, period.start), 0);
      const openingInvestments = (state?.investments || []).reduce((sum, inv) => sum + openingInvestmentValue(inv, period), 0);
      // Opening account balance = seed balance + all transactions that occurred BEFORE this period
      const openingAccountBalances = (state?.accounts || []).reduce((sum, account) => {
        // Match the credit side (accountId) and, for real A→B transfers, the debi
        // side (fromAccountId) — so a pre-period transfer reduces the source account.
        const preTxs = (state?.transactions || []).filter(t =>
          transactionAffectsAccount(t) && isBeforePeriod(t.date, period) &&
          (t.accountId === account.id || (t.type === "transfer" && t.fromAccountId === account.id))
        );
        let bal = num(account.balance);
        for (const t of preTxs) {
          if (t.type === "transfer") {
            bal += t.accountId === account.id ? num(t.amount) : -num(t.amount);
          } else {
            bal += (t.type === "income") ? num(t.amount) : -num(t.amount);
          }
        }
        return sum + bal;
      }, 0);
      const openingBaseline = manualOpeningAssets + openingInvestments + openingAccountBalances;

      const cashIncome = cashPeriodTxs
        .filter(t => t.type === "income" && t.generatedKind !== "investmentSettlement" && t.generatedKind !== "assetTransfer")
        .reduce((sum, t) => sum + num(t.amount), 0);
      const investmentFundingOut = cashPeriodTxs
        .filter(t => t.type === "expense" && (t.generatedKind === "investmentFunding" || t.category === "Investment contribution"))
        .reduce((sum, t) => sum + num(t.amount), 0);
      const consumptionOut = cashPeriodTxs
        .filter(t => t.type === "expense" && t.generatedKind !== "investmentFunding" && t.generatedKind !== "assetTransfer" && t.category !== "Investment contribution")
        .reduce((sum, t) => sum + num(t.amount), 0);
      const payrollPf = periodPayrollPfAdditions(period);
      const tdsWithheld = (state?.salary || [])
        .filter(row => withinPeriod(row.date, period))
        .reduce((sum, row) => sum + num(row.tds), 0);
      const settlementTransfers = periodTxs
        .filter(t => t.generatedKind === "investmentSettlement")
        .reduce((sum, t) => sum + num(t.amount), 0);

      // Settlement principal + gains returned to cash this period.
      // For each investment closed this period, the FULL net proceeds (principal + profit − source tax)
      // flows back into cash via the settlement transfer. The opening baseline already captured the
      // portion of the principal that existed at period start (openingInvestmentValue), so we add back
      // (netProceeds − openingPrincipal) — the increment over the opening value, NOT clamped to zero,
      // so a loss on withdrawal (netProceeds < openingPrincipal) correctly reduces the bridge too.
      const closedThisPeriod = (state?.investments || [])
        .filter(inv =>
          (inv.status === "withdrawn" || inv.status === "matured") &&
          inv.withdrawalDate &&
          withinPeriod(inv.withdrawalDate, period)
        );
      const settlementGains = closedThisPeriod.reduce((sum, inv) => {
        const openingPrincipal = openingInvestmentValue(inv, period);
        const netProceeds = num(inv.withdrawalNetProceeds) ||
          (num(inv.principalReturned || inv.principal) + num(inv.taxableProfit) - num(inv.taxDeducted));
        return sum + (netProceeds - openingPrincipal);
      }, 0);

      // Same-period funding outflow for investments closed this period.
      // Funding outflows are excluded from consumptionOut (they are internal transfers), which is
      // correct for investments that remain open — the cash leaves the account but the asset value
      // stays in currentInvestments, so it nets out. But when an investment is FUNDED and CLOSED in
      // the same period, the asset value is gone from currentInvestments while the −cash outflow
      // still sits in currentAccounts, and settlementGains only carries the netProceeds. Withou
      // subtracting this same-period funding, the bridge over-counts by the funded principal
      // (a phantom positive variance). We subtract exactly the funding for closed-this-period invs.
      const closedInvIds = new Set(closedThisPeriod.map(inv => inv.id));
      const samePeriodClosedFunding = cashPeriodTxs
        .filter(t => t.type === "expense" && t.generatedKind === "investmentFunding" && closedInvIds.has(t.sourceId))
        .reduce((sum, t) => sum + num(t.amount), 0);

      const currentAccounts = (state?.accounts || []).reduce((sum, account) => sum + accountCurrentBalance(account.id, periodEnd), 0);
      const currentInvestments = (state?.investments || [])
        .filter(inv => {
          const isClosedBeforePeriodEnd =
            (inv.status === "withdrawn" || inv.status === "matured") &&
            inv.withdrawalDate && inv.withdrawalDate <= periodEnd;
          return !isClosedBeforePeriodEnd;
        })
        .reduce((sum, inv) => sum + num(inv.currentValue || inv.principal), 0);
      const currentManualAssets = (state?.assets || []).reduce((sum, asset) => sum + valueOfAsset(asset, periodEnd), 0);
      const currentTotal = currentAccounts + currentInvestments + currentManualAssets;
      const bridgeExpected = openingBaseline + cashIncome + payrollPf - consumptionOut + settlementGains - samePeriodClosedFunding;
      const variance = currentTotal - bridgeExpected;

      const generatedFunding = cashPeriodTxs.filter(t => t.generatedKind === "investmentFunding");
      const cashFundedInvestments = (state?.investments || []).filter(inv => inv.type !== "provident_fund" && inv.fundingMode === "cash_account" && inv.status !== "withdrawn" && inv.status !== "matured");
      const unfundedCurrentInvestments = cashFundedInvestments.filter(inv => !generatedFunding.some(t => t.sourceId === inv.id));
      const pfCashOutflows = cashPeriodTxs.filter(t => t.sourceType === "investments" && t.generatedKind === "investmentFunding" && (state?.investments || []).some(inv => inv.id === t.sourceId && inv.type === "provident_fund"));
      const warnings = [];
      if (unfundedCurrentInvestments.length) warnings.push(`${unfundedCurrentInvestments.length} cash-funded investment(s) have no linked funding outflow yet.`);
      if (pfCashOutflows.length) warnings.push(`${pfCashOutflows.length} PF funding cash outflow(s) found. PF should be payroll-funded only.`);
      if (Math.abs(variance) > 1000) warnings.push(`Bridge variance is ${money(variance)}. Likely causes: missing consumption expenses, unrecorded external funds, valuation changes, or opening asset classification.`);

      // Asset transfer total this period (for display in audit panel)
      const assetTransferTotal = cashPeriodTxs
        .filter(t => t.generatedKind === "assetTransfer")
        .reduce((sum, t) => sum + num(t.amount), 0);

      return {
        period,
        openingBaseline,
        manualOpeningAssets,
        openingInvestments,
        openingAccountBalances,
        cashIncome,
        consumptionOut,
        investmentFundingOut,
        payrollPf,
        tdsWithheld,
        settlementTransfers,
        settlementGains,
        samePeriodClosedFunding,
        assetTransferTotal,
        currentAccounts,
        currentInvestments,
        currentManualAssets,
        currentTotal,
        bridgeExpected,
        variance,
        warnings
      };
    }

    function assetFlowAuditPanel() {
      const a = assetFlowAudit();
      const row = (label, value, note = "") => `<tr><td>${label}${note ? `<br><span class="muted">${note}</span>` : ""}</td><td class="amount">${money(value)}</td></tr>`;
      // Variance badge: how far the bridge estimate is from actual.
      const absVar = Math.abs(a.variance);
      const varianceClass = !a.warnings.length && absVar <= 1000 ? "ok" : (absVar <= 1000 ? "warn" : "alert");
      const varianceLabel = absVar <= 1000 ? "Balanced" : `Variance ${money(absVar)}`;
      const openAttr = a.warnings.length ? "open" : ""; // auto-expand only when there's something to review
      return `<details class="recon" ${openAttr}>
        <summary>
          <h2>Asset flow reconciliation <span class="tchip other" style="font-weight:600;text-transform:none;">${a.period.label}</span></h2>
          <div class="recon-meta">
            <span class="recon-variance ${varianceClass}">${varianceLabel}</span>
            <span class="recon-chevron">▶</span>
          </div>
        </summary>
        <div class="recon-body">
          <div class="notice">Bridge separates opening assets, cash income, real spending, internal investment transfers, and payroll PF so fund movements aren't double-counted.</div>
          <div class="grid two" style="margin-top:12px;">
            <div style="overflow-x:auto;"><table><tbody>
              ${row("Opening baseline", a.openingBaseline, "Manual assets + opening investments + account opening balances")}
              ${row("Cash income (in)", a.cashIncome, "Net of TDS & employee PF withheld at source")}
              ${a.tdsWithheld ? row("TDS withheld at source", -a.tdsWithheld, "Memo only — already excluded from cash income") : ""}
              ${row("Payroll PF additions", a.payrollPf, "Employee + employer PF (non-cash)")}
              ${row("Consumption out (out)", -a.consumptionOut, "Excludes investment contributions")}
              ${a.settlementGains ? row("Settlement gains", a.settlementGains, "Principal + profit after source tax, minus opening value, closed this period") : ""}
              ${a.samePeriodClosedFunding ? row("Same-period closed funding (out)", -a.samePeriodClosedFunding, "Funded & closed within the period — neutralizes cash leg") : ""}
              ${row("Expected assets", a.bridgeExpected)}
              ${row("Actual assets", a.currentTotal, "Accounts + investments + manual assets")}
              ${row("Variance", a.variance)}
            </tbody></table></div>
            <div class="split-list">
              ${syncCard("Investment funding", "Internal cash moved into funds", money(a.investmentFundingOut))}
              ${a.assetTransferTotal ? syncCard("Asset reclassifications", "Moved into liquid accounts — net zero", money(a.assetTransferTotal)) : ""}
              ${syncCard("Current accounts", "Opening balances + transactions", money(a.currentAccounts))}
              ${syncCard("Current investments", "Active investments & PF", money(a.currentInvestments))}
              ${syncCard("Manual assets", "Property & other (after transfers)", money(a.currentManualAssets))}
            </div>
          </div>
          ${a.warnings.length ? `<div class="notice warning" style="margin-top:12px;"><strong>Review needed</strong><br>${a.warnings.map(escapeHtml).join("<br>")}</div>` : ""}
        </div>
      </details>`;
    }
    function assetsView(search) {
      const period = taxPeriod();
      const periodEnd = period.end;

      const activeAccounts = (state?.accounts || []).filter(a => a.active);
      // Investments active during the selected period (started by periodEnd, not closed before it)
      const activeInvestments = (state?.investments || [])
        .filter(i => !i.startDate || i.startDate <= periodEnd)
        .filter(i => {
          const isClosedBeforePeriodEnd =
            (i.status === 'withdrawn' || i.status === 'matured') &&
            i.withdrawalDate && i.withdrawalDate <= periodEnd;
          return !isClosedBeforePeriodEnd;
        });
      const periodAssets = (state?.assets || [])
        .filter(a => !a.acquiredDate || a.acquiredDate <= periodEnd);

      const filteredAccounts = filterRows(activeAccounts, search);
      const filteredInvestments = filterRows(activeInvestments, search);
      const filteredAssets = filterRows(periodAssets, search);
      // Zero-value (fully-transferred) assets are always hidden — no toggle.
      const visibleAssets = filteredAssets.filter(r => valueOfAsset(r, periodEnd) > 0);
      const hiddenZeroAssetCount = filteredAssets.length - visibleAssets.length;

      // Sums scoped to periodEnd
      const liquidAccountsSum = activeAccounts.reduce((s, a) => s + accountCurrentBalance(a.id, periodEnd), 0);
      const activeInvestmentsSum = activeInvestments.reduce((s, i) => s + accruedValue(i, periodEnd), 0);
      const propertiesSum = periodAssets.reduce((s, a) => s + valueOfAsset(a, periodEnd), 0);
      const totalAssets = liquidAccountsSum + activeInvestmentsSum + propertiesSum;

      // Composition bar segments
      const seg = (label, value, color) => {
        const pct = totalAssets > 0 ? (value / totalAssets) * 100 : 0;
        return { label, value, color, pct: Math.max(0, pct) };
      };
      const segments = [
        seg("Liquid", liquidAccountsSum, "#285f91"),
        seg("Invested", activeInvestmentsSum, "#2d6a4f"),
        seg("Other assets", propertiesSum, "#52b788")
      ];
      const pct = v => totalAssets > 0 ? ((v / totalAssets) * 100).toFixed(1) + "%" : "—";
      const typeLabel = t => {
        const map = { savings_certificate: "Savings certificate", provident_fund: "Provident fund", mutual_fund: "Mutual fund", property: "Property", cash: "Cash", bank: "Bank", dps: "DPS", fdr: "FDR" };
        const key = String(t || "").toLowerCase();
        return map[key] || (t ? String(t).replace(/_/g, " ") : "other");
      };
      const typeChip = t => `<span class="tchip ${escapeHtml(String(t || "other").toLowerCase())}">${escapeHtml(typeLabel(t))}</span>`;

      return
        ${recordTabs("assets")}

        <!-- Composition hero -->
        <div class="asset-hero">
          <div class="asset-hero-head">
            <div>
              <h2>Total assets · ${period.label}</h2>
              <span class="muted">${activeAccounts.length + activeInvestments.length + periodAssets.length} holdings</span>
            </div>
            <div class="hero-total">${money(totalAssets)}</div>
          </div>
          <div class="asset-hero-bar">
            ${segments.filter(s => s.value > 0).map(s => `<span style="width:${s.pct}%;background:${s.color};" title="${s.label} ${money(s.value)}"></span>`).join("")}
            ${totalAssets === 0 ? `<span style="width:100%;background:var(--border);"></span>` : ""}
          </div>
          <div class="asset-hero-legend">
            ${segments.map(s => `<div class="leg"><i style="background:${s.color};"></i>${s.label} <strong>${money(s.value)}</strong> <em>${pct(s.value)}</em></div>`).join("")}
          </div>
        </div>

        <!-- Lean KPI cards (share % ties back to hero) -->
        <div class="kpis-wrap" style="margin-bottom:16px;">
          <div class="kpi-card">
            <div class="kpi-info">
              <span>Liquid · Cash & Bank</span>
              <strong>${money(liquidAccountsSum)}</strong>
              <div class="kpi-share"><b>${pct(liquidAccountsSum)}</b> · ${activeAccounts.length} accounts</div>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-info">
              <span>Invested</span>
              <strong>${money(activeInvestmentsSum)}</strong>
              <div class="kpi-share"><b>${pct(activeInvestmentsSum)}</b> · ${activeInvestments.length} holdings</div>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-info">
              <span>Other assets</span>
              <strong>${money(propertiesSum)}</strong>
              <div class="kpi-share"><b>${pct(propertiesSum)}</b> · ${filteredAssets.length} items</div>
            </div>
          </div>
        </div>

        ${assetFlowAuditPanel()}

        <!-- Liquid Accounts -->
        <div class="panel" style="margin-bottom:16px;">
          <div class="panel-head"><h2>Liquid accounts</h2><button data-open="settings">Manage accounts</button></div>
          <div class="panel-body">
            ${filteredAccounts.length ?
              <table>
                <thead><tr><th>Account</th><th>Type</th><th style="text-align:right">Balance</th><th style="text-align:right">Share</th></tr></thead>
                <tbody>
                  ${filteredAccounts.map(a => {
                    const bal = accountCurrentBalance(a.id, periodEnd);
                    return `<tr>
                      <td><strong>${escapeHtml(a.name)}</strong></td>
                      <td>${typeChip(a.type)}</td>
                      <td class="amount positive">${money(bal)}</td>
                      <td class="amount muted">${pct(bal)}</td>
                    </tr>`;
                  }).join("")}
                </tbody>
                <tfoot class="tr-total"><tr><td colspan="2">Total liquid</td><td class="amount">${money(liquidAccountsSum)}</td><td class="amount">100%</td></tr></tfoot>
              </table>
            ` : `<div class="empty">No matching active bank or cash accounts.</div>`}
          </div>
        </div>

        <!-- Active Investments -->
        <div class="panel" style="margin-bottom:16px;">
          <div class="panel-head"><h2>Active investments</h2><button data-open="investments">Manage investments</button></div>
          <div class="panel-body">
            ${filteredInvestments.length ?
              <table>
                <thead><tr><th>Name</th><th>Type</th><th>Institution</th><th style="text-align:right">Value</th><th style="text-align:right">Share</th></tr></thead>
                <tbody>
                  ${filteredInvestments.map(i => {
                    const val = accruedValue(i, periodEnd);
                    return `<tr>
                      <td><strong>${escapeHtml(i.name)}</strong></td>
                      <td>${typeChip(i.type)}</td>
                      <td class="muted">${escapeHtml(i.institution || "—")}</td>
                      <td class="amount positive">${money(val)}</td>
                      <td class="amount muted">${pct(val)}</td>
                    </tr>`;
                  }).join("")}
                </tbody>
                <tfoot class="tr-total"><tr><td colspan="3">Total invested</td><td class="amount">${money(activeInvestmentsSum)}</td><td class="amount">100%</td></tr></tfoot>
              </table>
            ` : `<div class="empty">No matching active savings certificates, DPS, or PF balances.</div>`}
          </div>
        </div>

        <!-- Other Assets -->
        <div class="panel">
          <div class="panel-head"><h2>Other assets ${hiddenZeroAssetCount ? `<span class="muted" style="font-weight:400;font-size:11px;">(${hiddenZeroAssetCount} zero-value hidden)</span>` : ""}</h2><div class="actions"><button data-add="assets">Add asset</button></div></div>
          <div class="panel-body">
            ${visibleAssets.length ?
              <table>
                <thead><tr><th>Name</th><th>Type</th><th>Location</th><th>Linked</th><th style="text-align:right">Value</th><th></th></tr></thead>
                <tbody>
                  ${(function() {
                    // Transfers only from the current-period view; past periods show historical value only.
                    const isCurrentPeriod = period.label === (state?.settings?.taxYear || currentTaxYear());
                    return visibleAssets.map(function(r) {
                      const periodVal = valueOfAsset(r, periodEnd);
                      const realCurrentVal = valueOfAsset(r);
                      const periodTransferredAmt = Array.isArray(r.transfers)
                        ? r.transfers.filter(function(t){ return t.date <= periodEnd; }).reduce(function(s,t){ return s + num(t.amount); }, 0)
                        : 0;
                      const isCashLike = ["cash","bank"].includes(String(r.type||"").toLowerCase());
                      const canTransfer = isCurrentPeriod && isCashLike && realCurrentVal > 0;
                      const transferBadge = periodTransferredAmt > 0
                        ? '<br><span class="muted" style="font-size:11px;">' + money(periodTransferredAmt) + ' moved to accounts</span>'
                        : '';
                      // Build the kebab action set: Transfer (when allowed), Copy, Edit, Delete.
                      const menuActions = [];
                      if (canTransfer) menuActions.push({ transfer: r.id, label: "Reclassify → account" });
                      menuActions.push({ copy: "assets:" + r.id, label: "Copy" });
                      menuActions.push({ edit: "assets:" + r.id, label: "Edit" });
                      menuActions.push({ sep: true });
                      menuActions.push({ delete: "assets:" + r.id, label: "Delete", danger: true });
                      // Past-period cash-like assets can't be transferred — show a note instead of an action.
                      const trailing = (!isCurrentPeriod && isCashLike)
                        ? '<span class="muted" style="font-size:11px;padding:0 6px;" title="Switch to current year to transfer">View only</span>'
                        : '';
                      return '<tr>'
                        + '<td><strong>' + escapeHtml(r.name) + '</strong>' + transferBadge + '</td>'
                        + '<td>' + typeChip(r.type) + '</td>'
                        + '<td class="muted">' + escapeHtml(r.institution || "—") + '</td>'
                        + '<td>' + linkText(r) + '</td>'
                        + '<td class="amount">' + money(periodVal) + '</td>'
                        + '<td><div class="actions">' + trailing + rowMenu(menuActions) + '</div></td>'
                        + '</tr>';
                    }).join("");
                  })()}
                </tbody>
                <tfoot class="tr-total"><tr><td colspan="4">Total other assets</td><td class="amount">${money(propertiesSum)}</td><td></td></tr></tfoot>
              </table>
            ` : empty("assets")}
          </div>
        </div>
      `;
    }

    function sortTransactions(rows) {
      const sortType = state?.settings?.transactionSort || "desc";
      return [...rows].sort((a, b) => {
        if (sortType === "desc") return String(b.date || "").localeCompare(String(a.date || ""));
        if (sortType === "asc") return String(a.date || "").localeCompare(String(b.date || ""));

        if (sortType === "category-asc") return String(a.category || "").localeCompare(String(b.category || ""));
        if (sortType === "category-desc") return String(b.category || "").localeCompare(String(a.category || ""));

        if (sortType === "type-asc") return String(a.type || "").localeCompare(String(b.type || ""));
        if (sortType === "type-desc") return String(b.type || "").localeCompare(String(a.type || ""));

        if (sortType === "amount-desc") return num(b.amount) - num(a.amount);
        if (sortType === "amount-asc") return num(a.amount) - num(b.amount);

        return 0;
      });
    }

    // Map a category name -> its declared type (income/expense/transfer)
    // Uses state.categories first; falls back to the most common type seen in transactions.
    function categoryTypeOf(name) {
      // 1. From declared category definitions
      const def = (state.categories || []).find(c => c.name === name);
      if (def?.type) return def.type;
      // 2. Fallback: derive from actual transactions carrying this category
      const txs = (state.transactions || []).filter(t => t.category === name && t.type);
      if (txs.length) {
        const counts = {};
        txs.forEach(t => { counts[t.type] = (counts[t.type] || 0) + 1; });
        const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        return best[0];
      }
      return "";
    }
    // Categories available for the currently selected transaction Type filter.
    // When a Type is selected, only categories of that type are returned;
    // categories without any type information are excluded (they're ambiguous).
    // When no Type is selected ("All Types"), all are returned.
    function categoriesForTypeFilter(typeFilter) {
      const all = Array.from(new Set((state.transactions || []).map(t => t.category).filter(Boolean)));
      const filtered = typeFilter
        ? all.filter(c => categoryTypeOf(c) === typeFilter)
        : all;
      return filtered.sort();
    }

    function transactionSortControl() {
      const currentTypeFilter = state?.settings?.transactionTypeFilter || "";
      const cats = categoriesForTypeFilter(currentTypeFilter);
      const currentFilter = state?.settings?.transactionCategoryFilter || "";
      // If the saved category filter no longer matches the current Type, it will be shown
      // as "All Categories" to avoid a stale selection that hides every row.
      const filterIsValid = !currentFilter || cats.includes(currentFilter);

      const typeFilterSelect =
        <label style="margin-right: 12px;">Type
          <select id="transactionTypeFilter" style="width:120px; display:inline-block; margin-left:6px;">
            <option value="" ${!currentTypeFilter ? "selected" : ""}>All Types</option>
            <option value="income" ${currentTypeFilter === "income" ? "selected" : ""}>Income</option>
            <option value="expense" ${currentTypeFilter === "expense" ? "selected" : ""}>Expense</option>
            <option value="transfer" ${currentTypeFilter === "transfer" ? "selected" : ""}>Transfer</option>
          </select>
        </label>
      `;
      const filterSelect =
        <label style="margin-right: 12px;">Category filter
          <select id="transactionCategoryFilter" style="width:180px; display:inline-block; margin-left:6px;">
            <option value="">All Categories</option>
            ${cats.map(c => `<option value="${escapeHtml(c)}" ${filterIsValid && currentFilter === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
          </select>
        </label>
      `;

      // Period filter — derive available tax years from transaction dates + current AY
      const currentPeriod = state?.settings?.transactionPeriodFilter || "current";
      const tySet = new Set();
      (state.transactions || []).forEach(t => { if (t.date) tySet.add(taxYearForDate(t.date)); });
      // Build a stable, sorted (newest first) list of assessment years that have data
      const tyOptions = Array.from(tySet).filter(Boolean)
        .sort((a, b) => taxYearStartNumber(b) - taxYearStartNumber(a));
      const periodSelect =
        <label style="margin-right: 12px;">Period
          <select id="transactionPeriodFilter" style="width:140px; display:inline-block; margin-left:6px;" title="Filter transactions by assessment year">
            <option value="current" ${currentPeriod === "current" ? "selected" : ""}>AY ${escapeHtml(state?.settings?.taxYear || currentTaxYear())}</option>
            ${tyOptions.map(y => `<option value="${escapeHtml(y)}" ${currentPeriod === y ? "selected" : ""}>AY ${escapeHtml(y)}</option>`).join("")}
            <option value="all" ${currentPeriod === "all" ? "selected" : ""}>All Years</option>
          </select>
        </label>
      `;

      const currentSort = state?.settings?.transactionSort || "desc";

      return
        <div class="sort-control" style="display: flex; gap: 16px; justify-content: flex-end; align-items: center; flex-wrap: wrap; margin-bottom: 14px;">
          ${periodSelect}
          ${typeFilterSelect}
          ${filterSelect}
          <label>Sort by
            <select id="transactionSort" style="width:180px; display:inline-block; margin-left:6px;">
              <option value="desc" ${currentSort === "desc" ? "selected" : ""}>Date: Newest first</option>
              <option value="asc" ${currentSort === "asc" ? "selected" : ""}>Date: Oldest first</option>
              <option value="category-asc" ${currentSort === "category-asc" ? "selected" : ""}>Category: A to Z</option>
              <option value="category-desc" ${currentSort === "category-desc" ? "selected" : ""}>Category: Z to A</option>
              <option value="type-asc" ${currentSort === "type-asc" ? "selected" : ""}>Type: Income first</option>
              <option value="type-desc" ${currentSort === "type-desc" ? "selected" : ""}>Type: Expense first</option>
              <option value="amount-desc" ${currentSort === "amount-desc" ? "selected" : ""}>Amount: Highest first</option>
              <option value="amount-asc" ${currentSort === "amount-asc" ? "selected" : ""}>Amount: Lowest first</option>
            </select>
          </label>
        </div>
      `;
    }

    function tableRow(type, r) {
      if (type === "transactions") return `<tr><td>${r.date || ""}</td><td><strong>${r.name}</strong><br><span class="muted">${r.category || ""}${transactionAffectsAccount(r) ? "" : " · memo only"}${r.generatedKind === "assetTransfer" ? " · internal reclassification" : ""}</span></td><td>${r.type}</td><td class="amount ${r.type === "expense" ? "negative" : "positive"}">${money(r.amount)}</td><td>${linkText(r)}</td><td>${rowMenu([
        { copy: `transactions:${r.id}`, label: "Copy" },
        { edit: `transactions:${r.id}`, label: "Edit" },
        { convertRecurring: `${r.id}`, label: "Make recurring" },
        { sep: true },
        { delete: `transactions:${r.id}`, label: "Delete", danger: true }
      ])}</td></tr>`;
      if (type === "assets") return `<tr><td><strong>${r.name}</strong></td><td>${r.type}</td><td class="amount">${money(r.currentValue || r.amount)}</td><td>${r.institution || ""}</td><td>${linkText(r)}</td>${rowActions(type, r.id)}</tr>`;
      return `<tr><td><strong>${r.name}</strong></td><td>${r.type}</td><td class="amount negative">${money(liabilityCurrentBalance(r.id))}</td><td>${r.dueDate || ""}</td><td>${linkText(r)}</td>${rowActions(type, r.id)}</tr>`;
    }

    function salaryView(search) {
      const _salPeriod = taxPeriod(); let rows = (state.salary || []).filter(s => withinPeriod(s.date, _salPeriod));
      rows = filterRows(rows, search);
      return
        ${recordTabs("salary")}
        <div class="panel"><div class="panel-head"><h2>Monthly salary components</h2><div class="actions"><button id="quickAddSalaryBtn" class="primary" style="background:var(--blue); border-color:var(--blue)">Quick Add Last Month</button><button data-add="salary">Add Salary</button></div></div>
        <div class="panel-body">${rows.length ? `<table><thead><tr><th>Date</th><th>Month</th><th>Gross</th><th>TDS</th><th>Net</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.date}</td><td><strong>${r.name}</strong><br><span class="muted">Basic ${money(r.basic)}, HRA ${money(r.houseRent)}, medical ${money(r.medical)}</span></td><td class="amount">${money(r.gross)}</td><td class="amount negative">${money(r.tds)}</td><td class="amount positive">${money(num(r.gross) - num(r.tds) - num(r.pfEmployee))}</td>${rowActions("salary", r.id)}</tr>`).join("")}</tbody></table>` : empty("salary")}</div></div>`;
    }

    function expensesView(search) {
      const txs = state?.transactions || [];
      const _expPeriod = taxPeriod(); let rows = txs.filter(t => t.type === "expense" && withinPeriod(t.date, _expPeriod));

      // Calculate KPIs
      const totalExpense = rows.reduce((s, t) => s + num(t.amount), 0);

      const catSums = {};
      rows.forEach(t => {
        if (t.category) {
          catSums[t.category] = (catSums[t.category] || 0) + num(t.amount);
        }
      });
      let topCategory = "None";
      let topCategoryVal = 0;
      for (const [cat, sum] of Object.entries(catSums)) {
        if (sum > topCategoryVal) {
          topCategory = cat;
          topCategoryVal = sum;
        }
      }
      const topCategoryText = topCategory === "None" ? "None" : `${topCategory} (${money(topCategoryVal)})`;

      const monthsWithExpense = new Set(rows.map(t => (t.date || "").slice(0, 7)));
      const monthlyAvg = monthsWithExpense.size ? (totalExpense / monthsWithExpense.size) : 0;

      if (search) {
        rows = filterRows(rows, search);
      }

      const currentFilter = state?.settings?.expenseCategoryFilter || "";
      if (currentFilter) {
        rows = rows.filter(r => r.category === currentFilter);
      }

      const currentSort = state?.settings?.expenseSort || "desc";
      rows.sort((a, b) => {
        if (currentSort === "desc") return String(b.date || "").localeCompare(String(a.date || ""));
        if (currentSort === "asc") return String(a.date || "").localeCompare(String(b.date || ""));
        if (currentSort === "amount-desc") return num(b.amount) - num(a.amount);
        if (currentSort === "amount-asc") return num(a.amount) - num(b.amount);
        if (currentSort === "category-asc") return String(a.category || "").localeCompare(String(b.category || ""));
        if (currentSort === "category-desc") return String(b.category || "").localeCompare(String(a.category || ""));
        return 0;
      });

      const cats = Array.from(new Set(txs.filter(t => t.type === "expense" && withinPeriod(t.date, _expPeriod)).map(t => t.category).filter(Boolean))).sort();

      const filterSelect =
        <label style="margin-right: 12px;">Category filter
          <select id="expenseCategoryFilter" style="width:180px; display:inline-block; margin-left:6px;">
            <option value="">All Categories</option>
            ${cats.map(c => `<option value="${escapeHtml(c)}" ${currentFilter === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
          </select>
        </label>
      `;

      const sortControl =
        <div class="sort-control" style="display: flex; gap: 16px; justify-content: flex-end; align-items: center; flex-wrap: wrap; margin-bottom: 14px;">
          ${typeFilterSelect}
          ${filterSelect}
          <label>Sort by
            <select id="expenseSort" style="width:180px; display:inline-block; margin-left:6px;">
              <option value="desc" ${currentSort === "desc" ? "selected" : ""}>Date: Newest first</option>
              <option value="asc" ${currentSort === "asc" ? "selected" : ""}>Date: Oldest first</option>
              <option value="amount-desc" ${currentSort === "amount-desc" ? "selected" : ""}>Amount: Highest first</option>
              <option value="amount-asc" ${currentSort === "amount-asc" ? "selected" : ""}>Amount: Lowest first</option>
              <option value="category-asc" ${currentSort === "category-asc" ? "selected" : ""}>Category: A to Z</option>
              <option value="category-desc" ${currentSort === "category-desc" ? "selected" : ""}>Category: Z to A</option>
            </select>
          </label>
        </div>
      `;

      const headers = ["Date", "Name", "Category", "Account", "Amount", "Linked"];

      const tabControl = `<div class="tabs">
        <button class="active" data-add="transactions" data-presets='{"type":"expense"}'>Add Expense</button>
        <button data-export-type="expenses">Export Expenses</button>
      </div>`;

      return
        ${tabControl}

        <!-- Summary Cards Grid -->
        <div class="kpis-wrap" style="margin-bottom: 16px;">
          <div class="kpi-card" style="flex: 1;">
            <div class="kpi-info">
              <span>Total Expenses</span>
              <strong style="color: var(--red);">${money(totalExpense)}</strong>
              <small>For tax year ${state?.settings?.taxYear || "current"}</small>
            </div>
            <div class="kpi-visual">
              <div class="kpi-glyph" aria-hidden="true"></div>
            </div>
          </div>
          <div class="kpi-card" style="flex: 1;">
            <div class="kpi-info">
              <span>Top Category</span>
              <strong>${escapeHtml(topCategoryText)}</strong>
              <small>Highest total spending</small>
            </div>
            <div class="kpi-visual">
              <div class="kpi-glyph" aria-hidden="true"></div>
            </div>
          </div>
          <div class="kpi-card" style="flex: 1;">
            <div class="kpi-info">
              <span>Monthly Average</span>
              <strong>${money(monthlyAvg)}</strong>
              <small>Based on months with expenses</small>
            </div>
            <div class="kpi-visual">
              <div class="kpi-glyph" aria-hidden="true"></div>
            </div>
          </div>
        </div>

        ${sortControl}

        <div class="panel"><div class="panel-body">
          ${rows.length ?
            <table>
              <thead>
                <tr>
                  ${headers.map(h => `<th>${h}</th>`).join("")}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r =>
                  <tr>
                    <td>${r.date || ""}</td>
                    <td><strong>${escapeHtml(r.name)}</strong></td>
                    <td><span class="chip">${escapeHtml(r.category || "Uncategorized")}</span></td>
                    <td>${escapeHtml(accountName(r.accountId))}</td>
                    <td class="amount negative">${money(r.amount)}</td>
                    <td>${linkText(r)}</td>
                    ${rowActions("transactions", r.id)}
                  </tr>
                `).join("")}
              </tbody>
            </table>
          ` : `<div class="empty">No expenses found for this tax year.</div>`}
        </div></div>
      `;
    }
