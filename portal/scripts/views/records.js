    /* ── Period filter for transactions ──
       "current" = the selected AY (default), "<YYYY-YY>" = that specific AY, "all" = no filter. */
    let _txRenderLimit = 120;

    function transactionMatchesPeriod(tx) {
      const sel = state?.settings?.transactionPeriodFilter || "current";
      if (sel === "all") return true;
      const period = sel === "current" ? taxPeriod() : taxPeriodFromLabel(sel);
      return withinPeriod(tx.date, period);
    }

    function txTypeBadge(type) {
      const t = String(type || "expense").toLowerCase();
      const cls = t === "income" ? "income" : t === "transfer" ? "transfer" : "expense";
      const label = t === "income" ? "Income" : t === "transfer" ? "Transfer" : "Expense";
      return `<span class="tx-badge ${cls}">${label}</span>`;
    }

    function linkBadge(record) {
      const text = linkText(record);
      return `<span class="link-pill">${escapeHtml(text)}</span>`;
    }

    function tableView(type, search) {
      if (type === "transactions" && state.settings.transactionViewTab === "automation") {
        return automationPanel();
      }
      let rows = filterRows(state[type] || [], search);
      if (type === "transactions") {
        const catFilter = state?.settings?.transactionCategoryFilter || "";
        if (catFilter) rows = rows.filter(r => r.category === catFilter);
        const typeFilter = state?.settings?.transactionTypeFilter || "";
        if (typeFilter) rows = rows.filter(r => r.type === typeFilter);
        rows = rows.filter(r => transactionMatchesPeriod(r));
        rows = sortTransactions(rows);
      }

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

      const totalCount = rows.length;
      const visibleRows = type === "transactions" && totalCount > _txRenderLimit
        ? rows.slice(0, _txRenderLimit)
        : rows;
      const hasMore = totalCount > visibleRows.length;

      const headerRow = type === "transactions"
        ? `<tr>
            <th class="col-date">Date</th>
            <th class="col-main">Description</th>
            <th class="col-type">Type</th>
            <th class="col-num">Amount</th>
            <th class="col-link">Source</th>
            <th class="col-act"></th>
          </tr>`
        : type === "assets"
          ? `<tr>
              <th class="col-main">Name</th>
              <th class="col-type">Type</th>
              <th class="col-num">Value</th>
              <th>Institution</th>
              <th class="col-link">Source</th>
              <th class="col-act"></th>
            </tr>`
          : `<tr>
              <th class="col-main">Name</th>
              <th class="col-type">Type</th>
              <th class="col-num">Balance</th>
              <th class="col-date">Due date</th>
              <th class="col-link">Source</th>
              <th class="col-act"></th>
            </tr>`;

      return `
        ${recordTabs(type)}
        ${expenseKpiHtml}
        <div class="panel">
          ${type === "transactions" ? transactionSortControl(totalCount) : ""}
          <div class="panel-body" style="padding:0;">
            ${visibleRows.length ? `<table class="data-table"><thead>${headerRow}</thead><tbody>${visibleRows.map(r => tableRow(type, r)).join("")}</tbody></table>` : `<div style="padding:16px;">${empty(type)}</div>`}
            ${hasMore ? `<div style="text-align:center;padding:12px 16px;border-top:1px solid var(--border);"><button type="button" id="loadMoreTxBtn" class="secondary">Show more (${totalCount - visibleRows.length} remaining)</button></div>` : ""}
          </div>
        </div>`;
    }


    function valueOfAsset(row, asOfDate = null) {
      const base = num(row?.currentValue || row?.amount || row?.principal);
      if (!Array.isArray(row?.transfers) || !row.transfers.length) return base;
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
      const openingAccountBalances = (state?.accounts || []).reduce((sum, account) => {
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
      const absVar = Math.abs(a.variance);
      const varianceClass = !a.warnings.length && absVar <= 1000 ? "ok" : (absVar <= 1000 ? "warn" : "alert");
      const varianceLabel = absVar <= 1000 ? "Balanced" : `Variance ${money(absVar)}`;
      const openAttr = a.warnings.length ? "open" : "";
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
            <div style="overflow-x:auto;"><table class="data-table"><tbody>
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
      const visibleAssets = filteredAssets.filter(r => valueOfAsset(r, periodEnd) > 0);
      const hiddenZeroAssetCount = filteredAssets.length - visibleAssets.length;

      const liquidAccountsSum = activeAccounts.reduce((s, a) => s + accountCurrentBalance(a.id, periodEnd), 0);
      const activeInvestmentsSum = activeInvestments.reduce((s, i) => s + accruedValue(i, periodEnd), 0);
      const propertiesSum = periodAssets.reduce((s, a) => s + valueOfAsset(a, periodEnd), 0);
      const totalAssets = liquidAccountsSum + activeInvestmentsSum + propertiesSum;

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

      return `
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

        <div class="kpis-wrap" style="margin-bottom:16px;">
          <div class="kpi-card">
            <div class="kpi-info">
              <span>Liquid · Cash &amp; Bank</span>
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
          <div class="panel-body" style="padding:0;">
            ${filteredAccounts.length ? `
              <table class="data-table">
                <thead><tr><th>Account</th><th>Type</th><th class="col-num">Balance</th><th class="col-num">Share</th></tr></thead>
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
            ` : `<div style="padding:16px;"><div class="empty">No matching active bank or cash accounts.</div></div>`}
          </div>
        </div>

        <!-- Active Investments -->
        <div class="panel" style="margin-bottom:16px;">
          <div class="panel-head"><h2>Active investments</h2><button data-open="investments">Manage investments</button></div>
          <div class="panel-body" style="padding:0;">
            ${filteredInvestments.length ? `
              <table class="data-table">
                <thead><tr><th>Name</th><th>Type</th><th>Institution</th><th class="col-num">Value</th><th class="col-num">Share</th></tr></thead>
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
            ` : `<div style="padding:16px;"><div class="empty">No matching active savings certificates, DPS, or PF balances.</div></div>`}
          </div>
        </div>

        <!-- Other Assets -->
        <div class="panel">
          <div class="panel-head"><h2>Other assets ${hiddenZeroAssetCount ? `<span class="muted" style="font-weight:400;font-size:11px;">(${hiddenZeroAssetCount} zero-value hidden)</span>` : ""}</h2><div class="actions"><button data-add="assets">Add asset</button></div></div>
          <div class="panel-body" style="padding:0;">
            ${visibleAssets.length ? `
              <table class="data-table">
                <thead><tr><th>Name</th><th>Type</th><th>Location</th><th class="col-link">Source</th><th class="col-num">Value</th><th class="col-act"></th></tr></thead>
                <tbody>
                  ${(function() {
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
                      const menuActions = [];
                      if (canTransfer) menuActions.push({ transfer: r.id, label: "Reclassify → account" });
                      menuActions.push({ copy: "assets:" + r.id, label: "Copy" });
                      menuActions.push({ edit: "assets:" + r.id, label: "Edit" });
                      menuActions.push({ sep: true });
                      menuActions.push({ delete: "assets:" + r.id, label: "Delete", danger: true });
                      const trailing = (!isCurrentPeriod && isCashLike)
                        ? '<span class="muted" style="font-size:11px;padding:0 6px;" title="Switch to current year to transfer">View only</span>'
                        : '';
                      return '<tr>'
                        + '<td><strong>' + escapeHtml(r.name) + '</strong>' + transferBadge + '</td>'
                        + '<td>' + typeChip(r.type) + '</td>'
                        + '<td class="muted">' + escapeHtml(r.institution || "—") + '</td>'
                        + '<td>' + linkBadge(r) + '</td>'
                        + '<td class="amount">' + money(periodVal) + '</td>'
                        + '<td class="col-act"><div class="actions" style="justify-content:flex-end;">' + trailing + rowMenu(menuActions) + '</div></td>'
                        + '</tr>';
                    }).join("");
                  })()}
                </tbody>
                <tfoot class="tr-total"><tr><td colspan="4">Total other assets</td><td class="amount">${money(propertiesSum)}</td><td></td></tr></tfoot>
              </table>
            ` : `<div style="padding:16px;">${empty("assets")}</div>`}
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

    function categoryTypeOf(name) {
      const def = (state.categories || []).find(c => c.name === name);
      if (def?.type) return def.type;
      const txs = (state.transactions || []).filter(t => t.category === name && t.type);
      if (txs.length) {
        const counts = {};
        txs.forEach(t => { counts[t.type] = (counts[t.type] || 0) + 1; });
        const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        return best[0];
      }
      return "";
    }

    function categoriesForTypeFilter(typeFilter) {
      const all = Array.from(new Set((state.transactions || []).map(t => t.category).filter(Boolean)));
      const filtered = typeFilter
        ? all.filter(c => categoryTypeOf(c) === typeFilter)
        : all;
      return filtered.sort();
    }

    function transactionSortControl(totalCount = 0) {
      const currentTypeFilter = state?.settings?.transactionTypeFilter || "";
      const cats = categoriesForTypeFilter(currentTypeFilter);
      const currentFilter = state?.settings?.transactionCategoryFilter || "";
      const filterIsValid = !currentFilter || cats.includes(currentFilter);

      const currentPeriod = state?.settings?.transactionPeriodFilter || "current";
      const activeAy = state?.settings?.taxYear || currentTaxYear();
      const tySet = new Set();
      (state.transactions || []).forEach(t => { if (t.date) tySet.add(taxYearForDate(t.date)); });
      // Exclude activeAy from tyOptions so the active AY never appears twice in the dropdown!
      const tyOptions = Array.from(tySet)
        .filter(y => y && y !== activeAy)
        .sort((a, b) => taxYearStartNumber(b) - taxYearStartNumber(a));

      const currentSort = state?.settings?.transactionSort || "desc";

      return `
        <div class="filter-bar">
          <div class="filter-bar-left">
            <span class="filter-count"><strong>${totalCount}</strong> ${totalCount === 1 ? "record" : "records"}</span>
          </div>
          <div class="filter-bar-controls">
            <div class="filter-field">
              <span class="filter-label">Period</span>
              <select id="transactionPeriodFilter" title="Filter transactions by assessment year">
                <option value="current" ${currentPeriod === "current" || currentPeriod === activeAy ? "selected" : ""}>AY ${escapeHtml(activeAy)} (Active)</option>
                ${tyOptions.map(y => `<option value="${escapeHtml(y)}" ${currentPeriod === y ? "selected" : ""}>AY ${escapeHtml(y)}</option>`).join("")}
                <option value="all" ${currentPeriod === "all" ? "selected" : ""}>All Years</option>
              </select>
            </div>
            <div class="filter-field">
              <span class="filter-label">Type</span>
              <select id="transactionTypeFilter">
                <option value="" ${!currentTypeFilter ? "selected" : ""}>All Types</option>
                <option value="income" ${currentTypeFilter === "income" ? "selected" : ""}>Income</option>
                <option value="expense" ${currentTypeFilter === "expense" ? "selected" : ""}>Expense</option>
                <option value="transfer" ${currentTypeFilter === "transfer" ? "selected" : ""}>Transfer</option>
              </select>
            </div>
            <div class="filter-field">
              <span class="filter-label">Category</span>
              <select id="transactionCategoryFilter">
                <option value="">All Categories</option>
                ${cats.map(c => `<option value="${escapeHtml(c)}" ${filterIsValid && currentFilter === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
              </select>
            </div>
            <div class="filter-field">
              <span class="filter-label">Sort</span>
              <select id="transactionSort">
                <option value="desc" ${currentSort === "desc" ? "selected" : ""}>Date: Newest first</option>
                <option value="asc" ${currentSort === "asc" ? "selected" : ""}>Date: Oldest first</option>
                <option value="amount-desc" ${currentSort === "amount-desc" ? "selected" : ""}>Amount: High → Low</option>
                <option value="amount-asc" ${currentSort === "amount-asc" ? "selected" : ""}>Amount: Low → High</option>
                <option value="category-asc" ${currentSort === "category-asc" ? "selected" : ""}>Category: A → Z</option>
                <option value="category-desc" ${currentSort === "category-desc" ? "selected" : ""}>Category: Z → A</option>
                <option value="type-asc" ${currentSort === "type-asc" ? "selected" : ""}>Type: Income first</option>
                <option value="type-desc" ${currentSort === "type-desc" ? "selected" : ""}>Type: Expense first</option>
              </select>
            </div>
          </div>
        </div>
      `;
    }

    function tableRow(type, r) {
      if (type === "transactions") return `<tr>
        <td class="col-date">${r.date || ""}</td>
        <td class="col-main"><strong>${escapeHtml(r.name)}</strong><div class="row-sub">${escapeHtml(r.category || "Uncategorized")}${transactionAffectsAccount(r) ? "" : " · memo only"}${r.generatedKind === "assetTransfer" ? " · internal reclassification" : ""}</div></td>
        <td class="col-type">${txTypeBadge(r.type)}</td>
        <td class="amount col-num ${r.type === "expense" ? "negative" : "positive"}">${money(r.amount)}</td>
        <td class="col-link">${linkBadge(r)}</td>
        <td class="col-act">${rowMenu([
          { copy: `transactions:${r.id}`, label: "Copy" },
          { edit: `transactions:${r.id}`, label: "Edit" },
          { convertRecurring: `${r.id}`, label: "Make recurring" },
          { sep: true },
          { delete: `transactions:${r.id}`, label: "Delete", danger: true }
        ])}</td>
      </tr>`;
      if (type === "assets") return `<tr>
        <td class="col-main"><strong>${escapeHtml(r.name)}</strong></td>
        <td class="col-type"><span class="tchip ${escapeHtml(String(r.type || "other").toLowerCase())}">${escapeHtml(r.type || "asset")}</span></td>
        <td class="amount col-num">${money(r.currentValue || r.amount)}</td>
        <td class="muted">${escapeHtml(r.institution || "—")}</td>
        <td class="col-link">${linkBadge(r)}</td>
        ${rowActions(type, r.id)}
      </tr>`;
      return `<tr>
        <td class="col-main"><strong>${escapeHtml(r.name)}</strong></td>
        <td class="col-type"><span class="tchip other">${escapeHtml(r.type || "liability")}</span></td>
        <td class="amount col-num negative">${money(liabilityCurrentBalance(r.id))}</td>
        <td class="col-date">${r.dueDate || "—"}</td>
        <td class="col-link">${linkBadge(r)}</td>
        ${rowActions(type, r.id)}
      </tr>`;
    }

    function salaryView(search) {
      const _salPeriod = taxPeriod();
      let rows = (state.salary || []).filter(s => withinPeriod(s.date, _salPeriod));
      rows = filterRows(rows, search);
      return `
        ${recordTabs("salary")}
        <div class="panel">
          <div class="panel-head">
            <h2>Monthly salary components · ${_salPeriod.label}</h2>
            <div class="actions">
              <button id="quickAddSalaryBtn" class="secondary">Quick Clone Last Month</button>
              <button data-add="salary" class="primary">Add Salary</button>
            </div>
          </div>
          <div class="panel-body" style="padding:0;">
            ${rows.length ? `<table class="data-table"><thead><tr><th class="col-date">Date</th><th class="col-main">Month &amp; Breakdown</th><th class="col-num">Gross</th><th class="col-num">TDS</th><th class="col-num">Net Pay</th><th class="col-act"></th></tr></thead><tbody>${rows.map(r => `<tr><td class="col-date">${r.date}</td><td class="col-main"><strong>${escapeHtml(r.name)}</strong><div class="row-sub">Basic ${money(r.basic)} · HRA ${money(r.houseRent)} · Med ${money(r.medical)}</div></td><td class="amount col-num">${money(r.gross)}</td><td class="amount col-num negative">${money(r.tds)}</td><td class="amount col-num positive">${money(num(r.gross) - num(r.tds) - num(r.pfEmployee))}</td>${rowActions("salary", r.id)}</tr>`).join("")}</tbody></table>` : `<div style="padding:16px;">${empty("salary")}</div>`}
          </div>
        </div>`;
    }
