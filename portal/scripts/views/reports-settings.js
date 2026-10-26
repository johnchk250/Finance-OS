    function documentsView(search) {
      const rows = filterRows(state.documents || [], search);
      return
        ${recordTabs("documents")}
        <div class="panel"><div class="panel-head"><h2>Document vault</h2><button data-add="documents">Add Document</button></div><div class="panel-body split-list">
        <div class="notice">For now this core stores document metadata, extracted fields, and links. Actual PDF/image parsing can be added as a server or browser-worker module next.</div>
        ${rows.length ? rows.map(d => `<div class="row-card"><div><h3>${d.name}</h3><p>${d.type} | ${d.taxYear || "no tax year"} | ${d.fileName || "file path not set"}<br>${d.extracted || "No extracted fields yet."}</p><div class="chips">${d.linkedType ? chip("Linked to " + d.linkedType) : ""}${d.linkedId ? chip("Synced") : ""}</div></div><div class="actions">${rowMenu([ { copy: `documents:${d.id}`, label: "Copy" }, { edit: `documents:${d.id}`, label: "Edit" }, { sep: true }, { delete: `documents:${d.id}`, label: "Delete", danger: true } ])}</div></div>`).join("") : empty("documents")}
        </div></div>`;
    }

    function reportsView() {
      const d = derive();

      // KPI Calculations
      const savingsRate = d.savingsRate;
      const savingsOffset = 138.2 - (138.2 * Math.min(100, Math.max(0, savingsRate))) / 100;

      const debtToAsset = d.assets ? (d.liabilities / d.assets) * 100 : 0;
      const debtOffset = 138.2 - (138.2 * Math.min(100, Math.max(0, debtToAsset))) / 100;
      const debtColor = debtToAsset > 40 ? 'var(--red)' : 'var(--green-light)';

      const rebateBase = d.rebateBase;
      const taxRules = getTaxRulesForYear(state?.settings?.taxYear);
      const rp = taxRules.rebateParams || { rate: 0.15, investmentCapPercent: 0.20, maxCapAbsolute: 10000000 };
      const stdDed = taxRules.standardDeduction || { fraction: 0.3333, cap: 500000 };
      const deduction = Math.min(d.taxIncome * stdDed.fraction, stdDed.cap);
      const taxableIncome = Math.max(0, d.taxIncome - deduction);
      const rebateLimit = Math.max(0, taxableIncome * rp.investmentCapPercent);
      const rebatePct = rebateLimit ? (rebateBase / rebateLimit) * 100 : 0;
      const rebateOffset = 138.2 - (138.2 * Math.min(100, Math.max(0, rebatePct))) / 100;
      const rebatePctFormatted = (rebateLimit === 0 || rebateBase >= rebateLimit) ? "100%" : (rebatePct > 99.9 ? "99.9%" : rebatePct.toFixed(1) + "%");

      const _repPeriod = taxPeriod();
      const _repEnd = _repPeriod.end;
      const liquidAccounts = (state?.accounts || []).reduce((s, a) => s + accountCurrentBalance(a.id, _repEnd), 0);
      // ── FIX 19: include liquid investments (Sanchayapatra with 85% haircut for early encashment) ──
      // Period-aware: only instruments that had STARTED by periodEnd and were NOT
      // yet withdrawn/matured by periodEnd count toward this period's liquidity.
      const liquidInvestments = (state?.investments || [])
        .filter(inv => !inv.startDate || inv.startDate <= _repEnd)
        .filter(inv => {
          const closedBeforePeriodEnd =
            (inv.status === 'withdrawn' || inv.status === 'matured') &&
            inv.withdrawalDate && inv.withdrawalDate <= _repEnd;
          return !closedBeforePeriodEnd;
        })
        .reduce((inv_s, inv) => {
          if (inv.type === 'savings_certificate') return inv_s + num(inv.currentValue || inv.principal) * 0.85;
          return inv_s;
        }, 0);
      const liquidAssets = liquidAccounts + liquidInvestments;
      const txs = state?.transactions || [];
      // Expense runway uses only the selected period's expenses for avg calculation
      const expTxs = txs.filter(t => t.type === 'expense' && withinPeriod(t.date, _repPeriod));
      const monthsWithExpense = new Set(expTxs.map(t => (t.date || "").slice(0, 7)));
      const totalExp = expTxs.reduce((s, t) => s + num(t.amount), 0);
      const avgExpense = monthsWithExpense.size ? (totalExp / monthsWithExpense.size) : 0;
      const runwayMonths = avgExpense ? (liquidAssets / avgExpense) : (liquidAssets ? 12 : 0);
      const runwayPct = Math.min(100, (runwayMonths / 6) * 100);
      const runwayOffset = 138.2 - (138.2 * runwayPct) / 100;
      const runwayColor = runwayMonths >= 3 ? 'var(--green)' : 'var(--red)';

      const assetRecords = (state?.assets || []).length + (state?.investments || []).length + (state?.accounts || []).length;
      const liabilityRecords = (state?.liabilities || []).length;
      const taxRecords = (state?.taxPayments || []).length;
      const planningRecords = (state?.goals || []).length;

      return
        <div class="kpis-wrap">
          <!-- KPI Card 1: Savings Rate -->
          <div class="kpi-card">
            <div class="kpi-info">
              <span>Savings Rate</span>
              <strong>${savingsRate.toFixed(1)}%</strong>
              <small>Month of ${today.slice(0, 7)}</small>
            </div>
            <div class="kpi-visual">
              <svg class="progress-ring" width="52" height="52">
                <circle class="progress-ring__background" stroke="var(--bg)" stroke-width="4" fill="transparent" r="22" cx="26" cy="26" />
                <circle class="progress-ring__circle" stroke="var(--green)" stroke-width="4" fill="transparent" r="22" cx="26" cy="26" stroke-dasharray="138.2" stroke-dashoffset="${savingsOffset}" stroke-linecap="round" />
              </svg>
              <div class="kpi-icon-overlay"></div>
            </div>
          </div>

          <!-- KPI Card 2: Debt-to-Asset -->
          <div class="kpi-card">
            <div class="kpi-info">
              <span>Debt-to-Asset</span>
              <strong>${debtToAsset.toFixed(1)}%</strong>
              <small>Safety limit: &lt; 40%</small>
            </div>
            <div class="kpi-visual">
              <svg class="progress-ring" width="52" height="52">
                <circle class="progress-ring__background" stroke="var(--bg)" stroke-width="4" fill="transparent" r="22" cx="26" cy="26" />
                <circle class="progress-ring__circle" stroke="${debtColor}" stroke-width="4" fill="transparent" r="22" cx="26" cy="26" stroke-dasharray="138.2" stroke-dashoffset="${debtOffset}" stroke-linecap="round" />
              </svg>
              <div class="kpi-icon-overlay"></div>
            </div>
          </div>

          <!-- KPI Card 3: Tax Rebate Progress -->
          <div class="kpi-card">
            <div class="kpi-info">
              <span>Tax Rebate</span>
              <strong>${rebatePctFormatted}</strong>
              <small>${money(rebateBase)} of ${shortNum(rebateLimit)}</small>
            </div>
            <div class="kpi-visual">
              <svg class="progress-ring" width="52" height="52">
                <circle class="progress-ring__background" stroke="var(--bg)" stroke-width="4" fill="transparent" r="22" cx="26" cy="26" />
                <circle class="progress-ring__circle" stroke="var(--blue)" stroke-width="4" fill="transparent" r="22" cx="26" cy="26" stroke-dasharray="138.2" stroke-dashoffset="${rebateOffset}" stroke-linecap="round" />
              </svg>
              <div class="kpi-icon-overlay"></div>
            </div>
          </div>

          <!-- KPI Card 4: Emergency Runway -->
          <div class="kpi-card">
            <div class="kpi-info">
              <span>Runway</span>
              <strong>${runwayMonths === Infinity ? '12+' : runwayMonths.toFixed(1)} mo</strong>
              <small>Avg Exp: ${money(avgExpense)}/mo · incl. SC@85%</small>
            </div>
            <div class="kpi-visual">
              <svg class="progress-ring" width="52" height="52">
                <circle class="progress-ring__background" stroke="var(--bg)" stroke-width="4" fill="transparent" r="22" cx="26" cy="26" />
                <circle class="progress-ring__circle" stroke="${runwayColor}" stroke-width="4" fill="transparent" r="22" cx="26" cy="26" stroke-dasharray="138.2" stroke-dashoffset="${runwayOffset}" stroke-linecap="round" />
              </svg>
              <div class="kpi-icon-overlay"></div>
            </div>
          </div>
        </div>

        <div class="grid three">
          <div class="panel"><div class="panel-head"><h2>Cash flow</h2></div><div class="panel-body"><div class="chart-wrap"><canvas id="cashChart"></canvas></div></div></div>
          <div class="panel"><div class="panel-head"><h2>Tax reconciliation</h2></div><div class="panel-body"><div class="chart-wrap"><canvas id="taxChart"></canvas></div></div></div>
          <div class="panel"><div class="panel-head"><h2>Net worth trend</h2><span class="muted">${(state.netWorthSnapshots || []).length} snapshots</span></div><div class="panel-body"><div class="chart-wrap" style="height:240px;"><canvas id="netTrendChart"></canvas></div></div></div>
        </div>

        <div class="panel" style="margin-top:14px">
          <div class="panel-head"><h2>Snapshot ledger</h2></div>
          <div class="panel-body">
            <div class="ledger-list">
              <!-- Assets Card -->
              <div class="ledger-card">
                <div class="ledger-header">
                  <div class="ledger-title-wrap">
                    <span class="status-dot positive"></span>
                    <h3>Assets</h3>
                  </div>
                  <span class="ledger-count">${assetRecords} records</span>
                </div>
                <div class="ledger-main">
                  <div class="ledger-amount">${money(d.assets)}</div>
                  <p class="ledger-desc">Cash wallet, bank accounts, active investments, and provident fund balance.</p>
                </div>
              </div>

              <!-- Liabilities Card -->
              <div class="ledger-card">
                <div class="ledger-header">
                  <div class="ledger-title-wrap">
                    <span class="status-dot ${d.liabilities > 0 ? 'negative' : 'positive'}"></span>
                    <h3>Liabilities</h3>
                  </div>
                  <span class="ledger-count">${liabilityRecords} records</span>
                </div>
                <div class="ledger-main">
                  <div class="ledger-amount negative">${money(d.liabilities)}</div>
                  <p class="ledger-desc">Active loan outstanding amounts, credit card balances, and personal payables.</p>
                </div>
              </div>

              <!-- Tax Card -->
              <div class="ledger-card">
                <div class="ledger-header">
                  <div class="ledger-title-wrap">
                    <span class="status-dot neutral"></span>
                    <h3>Tax Liability</h3>
                  </div>
                  <span class="ledger-count">${taxRecords} payments</span>
                </div>
                <div class="ledger-main">
                  <div class="ledger-amount">${money(d.estimatedTax)}</div>
                  <p class="ledger-desc">Estimated tax liability for the tax year ${state?.settings?.taxYear || "2026-27"}.</p>
                </div>
              </div>

              <!-- Planning Card -->
              <div class="ledger-card">
                <div class="ledger-header">
                  <div class="ledger-title-wrap">
                    <span class="status-dot planning"></span>
                    <h3>Planning</h3>
                  </div>
                  <span class="ledger-count">${planningRecords} goals</span>
                </div>
                <div class="ledger-main">
                  <div class="ledger-amount">${money((state?.goals || []).reduce((s,g)=>s+num(g.target),0))}</div>
                  <p class="ledger-desc">Total target amount of active personal financial goals and tax-saving milestones.</p>
                </div>
              </div>
            </div>
          </div>
        </div>`;
    }

    function templateRowHtml(field, label, comp = { type: "percentage", value: 0 }) {
      return
        <div style="display:flex; align-items:center; gap:8px; justify-content:space-between;">
          <span style="font-size:13px; font-weight:500; flex:1;">${label}</span>
          <select id="salTemplate_${field}_type" style="width:110px;">
            <option value="percentage" ${comp.type === "percentage" ? "selected" : ""}>% of Basic</option>
            <option value="fixed" ${comp.type === "fixed" ? "selected" : ""}>Fixed BDT</option>
          </select>
          <input type="number" id="salTemplate_${field}_value" value="${comp.value}" style="width:80px;">
        </div>
      `;
    }

    function settingsGeneralGroup(cats, accs, slabs, taxRules) {
      return
        <div class="set-group">
          <div class="set-head"><div class="set-ic">⚙</div><div><div class="set-title">General</div><div class="set-sub">Profile, modules, tax year &amp; cascade behavior</div></div></div>
          <div class="set-body">
            <div class="grid" style="grid-template-columns:1fr 1fr; gap:14px;">
              <label>Owner / profile name <input id="ownerSetting" value="${escapeHtml(state?.settings?.owner || "")}"></label>
              <label>Brand subtitle <input id="brandSubtitleSetting" value="${escapeHtml(state?.settings?.brandSubtitle || "Personal finance core")}"></label>
              <label>Tax year
                <select id="taxYearSetting">${taxYearOptionsHtml()}</select>
              </label>
              <label>Cascade behavior
                <select id="cascadeSetting">
                  <option value="deleteGenerated" ${state?.settings?.cascadePolicy === "deleteGenerated" ? "selected" : ""}>Delete generated dependents and unlink references</option>
                  <option value="unlinkOnly" ${state?.settings?.cascadePolicy === "unlinkOnly" ? "selected" : ""}>Unlink references only</option>
                </select>
              </label>
            </div>
            <div class="form-grid" style="margin-top:12px;">
              <label>Income year start <small style="color:var(--muted);font-size:11px;"> — auto from tax year</small><input id="incomeStartSetting" type="date" value="${(state?.settings?.incomeYearStart || '')}" disabled title="Auto-calculated from Tax Year selection"></label>
              <label>Income year end <small style="color:var(--muted);font-size:11px;"> — auto from tax year</small><input id="incomeEndSetting" type="date" value="${(state?.settings?.incomeYearEnd || '')}" disabled title="Auto-calculated from Tax Year selection"></label>
            </div>
            <div class="set-sublabel" style="margin-top:18px;">Modules</div>
            <div class="module-grid">
              ${modules.map(([id, label, desc]) => `<label class="toggle-card"><input type="checkbox" data-module="${id}" ${state?.settings?.activeModules?.[id] ? "checked" : ""} ${id === "home" || id === "settings" ? "disabled" : ""}><span><strong>${label}</strong><span>${desc}</span></span></label>`).join("")}
            </div>
          </div>
        </div>`;
    }

    function settingsBackupGroup() {
      return
        <div class="set-group">
          <div class="set-head"><div class="set-ic">💾</div><div><div class="set-title">Backup &amp; Data</div><div class="set-sub">Export, import, portable archive, sample data &amp; reset</div></div></div>
          <div class="set-body">
            <div class="notice">Roll forward a new tax year, back up your data, or save a fully self-contained portable HTML file that embeds your latest state.</div>
            <div class="set-actions" style="margin-top:12px;">
              <button id="newTaxYearBtn" class="primary">New Tax Year</button>
              <button id="portableBtn" class="primary" style="background:#285f91; border-color:#285f91">Save Portable HTML</button>
              <button id="exportBtn">Export JSON</button>
              <button id="importBtn">Import JSON</button>
              <button id="seedBtn">Load sample data</button>
              <button id="resetBtn" class="danger">Reset app data</button>
            </div>
            <div class="set-row-2" style="margin-top:14px;">
              <div>
                <strong>Net-worth history</strong><br>
                <small class="muted">${(state.netWorthSnapshots || []).length} snapshots recorded. Backfill synthesizes month-end snapshots back to your earliest transaction.</small>
              </div>
              <button id="backfillHistoryBtn" class="primary">Backfill history</button>
            </div>
          </div>
        </div>`;
    }

    function settingsListsGroup(cats, accs) {
      return
        <div class="set-group">
          <div class="set-head"><div class="set-ic">📋</div><div><div class="set-title">Reference Lists</div><div class="set-sub">Categories &amp; accounts used across every module</div></div></div>
          <div class="set-body">
            <div class="set-row-2">
              <div class="set-subcard">
                <div class="set-sublabel">Categories</div>
                <div style="max-height:300px; overflow-y:auto;">
                  ${cats.map(c => `<div class="manager-item"><span>${chip(c.type)} ${escapeHtml(c.name)}</span><button class="danger" data-del-cat="${c.id}" style="font-size:11px; padding:2px 8px;">Remove</button></div>`).join("")}
                </div>
                <div class="add-inline">
                  <select id="newCatType"><option value="income">Income</option><option value="expense">Expense</option></select>
                  <input id="newCatName" placeholder="Category name">
                  <button id="addCatBtn" class="primary" style="flex-shrink:0">Add</button>
                </div>
              </div>
              <div class="set-subcard">
                <div class="set-sublabel">Accounts</div>
                <div style="max-height:300px; overflow-y:auto;">
                  ${accs.map(a => `<div class="manager-item"><span>${escapeHtml(a.name)} <span class="muted">(${a.type})</span><br><small class="muted">Start: ${money(a.balance)} | Period end balance: ${money(accountCurrentBalance(a.id, taxPeriod().end))}</small></span><div class="actions"><button class="secondary" data-edit-acc-bal="${a.id}" style="font-size:11px; padding:2px 8px; margin-right:4px;">Set Start</button><button class="danger" data-del-acc="${a.id}" style="font-size:11px; padding:2px 8px;">Remove</button></div></div>`).join("")}
                </div>
                <div class="add-inline">
                  <input id="newAccName" placeholder="Account name">
                  <select id="newAccType"><option value="bank">Bank</option><option value="cash">Cash</option><option value="mobile">Mobile Banking</option></select>
                  <input id="newAccBalance" type="number" placeholder="Start Balance" style="width:110px" value="0">
                  <button id="addAccBtn" class="primary" style="flex-shrink:0">Add</button>
                </div>
              </div>
            </div>
          </div>
        </div>`;
    }

    function settingsTaxGroup(slabs, stdDed, rpx, template) {
      return
        <div class="set-group">
          <div class="set-head"><div class="set-ic">📐</div><div><div class="set-title">Tax &amp; Salary Rules</div><div class="set-sub">Year-specific legislation — saved for the selected tax year only</div></div></div>
          <div class="set-body">
            <div class="set-row-2">
            <div class="set-subcard">
              <div class="set-sublabel">Tax Slabs (Finance Ordinance)</div>
              <div class="notice">Set threshold to 0 for the final remainder slab.</div>
              <div id="slabEditor">
                ${slabs.map((s, i) => `<div class="slab-row"><input type="number" data-slab-threshold="${i}" value="${s.threshold}" placeholder="Threshold (0=rest)"><input type="number" data-slab-rate="${i}" value="${(s.rate * 100).toFixed(0)}" placeholder="Rate %" style="width:80px"><button class="danger" data-del-slab="${i}" style="padding:2px 8px;">X</button></div>`).join("")}
              </div>
              <div class="add-inline"><input id="newSlabThreshold" type="number" placeholder="Threshold"><input id="newSlabRate" type="number" placeholder="Rate %" style="width:80px"><button id="addSlabBtn" class="primary" style="flex-shrink:0">Add Slab</button></div>
            </div>
            <div class="set-subcard">
              <div class="set-sublabel">Deduction &amp; Rebate Rules</div>
              <div class="notice">Future law changes do not rewrite previous years.</div>
              <div class="form-grid">
                <label>Std deduction fraction <input id="stdFraction" type="number" step="0.0001" value="${stdDed.fraction}"></label>
                <label>Std deduction cap <input id="stdCap" type="number" value="${stdDed.cap}"></label>
                <label>Rebate rate <input id="rebateRate" type="number" step="0.01" value="${rpx.rate}"></label>
                <label>Investment cap % of taxable <input id="rebateCapPct" type="number" step="0.01" value="${rpx.investmentCapPercent}"></label>
                <label>Max investment cap <input id="rebateMaxCap" type="number" value="${rpx.maxCapAbsolute}"></label>
              </div>
              <button id="saveDeductionBtn" class="primary" style="margin-top:8px;">Save Deduction &amp; Rebate Rules</button>
            </div>
            </div>
            <div class="set-subcard" style="margin-top:14px;">
              <div class="set-sublabel">Salary Structure Template</div>
              <div class="notice">Configure salary components for automatic calculation when entering a basic salary amount.</div>
              <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 20px;">
                <div>
                  <h3 style="font-size:13px; font-weight:600; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:4px;">Base Components</h3>
                  <div style="display:flex; flex-direction:column; gap:10px;">
                    ${templateRowHtml("hra", "House Rent Allowance (HRA)", template.hra)}
                    ${templateRowHtml("conveyance", "Conveyance", template.conveyance)}
                    ${templateRowHtml("medical", "Medical", template.medical)}
                    ${templateRowHtml("pfEmployee", "Employee PF", template.pfEmployee)}
                    ${templateRowHtml("pfEmployer", "Employer PF", template.pfEmployer)}
                  </div>
                </div>
                <div>
                  <h3 style="font-size:13px; font-weight:600; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:4px;">Other Allowances (aggregates into 'Other')</h3>
                  <div id="salTemplate_otherList" style="max-height: 220px; overflow-y: auto; display:flex; flex-direction:column; gap:8px; padding-right:5px;">
                    ${(template.otherComponents || []).map((c, idx) =>
                      <div class="slab-row" data-other-idx="${idx}">
                        <input type="text" class="other-name" value="${escapeHtml(c.name)}" placeholder="Name" style="flex:2;">
                        <select class="other-type" style="width:110px;">
                          <option value="percentage" ${c.type === "percentage" ? "selected" : ""}>% of Basic</option>
                          <option value="fixed" ${c.type === "fixed" ? "selected" : ""}>Fixed BDT</option>
                        </select>
                        <input type="number" class="other-value" value="${c.value}" placeholder="Value" style="width:80px;">
                        <button class="danger remove-other-comp" data-idx="${idx}" style="padding:2px 8px; margin:0;">X</button>
                      </div>
                    `).join("")}
                  </div>
                  <div class="add-inline" style="margin-top:12px;">
                    <input id="salTemplate_newOtherName" placeholder="New component name" style="flex:2;">
                    <select id="salTemplate_newOtherType" style="width:110px;">
                      <option value="percentage">% of Basic</option>
                      <option value="fixed">Fixed BDT</option>
                    </select>
                    <input id="salTemplate_newOtherValue" type="number" placeholder="Value" style="width:80px;">
                    <button id="salTemplate_addOtherBtn" class="primary" style="flex-shrink:0; margin:0;">Add Component</button>
                  </div>
                </div>
              </div>
              <button id="saveSalaryTemplateBtn" class="primary" style="margin-top:16px;">Save Salary Template</button>
            </div>
          </div>
        </div>`;
    }

    function settingsHealthGroup() {
      return `<div class="set-group">${continuityHealthPanelInner()}</div>`;
    }

    function settingsView() {
      const cats = state?.categories || [];
      const accs = state?.accounts || [];
      const slabs = getTaxSlabsForYear(state?.settings?.taxYear);
      const taxRules = getTaxRulesForYear(state?.settings?.taxYear);
      const stdDed = taxRules.standardDeduction || { fraction: 0.3333, cap: 500000 };
      const rpx = taxRules.rebateParams || { rate: 0.15, investmentCapPercent: 0.20, maxCapAbsolute: 10000000 };
      const template = state?.settings?.salaryTemplate || { hra: {}, conveyance: {}, medical: {}, pfEmployee: {}, pfEmployer: {}, otherComponents: [] };
      return
        <div class="set-stack">
          ${settingsGeneralGroup(cats, accs, slabs, taxRules)}
          ${settingsBackupGroup()}
          ${settingsListsGroup(cats, accs)}
          ${settingsTaxGroup(slabs, stdDed, rpx, template)}
          ${settingsHealthGroup()}
        </div>`;
    }
