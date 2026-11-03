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
        ? { level: salaryAge > 45 ? "warn" : "ok", title: "Salary continuation", text: `Latest salary record is ${latestSalary.date}. ${salaryAge > 45 ? "Add the next month or use quick clone so forecasts and tax stay current." : "Monthly salary flow looks current."}`, actionView: "salary" }
        : { level: "warn", title: "Salary continuation", text: "No salary records yet. Add salary rows to drive tax and cash-flow views.", actionView: "salary" });

      const currentExpenses = (state?.transactions || []).filter(t => t.type === "expense" && withinPeriod(t.date, period));
      items.push(currentExpenses.length
        ? { level: "ok", title: "Expense tracking", text: `${currentExpenses.length} expense records feed ${period.label} cash flow and reports.` }
        : { level: "warn", title: "Expense tracking", text: `No expense records found for ${period.label}. Add monthly expenses to avoid overstated savings.`, actionView: "transactions" });

      const openMaturities = (state?.investments || []).filter(i => i.maturityDate && i.status !== "matured" && i.status !== "withdrawn" && daysBetween(i.maturityDate, -999) >= 0);
      items.push(openMaturities.length
        ? { level: "warn", title: "Investment lifecycle", text: `${openMaturities.length} investment(s) have reached maturity date. Settle them so proceeds, source tax, and accounts sync.`, actionView: "investments" }
        : { level: "ok", title: "Investment lifecycle", text: "No overdue investment maturities detected." });

      const unsyncedSalary = (state?.salary || []).filter(s =>
        !(state?.transactions || []).some(t => t.sourceType === "salary" && t.sourceId === s.id && t.generatedKind === "salaryNet")
      );
      if (unsyncedSalary.length) {
        items.push({ level: "warn", title: "Salary → Transaction sync", text: `${unsyncedSalary.length} salary row(s) have no linked net-salary transaction. Save or re-save those salary records to auto-generate them.`, actionView: "salary" });
      }
      return items;
    }

    function continuityAlertsStrip() {
      const warnings = continuityHealthItems().filter(item => item.level === "warn");
      if (!warnings.length) return "";
      return `<div class="panel" style="margin-top:14px;border-left:3px solid var(--amber);">
        <div class="panel-body" style="display:flex;flex-direction:column;gap:8px;padding:12px 16px;">
          ${warnings.map(w => `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;font-size:12.5px;">
            <div><strong style="color:var(--amber);">${escapeHtml(w.title)}:</strong> ${escapeHtml(w.text)}</div>
            ${w.actionView ? `<button type="button" data-open="${w.actionView}" style="font-size:11.5px;padding:4px 10px;">Review</button>` : ""}
          </div>`).join("")}
        </div>
      </div>`;
    }

    // Sub-hub switcher bar so consolidated hub views (Cash Flow, Net Worth, Plan & Review)
    // feel cohesive and allow 1-click switching between related modules.
    function hubSubNav(currentView) {
      const cashFlowHub = [
        { id: "transactions", label: "Transactions", tab: "transactions" },
        { id: "transactions", label: "Automation", tab: "automation" },
        { id: "budgets", label: "Budgets" },
        { id: "salary", label: "Salary" }
      ];
      const portfolioHub = [
        { id: "assets", label: "All Assets & Accounts" },
        { id: "investments", label: "Investments" },
        { id: "liabilities", label: "Liabilities" }
      ];
      const planHub = [
        { id: "tax", label: "Tax Center" },
        { id: "planning", label: "Goals", planTab: "goals" },
        { id: "planning", label: "Forecast", planTab: "forecast" },
        { id: "reports", label: "Reports & Analytics" }
      ];

      let group = null;
      if (["transactions", "budgets", "salary"].includes(currentView)) group = cashFlowHub;
      else if (["assets", "investments", "liabilities"].includes(currentView)) group = portfolioHub;
      else if (["tax", "planning", "reports"].includes(currentView)) group = planHub;
      if (!group) return "";

      const curTxTab = state?.settings?.transactionViewTab || "transactions";
      const curPlanTab = state?.settings?.planningTab || "goals";

      return `<div class="hub-subnav" role="tablist" aria-label="Section views">
        ${group.map(item => {
          let isActive = item.id === currentView;
          if (isActive && item.tab) isActive = curTxTab === item.tab;
          if (isActive && item.planTab) isActive = curPlanTab === item.planTab;
          const attrs = [
            `data-hub-nav="${item.id}"`,
            item.tab ? `data-hub-txtab="${item.tab}"` : "",
            item.planTab ? `data-hub-plantab="${item.planTab}"` : ""
          ].filter(Boolean).join(" ");
          return `<button type="button" class="hub-tab ${isActive ? "active" : ""}" role="tab" aria-selected="${isActive ? "true" : "false"}" ${attrs}>${item.label}</button>`;
        }).join("")}
      </div>`;
    }

    function recordTabs(type) {
      return hubSubNav(activeView);
    }

    function labelFor(type) {
      return ({ transactions: "Transaction", salary: "Salary", assets: "Asset", liabilities: "Liability", investments: "Investment", taxPayments: "Tax Payment", planning: "Goal", goals: "Goal", recurringRules: "Recurring Rule", budgets: "Budget" })[type] || type;
    }

    function empty(type) {
      return `<div class="empty">No ${labelFor(type).toLowerCase()} records yet. Use <strong>+ Add record</strong> above or press <kbd>Ctrl+K</kbd> to add one.</div>`;
    }

    function filterRows(rows, search) {
      if (!search) return rows;
      const lower = search.toLowerCase();
      return rows.filter(row => searchableText(row).includes(lower));
    }

    /* ── COMMAND PALETTE & QUICK-ENTRY PARSER (Ctrl+K) ── */
    function parseQuickCommand(rawInput) {
      const raw = String(rawInput || "").trim();
      if (!raw) return null;

      if (raw.startsWith(">")) {
        const query = raw.slice(1).trim().toLowerCase();
        const commands = [
          { title: "Go to Overview", sub: "Dashboard & KPIs", action: "view:home" },
          { title: "Go to Transactions", sub: "Income, expenses, and transfers", action: "view:transactions" },
          { title: "Go to Budgets", sub: "Monthly category limits", action: "view:budgets" },
          { title: "Go to Salary", sub: "Payslips & PF contributions", action: "view:salary" },
          { title: "Go to Assets & Accounts", sub: "Bank balances & property", action: "view:assets" },
          { title: "Go to Investments", sub: "Sanchayapatra, DPS, FDR, PF", action: "view:investments" },
          { title: "Go to Liabilities", sub: "Loans & obligations", action: "view:liabilities" },
          { title: "Go to Tax Center", sub: "Bangladesh AY tax & rebate simulator", action: "view:tax" },
          { title: "Go to Planning & Forecast", sub: "Financial goals & 5-year projection", action: "view:planning" },
          { title: "Go to Reports", sub: "Runway, ratios & trends", action: "view:reports" },
          { title: "Go to Settings", sub: "Categories, accounts, tax slabs & PIN", action: "view:settings" },
          { title: "Toggle Dark / Light Theme", sub: "Switch workspace appearance", action: "cmd:theme" },
          { title: "Toggle Privacy Blur (Ctrl+B)", sub: "Mask or reveal all BDT amounts", action: "cmd:privacy" },
          { title: "Quick Clone Last Month Salary", sub: "Generate next month's salary record", action: "cmd:cloneSalary" },
          { title: "Export Portable HTML", sub: "Save standalone backup file", action: "cmd:exportHtml" },
          { title: "Export JSON Backup", sub: "Save raw JSON state", action: "cmd:exportJson" }
        ];
        return {
          kind: "commands",
          items: commands.filter(c => !query || c.title.toLowerCase().includes(query) || c.sub.toLowerCase().includes(query))
        };
      }

      const quickMatch = raw.match(/^(?:(\+|-|exp(?:ense)?|inc(?:ome)?)\s*)?(\d+(?:\.\d+)?)\s+(.+)$/i) ||
                         raw.match(/^(\+|-|exp(?:ense)?|inc(?:ome)?)\s+(.+?)\s+(\d+(?:\.\d+)?)$/i);
      if (quickMatch) {
        let prefix = "", amountNum = 0, rest = "";
        if (/^\d/.test(quickMatch[2])) {
          prefix = (quickMatch[1] || "-").toLowerCase();
          amountNum = Number(quickMatch[2]);
          rest = quickMatch[3].trim();
        } else {
          prefix = (quickMatch[1] || "-").toLowerCase();
          rest = quickMatch[2].trim();
          amountNum = Number(quickMatch[3]);
        }
        if (amountNum > 0 && rest) {
          const isIncome = prefix === "+" || prefix.startsWith("inc");
          const txType = isIncome ? "income" : "expense";
          const cats = (state?.categories || []).filter(c => c.type === txType);
          const lowerRest = rest.toLowerCase();
          const matchedCat = cats.find(c => lowerRest.includes(c.name.toLowerCase().split("/")[0])) ||
                             (txType === "expense"
                               ? ( /lunch|dinner|food|grocer|coffee|tea|restaurant|bazar/i.test(lowerRest) ? cats.find(c => /food/i.test(c.name))
                                 : /uber|pathao|bus|fuel|rickshaw|transport|ride/i.test(lowerRest) ? cats.find(c => /transport/i.test(c.name))
                                 : /rent|home/i.test(lowerRest) ? cats.find(c => /rent/i.test(c.name))
                                 : /electric|water|gas|internet|phone|bill|util/i.test(lowerRest) ? cats.find(c => /util/i.test(c.name))
                                 : /doctor|med|pharma|hospital/i.test(lowerRest) ? cats.find(c => /med/i.test(c.name))
                                 : cats[0] )
                               : cats[0]);
          const accounts = (state?.accounts || []).filter(a => a.active !== false);
          const matchedAcc = accounts.find(a => lowerRest.includes(a.name.toLowerCase())) ||
                             accounts.find(a => /primary|bank/i.test(a.name)) ||
                             accounts[0];
          return {
            kind: "quickTx",
            tx: {
              name: rest.charAt(0).toUpperCase() + rest.slice(1),
              type: txType,
              amount: amountNum,
              date: today,
              category: matchedCat ? matchedCat.name : "",
              accountId: matchedAcc ? matchedAcc.id : "",
              accountName: matchedAcc ? matchedAcc.name : "Default Account"
            }
          };
        }
      }
      return null;
    }

    function globalSearchView(rawSearch) {
      const search = rawSearch.trim().toLowerCase();
      const parsedCmd = parseQuickCommand(rawSearch);

      let commandHtml = "";
      if (parsedCmd?.kind === "quickTx") {
        const qTx = parsedCmd.tx;
        commandHtml = `
          <div class="panel quick-cmd-card" style="margin-bottom:14px;border-left:4px solid var(--green);">
            <div class="panel-body" style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;">
              <div>
                <div class="workspace-label" style="color:var(--green);margin-bottom:4px;">⚡ INSTANT QUICK-LOG (PRESS ENTER)</div>
                <h3 style="font-size:15px;">${qTx.type === "income" ? "Record Income" : "Record Expense"}: <strong>${escapeHtml(qTx.name)}</strong> — <span class="${qTx.type === "income" ? "positive" : "negative"}">${money(qTx.amount)}</span></h3>
                <p class="muted" style="font-size:12px;margin-top:2px;">Category: <strong>${escapeHtml(qTx.category || "Uncategorized")}</strong> · Account: <strong>${escapeHtml(qTx.accountName)}</strong> · Date: ${qTx.date}</p>
              </div>
              <div class="actions">
                <button type="button" class="primary" id="quickLogConfirmBtn" data-quick-tx='${escapeHtml(JSON.stringify(qTx))}'>Log ${qTx.type === "income" ? "Income" : "Expense"} ↵</button>
              </div>
            </div>
          </div>`;
      } else if (parsedCmd?.kind === "commands") {
        commandHtml = `
          <div class="panel" style="margin-bottom:14px;">
            <div class="panel-head"><h2>Workspace Commands</h2><span class="muted">Type &gt; to filter commands</span></div>
            <div class="panel-body split-list">
              ${parsedCmd.items.map(c => `
                <div class="row-card" style="align-items:center;">
                  <div><h3>${escapeHtml(c.title)}</h3><p>${escapeHtml(c.sub)}</p></div>
                  <button type="button" class="primary" data-run-cmd="${escapeHtml(c.action)}" style="padding:5px 12px;font-size:12px;">Run</button>
                </div>
              `).join("") || `<div class="empty">No matching commands.</div>`}
            </div>
          </div>`;
      }

      const results = search.startsWith(">") ? [] : searchRecords(search);
      return `
        <div class="search-summary">
          <div>
            <strong>${parsedCmd ? "Command Palette &amp; Search" : "Search results"}</strong><br>
            <span>${parsedCmd?.kind === "commands"
              ? `${parsedCmd.items.length} command(s) available`
              : `${results.length} match${results.length === 1 ? "" : "es"} for "${escapeHtml(rawSearch)}" · Tip: type <code>+ 450 Coffee</code> to log instantly or <code>&gt;</code> for commands`}</span>
          </div>
          <button type="button" id="clearSearchInline">Clear (Esc)</button>
        </div>
        ${commandHtml}
        ${!search.startsWith(">") ? (results.length ? `<div class="search-results">${results.map(searchResultCard).join("")}</div>` : (!parsedCmd ? `<div class="panel"><div class="empty">No records match "${escapeHtml(rawSearch)}". Try a month, amount, category, or type <code>+ 500 Lunch</code> to quick-add an expense.</div></div>` : "")) : ""}
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
      const searchMenuActions = [];
      if (canEdit) {
        searchMenuActions.push({ copy: `${result.key}:${row.id}`, label: "Copy" });
        searchMenuActions.push({ edit: `${result.key}:${row.id}`, label: "Edit" });
      }
      const term = q("globalSearch")?.value?.trim() || "";
      return `
        <div class="search-card">
          <div>
            <div class="search-meta">${meta.map(item => `<span>${escapeHtml(item)}</span>`).join("")}</div>
            <h3>${highlightText(title, term)}</h3>
            <div class="search-snippet">${highlightText(result.snippet, term)}</div>
          </div>
          <div class="actions">
            <button type="button" data-open="${result.view}" data-clear-search="true">Open</button>
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
      return `<td class="col-act">${rowMenu([
        { copy: `${type}:${id}`, label: "Copy" },
        { edit: `${type}:${id}`, label: "Edit" },
        { sep: true },
        { delete: `${type}:${id}`, label: "Delete", danger: true }
      ])}</td>`;
    }

    function rowMenu(actions) {
      const items = actions.map(a => {
        if (a.sep) return `<div class="menu-sep"></div>`;
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
        return `<button type="button" ${attr} class="${a.danger ? "danger" : ""}">${a.label}</button>`;
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
      if (investment?.withdrawalDate) return investment.withdrawalDate;
      if (investment?.profitDate)     return investment.profitDate;
      return taxPeriod().end || today;
    }

    function linkText(record) {
      const bits = [];
      if (record.sourceType) bits.push(record.sourceType);
      if (record.linkedType) bits.push(record.linkedType);
      if (record.linkedLiabilityId) bits.push("EMI");
      return bits.length ? bits.join(", ") : "manual";
    }


    // ── ASSET TRANSFER FEATURE ──

    function openAssetTransfer(assetId) {
      editing = { type: "assetTransfer", id: assetId };
      const asset = (state?.assets || []).find(a => a.id === assetId);
      if (!asset) return;
      q("drawerTitle").textContent = `Reclassify "${asset.name}" → Account`;
      q("drawerBody").innerHTML = assetTransferFormFor(asset);
      q("drawer").classList.add("open");
      q("drawer").setAttribute("aria-hidden", "false");
      q("recordForm").onsubmit = saveAssetTransfer;
    }

    function assetTransferFormFor(asset) {
      const remaining = valueOfAsset(asset);
      const accounts = (state?.accounts || []).map(a =>
        `<option value="${a.id}">${escapeHtml(a.name)} (${a.type})</option>`
      ).join("");
      const existingTransfers = Array.isArray(asset.transfers) ? asset.transfers : [];
      const historyHtml = existingTransfers.length ? `
        <div class="settlement-card" style="margin-top:8px;">
          <strong>Previous reclassifications from this asset</strong>
          ${existingTransfers.map(tr => `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:12px;">
              <span>${tr.date} → ${accountName(tr.toAccountId)}: <strong>${money(tr.amount)}</strong>${tr.notes ? ` — ${escapeHtml(tr.notes)}` : ""}</span>
              <button type="button" class="danger" style="font-size:11px;padding:2px 8px" data-delete-asset-transfer="${asset.id}:${tr.id}">Remove</button>
            </div>
          `).join("")}
        </div>` : "";
      return `<form id="recordForm" class="grid">
        <div class="settlement-card">
          <strong>${escapeHtml(asset.name)}</strong><br>
          Reclassifies funds from this manual asset into a liquid account (asset → cash conversion). The asset's displayed value reduces from the reclassification date forward.
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
      if (!amount || amount <= 0) { showAppNotice("Invalid amount", "Please enter a valid transfer amount greater than zero."); return; }
      if (!toAccountId) { showAppNotice("Account required", "Please select a destination account."); return; }
      if (!Array.isArray(asset.transfers)) asset.transfers = [];
      const transferId = id();
      asset.transfers.push({ id: transferId, date, toAccountId, amount, notes });
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

    async function deleteAssetTransfer(assetId, transferId) {
      const asset = (state?.assets || []).find(a => a.id === assetId);
      if (!asset || !Array.isArray(asset.transfers)) return;
      const ok = await showAppConfirm("Remove reclassification?", "This will remove the reclassification and its linked account transaction.");
      if (!ok) return;
      asset.transfers = asset.transfers.filter(t => t.id !== transferId);
      state.transactions = (state.transactions || []).filter(t =>
        !(t.generatedKind === "assetTransfer" && t.sourceId === assetId && t.transferId === transferId)
      );
      save();
      render();
      openAssetTransfer(assetId);
    }

    /* ── EVENT BINDINGS & COMPONENT CONTROLLERS ── */
