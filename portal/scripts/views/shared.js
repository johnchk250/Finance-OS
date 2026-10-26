    function daysBetween(dateStr, fallbackDays = null) {
      const d = parseDate(dateStr);
      if (!d) return fallbackDays;
      const now = new Date();
      const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return Math.floor((todayOnly - dateOnly) / 86400000);
    }

    function continuityHealthItems() {
      const period = taxPeriod();
      const items = [];
      const latestSalary = [...(state?.salary || [])].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
      const salaryAge = latestSalary ? daysBetween(latestSalary.date) : null;
      items.push(latestSalary
        ? { level: salaryAge > 45 ? "warn" : "ok", title: "Salary continuation", text: `Latest salary record is ${latestSalary.date}. ${salaryAge > 45 ? "Add the next month or use quick clone so forecasts and tax stay current." : "Monthly salary flow looks current."}` }
        : { level: "warn", title: "Salary continuation", text: "No salary records yet. Add salary rows or import payslip summaries to drive tax and cash-flow views." });

      const currentExpenses = (state?.transactions || []).filter(t => t.type === "expense" && withinPeriod(t.date, period));
      items.push(currentExpenses.length
        ? { level: "ok", title: "Expense blending", text: `${currentExpenses.length} expense records feed ${period.label} cash flow, lifestyle, and reports.` }
        : { level: "warn", title: "Expense blending", text: `No expense records found for ${period.label}. Add monthly expenses or import a statement to avoid overstated savings.` });

      const hasSlabs = Boolean(state?.settings?.yearlyTaxSlabs?.[period.label]);
      const hasRules = Boolean(state?.settings?.yearlyTaxRules?.[period.label]);
      items.push({ level: hasSlabs && hasRules ? "ok" : "warn", title: "Tax rules versioning", text: hasSlabs && hasRules ? `${period.label} has its own slabs, deduction, and rebate rules.` : `${period.label} is using copied defaults. Review slabs, deduction, and rebate rules before filing.` });

      const openMaturities = (state?.investments || []).filter(i => i.maturityDate && i.status !== "matured" && i.status !== "withdrawn" && daysBetween(i.maturityDate, -999) >= 0);
      items.push(openMaturities.length
        ? { level: "warn", title: "Investment lifecycle", text: `${openMaturities.length} investment(s) have reached maturity date. Settle them so proceeds, source tax, and accounts sync.` }
        : { level: "ok", title: "Investment lifecycle", text: "No overdue investment maturities detected." });

      // Phase 2 sync checks
      const unsyncedSalary = (state?.salary || []).filter(s =>
        !(state?.transactions || []).some(t => t.sourceType === "salary" && t.sourceId === s.id && t.generatedKind === "salaryNet")
      );
      items.push(unsyncedSalary.length
        ? { level: "warn", title: "Salary → Transaction sync", text: `${unsyncedSalary.length} salary row(s) have no linked net-salary transaction. Save or re-save those salary records to auto-generate them.` }
        : { level: "ok", title: "Salary → Transaction sync", text: "All salary rows are linked to auto-generated transactions. No manual salary income entry needed." });

      const linkedLiabTxs = (state?.transactions || []).filter(t => t.linkedLiabilityId);
      items.push(linkedLiabTxs.length
        ? { level: "ok", title: "Liability repayments", text: `${linkedLiabTxs.length} transaction(s) tagged to liabilities. Outstanding balances are dynamically computed.` }
        : { level: "info", title: "Liability repayments", text: "No transactions are tagged to a liability yet. Use the 'Linked liability' field when adding loan EMI/repayment expenses so balances auto-update." });

      items.push({ level: "info", title: "External sync", text: "This is a standalone offline HTML app. Bank, NBR/tax, and market rates are not live-synced until you connect an import workflow or backend connector." });
      items.push({ level: "info", title: "Portable backup", text: state?.settings?.lastUpdatedAt ? `Last local update: ${new Date(state.settings.lastUpdatedAt).toLocaleString()}. Use Save Portable HTML after important changes.` : "Use Save Portable HTML after important changes so the embedded file carries your latest data." });
      return items;
    }

    function continuityHealthPanel() {
      const items = continuityHealthItems();
      const badge = level => level === "ok" ? "Ready" : level === "warn" ? "Needs review" : "Info";
      return `<div class="panel" style="margin-top:14px; grid-column:1 / -1;">
        <div class="panel-head"><h2>Continuity Health</h2><button data-open="reports">Open reports</button></div>
        <div class="panel-body">
          <div class="notice">Long-term reliability checks for stale records, year-specific tax rules, account blending, and manual-sync assumptions.</div>
          <div class="split-list">
            ${items.map(item => `<div class="row-card"><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></div><span class="chip ${item.level === "warn" ? "negative" : item.level === "ok" ? "positive" : ""}">${badge(item.level)}</span></div>`).join("")}
          </div>
        </div>
      </div>`;
    }
    function continuityHealthPanelInner() {
      const items = continuityHealthItems();
      const badge = level => level === "ok" ? "Ready" : level === "warn" ? "Needs review" : "Info";
      return
        <div class="set-head"><div class="set-ic">💓</div><div><div class="set-title">Continuity Health</div><div class="set-sub">Long-term reliability checks for stale records, year-specific tax rules &amp; sync assumptions</div></div><button data-open="reports" style="margin-left:auto;">Open reports</button></div>
        <div class="set-body">
          <div class="split-list">
            ${items.map(item => `<div class="row-card"><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></div><span class="chip ${item.level === "warn" ? "negative" : item.level === "ok" ? "positive" : ""}">${badge(item.level)}</span></div>`).join("")}
          </div>
        </div>`;
    }
    function recordTabs(type) {
      return `<div class="tabs"><button class="active" data-add="${type}">Add ${labelFor(type)}</button><button data-export-type="${type}">Export ${labelFor(type)}</button></div>`;
    }

    function labelFor(type) {
      return ({ transactions: "Transaction", salary: "Salary", assets: "Asset", liabilities: "Liability", investments: "Investment", taxPayments: "Tax Payment", planning: "Goal", goals: "Goal" })[type] || type;
    }

    function empty(type) {
      return `<div class="empty">No ${labelFor(type).toLowerCase()} records yet. Add one when you are ready.</div>`;
    }

    function filterRows(rows, search) {
      if (!search) return rows;
      return rows.filter(row => searchableText(row).includes(search));
    }

    function globalSearchView(search) {
      const results = searchRecords(search);
      return
        <div class="search-summary">
          <div><strong>Search results</strong><br><span>${results.length} match${results.length === 1 ? "" : "es"} for "${escapeHtml(search)}" across every active finance module.</span></div>
          <button id="clearSearchInline">Clear search</button>
        </div>
        ${results.length ? `<div class="search-results">${results.map(searchResultCard).join("")}</div>` : `<div class="panel"><div class="empty">No records match "${escapeHtml(search)}". Try a month, amount, account, document name, tax year, or instrument type.</div></div>`}
      `;
    }

    function searchRecords(search) {
      const tables = [
        ["transactions", "Transactions", "transactions"],
        ["salary", "Salary", "salary"],
        ["assets", "Assets", "assets"],
        ["liabilities", "Liabilities", "liabilities"],
        ["investments", "Investments", "investments"],
        ["taxPayments", "Tax", "tax"],
        ["goals", "Planning", "planning"],
        ["accounts", "Accounts", "settings"],
        ["categories", "Categories", "settings"]
      ];
      const active = state?.settings?.activeModules || {};
      return tables.flatMap(([key, label, view]) => {
        if (active[view] === false) return [];
        return (state[key] || []).map(row => {
          const text = searchableText(row);
          const index = text.indexOf(search);
          if (index < 0) return null;
          return {
            key,
            label,
            view,
            row,
            score: scoreSearchMatch(row, search, index),
            snippet: makeSearchSnippet(row, search)
          };
        }).filter(Boolean);
      }).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, 80);
    }

    function scoreSearchMatch(row, search, index) {
      const name = String(row.name || row.fileName || row.type || "").toLowerCase();
      let score = 100 - Math.min(index, 80);
      if (name.includes(search)) score += 75;
      if (String(row.id || "").toLowerCase() === search) score += 100;
      if (String(row.date || row.startDate || row.taxYear || "").toLowerCase().includes(search)) score += 25;
      return score;
    }

    function searchResultCard(result) {
      const row = result.row;
      const title = row.name || row.fileName || row.type || row.id || "Untitled record";
      const amount = row.amount ?? row.currentValue ?? row.balance ?? row.principal ?? row.gross ?? row.target;
      const date = row.date || row.startDate || row.acquiredDate || row.targetDate || row.taxYear || "";
      const type = row.type || row.category || "";
      const meta = [result.label, type, date, amount !== undefined && amount !== "" ? money(amount) : ""].filter(Boolean);
      const editableTables = new Set(["transactions", "salary", "assets", "liabilities", "investments", "taxPayments", "goals"]);
      const canEdit = editableTables.has(result.key) && row.id;
      // Secondary Copy/Edit actions fold into a kebab; "Open" stays explicit as the primary action.
      const searchMenuActions = [];
      if (canEdit) {
        searchMenuActions.push({ copy: `${result.key}:${row.id}`, label: "Copy" });
        searchMenuActions.push({ edit: `${result.key}:${row.id}`, label: "Edit" });
      }
      return
        <div class="search-card">
          <div>
            <div class="search-meta">${meta.map(item => `<span>${escapeHtml(item)}</span>`).join("")}</div>
            <h3>${highlightText(title, q("globalSearch").value.trim())}</h3>
            <div class="search-snippet">${highlightText(result.snippet, q("globalSearch").value.trim())}</div>
          </div>
          <div class="actions">
            <button data-open="${result.view}" data-clear-search="true">Open</button>
            ${searchMenuActions.length ? rowMenu(searchMenuActions) : ""}
          </div>
        </div>`;
    }

    function searchableText(row) {
      try { return JSON.stringify(row || {}).toLowerCase(); }
      catch { return Object.entries(row || {}).map(([key, value]) => `${key} ${String(value ?? "")}`).join(" ").toLowerCase(); }
    }

    function makeSearchSnippet(row, search) {
      const parts = [row.name, row.fileName, row.category, row.institution, row.type, row.date, row.taxYear, row.extracted, row.notes]
        .filter(value => value !== undefined && value !== null && String(value).trim() !== "")
        .map(String);
      const text = parts.join(" | ") || JSON.stringify(row);
      const lower = text.toLowerCase();
      const index = lower.indexOf(search);
      if (index < 0) return text.slice(0, 180);
      const start = Math.max(0, index - 65);
      const end = Math.min(text.length, index + search.length + 95);
      return `${start > 0 ? "... " : ""}${text.slice(start, end)}${end < text.length ? " ..." : ""}`;
    }

    function highlightText(text, term) {
      const safe = escapeHtml(text ?? "");
      if (!term) return safe;
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return safe.replace(new RegExp(escapedTerm, "ig"), match => `<mark>${match}</mark>`);
    }

    function rowActions(type, id) {
      // Kept for any external callers; renders a kebab menu of Copy/Edit/Delete.
      return `<td>${rowMenu([
        { copy: `${type}:${id}`, label: "Copy" },
        { edit: `${type}:${id}`, label: "Edit" },
        { sep: true },
        { delete: `${type}:${id}`, label: "Delete", danger: true }
      ])}</td>`;
    }

    // Render a per-row kebab (⋯) overflow menu. Each action is a plain object:
    //   { copy: "type:id", label: "Copy" }          → data-copy attribute
    //   { edit: "type:id", label: "Edit" }          → data-edi
    //   { delete: "type:id", label: "Delete", danger: true } → data-delete
    //   { settle: "id", label: "Withdraw/Mature" }  → data-settle
    //   { transfer: "id", label: "Reclassify → account" } → data-asset-transfer
    //   { pfEdit / pfCopy / pfDelete: "invId:entryId" }
    //   { sep: true }                               → divider
    // The buttons carry the SAME data-* attributes the existing handlers bind,
    // so no handler logic changes — the menu is purely presentational.
    function rowMenu(actions) {
      const items = actions.map(a => {
        if (a.sep) return `<div class="menu-sep"></div>`;
        // Pick whichever action key is present and emit the matching data-* attribute.
        const map = [
          ["copy", "data-copy"], ["edit", "data-edit"], ["delete", "data-delete"],
          ["settle", "data-settle"], ["transfer", "data-asset-transfer"],
          ["pfCopy", "data-pf-copy"], ["pfEdit", "data-pf-edit"], ["pfDelete", "data-pf-delete"],
          ["convertRecurring", "data-convert-recurring"]
        ];
        let attr = "";
        for (const [key, attrName] of map) {
          if (a[key] !== undefined) { attr = `${attrName}="${a[key]}"`; break; }
        }
        return `<button ${attr} class="${a.danger ? "danger" : ""}">${a.label}</button>`;
      }).join("");
      return `<div class="row-menu-wrap">
        <button class="row-kebab" type="button" aria-label="Row actions">⋯</button>
        <div class="row-menu">${items}</div>
      </div>`;
    }

    function accountName(accountId) {
      return (state?.accounts || []).find(a => a.id === accountId)?.name || "account";
    }

    function investmentTaxDate(investment) {
      // Closed investment: use the actual settlement/profit date
      if (investment?.withdrawalDate) return investment.withdrawalDate;
      if (investment?.profitDate)     return investment.profitDate;
      // Active investment: attribute profit to end of current tax year, not startDate.
      // Using startDate would put active investment profits in the wrong tax year.
      return taxPeriod().end || today;
    }

    function linkText(record) {
      const bits = [];
      if (record.documentId) bits.push("doc");
      if (record.sourceType) bits.push(record.sourceType);
      if (record.linkedType) bits.push(record.linkedType);
      return bits.length ? bits.join(", ") : "manual";
    }


    // ── ASSET TRANSFER FEATURE ──

    function openAssetTransfer(assetId) {
      editing = { type: "assetTransfer", id: assetId };
      const asset = (state?.assets || []).find(a => a.id === assetId);
      if (!asset) return;
      q("drawerTitle").textContent = `Reclassify "${asset.name}" → Account (asset conversion)`;
      q("drawerBody").innerHTML = assetTransferFormFor(asset);
      q("drawer").classList.add("open");
      q("drawer").setAttribute("aria-hidden", "false");
      q("recordForm").onsubmit = saveAssetTransfer;
    }

    function assetTransferFormFor(asset) {
      const remaining = valueOfAsset(asset);
      const accounts = (state?.accounts || []).map(a =>
        `<option value="${a.id}">${escapeHtml(a.name)} (${a.type})</option>
      ).join("");
      const existingTransfers = Array.isArray(asset.transfers) ? asset.transfers : [];
      const historyHtml = existingTransfers.length ?
        <div class="settlement-card" style="margin-top:8px;">
          <strong>Previous reclassifications from this asset</strong>
          ${existingTransfers.map(tr =>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:12px;">
              <span>${tr.date} → ${accountName(tr.toAccountId)}: <strong>${money(tr.amount)}</strong>${tr.notes ? ` — ${escapeHtml(tr.notes)}` : ""}</span>
              <button type="button" class="danger" style="font-size:11px;padding:2px 8px" data-delete-asset-transfer="${asset.id}:${tr.id}">Remove</button>
            </div>
          `).join("")}
        </div>` : "";
      return `<form id="recordForm" class="grid">
        <div class="settlement-card">
          <strong>${escapeHtml(asset.name)}</strong><br>
          Reclassifies funds from this manual asset into a liquid account (asset → cash conversion). This is not an account-to-account cash transfer; it records that an asset was realized into cash. The asset's displayed value reduces from the reclassification date forward. Past year views (before that date) show the original value — timeline intact.
          <br><span style="color:var(--green);font-weight:600;margin-top:4px;display:block;">Available to reclassify: ${money(remaining)}</span>
        </div>
        <div class="form-grid">
          ${input("amount", "Reclassify amount", remaining, "number")}
          ${input("date", "Reclassify date", today, "date")}
          ${selectHtml("toAccountId", "Destination account", accounts)}
          ${textarea("notes", "Notes (optional)", "")}
        </div>
        ${historyHtml}
        <div class="toolbar"><button class="primary" type="submit">Save Reclassification</button><button type="button" id="cancelForm">Cancel</button></div>
      </form>`;
    }

    function saveAssetTransfer(e) {
      e.preventDefault();
      const form = new FormData(e.target);
      const assetId = editing.id;
      const asset = (state?.assets || []).find(a => a.id === assetId);
      if (!asset) return;
      const amount = num(form.get("amount"));
      const date = form.get("date") || today;
      const toAccountId = form.get("toAccountId");
      const notes = form.get("notes") || "";
      if (!amount || amount <= 0) { alert("Please enter a valid transfer amount."); return; }
      if (!toAccountId) { alert("Please select a destination account."); return; }
      // Record transfer on the asse
      if (!Array.isArray(asset.transfers)) asset.transfers = [];
      const transferId = id();
      asset.transfers.push({ id: transferId, date, toAccountId, amount, notes });
      // Generate a matching income transaction on the account (tagged so bridge ignores it as income)
      state.transactions = state.transactions || [];
      state.transactions.push({
        id: id(),
        name: `Asset Transfer: ${asset.name}`,
        type: "income",
        date,
        amount,
        category: "Asset reclassification",
        accountId: toAccountId,
        sourceType: "assets",
        sourceId: assetId,
        generatedKind: "assetTransfer",
        transferId,
        affectsAccount: true,
        notes: `Reclassification of manual asset "${asset.name}" into account. ${notes}`.trim()
      });
      save();
      closeDrawer();
      renderNav();
      render();
    }

    function deleteAssetTransfer(assetId, transferId) {
      const asset = (state?.assets || []).find(a => a.id === assetId);
      if (!asset || !Array.isArray(asset.transfers)) return;
      if (!confirm("Remove this transfer? This will also remove the generated account transaction.")) return;
      asset.transfers = asset.transfers.filter(t => t.id !== transferId);
      state.transactions = (state.transactions || []).filter(t =>
        !(t.generatedKind === "assetTransfer" && t.sourceId === assetId && t.transferId === transferId)
      );
      save();
      render();
      // Reopen the form to show updated history
      openAssetTransfer(assetId);
    }

    /* ── EVENT BINDINGS & COMPONENT CONTROLLERS ── */
