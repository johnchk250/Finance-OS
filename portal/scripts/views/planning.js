    function automationPanel() {
      const rules = state.recurringRules || [];
      const accounts = state.accounts || [];
      const accName = id => accounts.find(a => a.id === id)?.name || "—";
      const freqLabel = r => `${r.frequency === "weekly" ? "Weekly" : r.frequency === "yearly" ? "Yearly" : "Monthly"}${num(r.interval) > 1 ? " ×" + r.interval : ""}`;
      const rows = rules.map(r => {
        const missing = r._flagMissingAccount;
        const linkedLiab = r.linkedLiabilityId ? (state.liabilities || []).find(l => l.id === r.linkedLiabilityId) : null;
        return
          <div class="row-card" style="flex-direction:column;gap:6px;${missing ? "border-color:var(--red);" : ""}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;width:100%;">
              <div>
                <h3>${escapeHtml(r.name)} ${r.active ? "" : '<span class="muted">(paused)</span>'}</h3>
                <p class="muted" style="font-size:12px;">
                  ${r.type === "income" ? "Income" : "Expense"} · ${money(r.amount)} · ${freqLabel(r)} · Next: ${r.nextDate || "—"}
                  ${linkedLiab ? ` · EMI → ${escapeHtml(linkedLiab.name)}` : ""}
                  ${missing ? ` · <span style="color:var(--red);">account missing</span>` : ""}
                </p>
              </div>
              <div class="actions">
                <button class="secondary" data-toggle-recurring="${r.id}" style="font-size:11px;padding:2px 8px;">${r.active ? "Pause" : "Resume"}</button>
                ${rowMenu([
                  { edit: `recurringRules:${r.id}`, label: "Edit" },
                  { sep: true },
                  { delete: `recurringRules:${r.id}`, label: "Delete", danger: true }
                ])}
              </div>
            </div>
          </div>`;
      }).join("");
      return
        <div class="seg" id="txViewSeg" style="margin-bottom:12px;">
          <button type="button" class="seg-btn ${(state.settings.transactionViewTab || "transactions") === "transactions" ? "active" : ""}" data-txview="transactions">Transactions</button>
          <button type="button" class="seg-btn ${state.settings.transactionViewTab === "automation" ? "active" : ""}" data-txview="automation">Automation</button>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Recurring rules</h2><button data-add="recurringRules">Add rule</button></div>
          <div class="panel-body">
            <p class="muted" style="font-size:12px;margin-bottom:12px;">Rules generate transactions automatically on their next due date. After a long offline gap you'll be asked how many to backfill — never a silent flood.</p>
            ${rules.length ? rows : `<div class="empty">No recurring rules yet. Add one, or convert any transaction into a rule from its row menu.</div>`}
          </div>
        </div>`;
    }

    // ── PHASE 3: Budgets view ──
    function budgetsView() {
      const budgets = (state.budgets || []).filter(b => !b.archivedAt);
      // Month stepper driven by settings.budgetMonth (YYYY-MM), default this month.
      const curMonth = state.settings.budgetMonth || today.slice(0, 7);
      const [y, m] = curMonth.split("-").map(Number);
      const monthStart = `${curMonth}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const monthEnd = `${curMonth}-${String(lastDay).padStart(2, "0")}`;
      const now = new Date();
      const isCurrentMonth = (now.getFullYear() === y && (now.getMonth() + 1) === m);
      const daysElapsed = isCurrentMonth ? now.getDate() : (curMonth > today.slice(0, 7) ? 0 : lastDay);
      const catName = idOrName => {
        const c = (state.categories || []).find(c => c.id === idOrName || c.name === idOrName);
        return c ? c.name : idOrName;
      };
      const cards = budgets.map(b => {
        const spent = compute.txTotals({ from: monthStart, to: monthEnd, type: "expense", category: b.category }).expense;
        const limit = num(b.monthlyLimit);
        const pct = limit > 0 ? (spent / limit) * 100 : 0;
        const projected = daysElapsed > 0 ? (spent / daysElapsed) * lastDay : spent;
        const color = pct >= 100 ? "var(--red)" : pct >= 80 ? "#d9904b" : "var(--green)";
        const remaining = Math.max(0, limit - spent);
        return
          <div class="panel">
            <div class="panel-head"><h2>${escapeHtml(catName(b.category))}</h2>
              <div class="actions">${rowMenu([
                { edit: `budgets:${b.id}`, label: "Edit" },
                { sep: true },
                { delete: `budgets:${b.id}`, label: "Archive", danger: true }
              ])}</div>
            </div>
            <div class="panel-body">
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
                <span><strong>${money(spent)}</strong> of ${money(limit)}</span>
                <span style="color:${color};font-weight:600;">${pct.toFixed(0)}%</span>
              </div>
              <div style="width:100%;height:10px;background:var(--border);border-radius:5px;overflow:hidden;">
                <div style="width:${Math.min(100, pct)}%;height:100%;background:${color};border-radius:5px;transition:width .3s;"></div>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:6px;">
                <span>${money(remaining)} left</span>
                <span>Projected month-end: ${money(projected)}</span>
              </div>
              ${b.notes ? `<p style="font-size:11px;color:var(--muted);margin-top:6px;">${escapeHtml(b.notes)}</p>` : ""}
            </div>
          </div>`;
      }).join("");
      const totalLimit = budgets.reduce((s, b) => s + num(b.monthlyLimit), 0);
      const totalSpent = budgets.reduce((s, b) => s + compute.txTotals({ from: monthStart, to: monthEnd, type: "expense", category: b.category }).expense, 0);
      const overallPct = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;
      const overallColor = overallPct >= 100 ? "var(--red)" : overallPct >= 80 ? "#d9904b" : "var(--green)";
      return
        <div class="panel">
          <div class="panel-head"><h2>Budgets — ${curMonth}</h2>
            <div class="actions">
              <button data-budget-step="prev" class="secondary" style="font-size:12px;">‹</button>
              <button data-budget-step="today" class="secondary" style="font-size:12px;">This month</button>
              <button data-budget-step="next" class="secondary" style="font-size:12px;">›</button>
              <button data-add="budgets" class="primary">Add budget</button>
            </div>
          </div>
          <div class="panel-body">
            <div style="display:flex;align-items:center;gap:16px;">
              <svg width="56" height="56" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="22" stroke="var(--border)" stroke-width="5" fill="transparent"/>
                <circle cx="28" cy="28" r="22" stroke="${overallColor}" stroke-width="5" fill="transparent"
                  stroke-dasharray="138.2" stroke-dashoffset="${138.2 * (1 - Math.min(1, overallPct/100))}" stroke-linecap="round"
                  transform="rotate(-90 28 28)"/>
              </svg>
              <div>
                <strong style="font-size:18px;">${money(totalSpent)}</strong>
                <span class="muted"> of ${money(totalLimit)} budgeted</span>
                <div class="muted" style="font-size:12px;">${money(Math.max(0, totalLimit - totalSpent))} remaining · ${overallPct.toFixed(0)}% used</div>
              </div>
            </div>
          </div>
        </div>
        ${budgets.length ? `<div class="grid two" style="margin-top:14px;">${cards}</div>` : `<div class="panel" style="margin-top:14px;"><div class="panel-body"><div class="empty">No budgets yet — add one per expense category to track spending limits.</div></div></div>`}
      `;
    }

    // ── PHASE 3: Home "Budget alerts" strip (≥80% used this month) ──
    function budgetAlertsStrip() {
      const budgets = (state.budgets || []).filter(b => !b.archivedAt);
      if (!budgets.length) return "";
      const m = today.slice(0, 7);
      const alerts = [];
      budgets.forEach(b => {
        const spent = compute.txTotals({ from: m + "-01", to: m + "-31", type: "expense", category: b.category }).expense;
        const pct = num(b.monthlyLimit) > 0 ? (spent / num(b.monthlyLimit)) * 100 : 0;
        if (pct >= 80) {
          const c = (state.categories || []).find(c => c.id === b.category || c.name === b.category);
          alerts.push({ name: c ? c.name : b.category, pct, left: Math.max(0, num(b.monthlyLimit) - spent) });
        }
      });
      if (!alerts.length) return "";
      const chips = alerts.map(a => `<span class="chip" style="background:${a.pct >= 100 ? "var(--red)" : "#d9904b"};color:#fff;">${escapeHtml(a.name)} ${a.pct.toFixed(0)}% · ${money(a.left)} left</span>`).join("");
      return `<div class="panel" style="margin-top:14px;border-left:3px solid var(--red);"><div class="panel-body" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><strong>Budget alerts</strong>${chips}</div></div>`;
    }

    // ── PHASE 4: Forecast panel (tab inside Planning) ──
    function forecastPanel() {
      const fa = state.forecastAssumptions || {};
      const series = projectNetWorth();
      const todayIdx = 0; // first point is today (truth)
      const points = series.map(s => ({ date: s.date, value: s.netWorth }));
      // Goal ETAs: first month projected net worth crosses each goal's target.
      const goals = state.goals || [];
      const etaRows = goals.map(g => {
        const target = num(g.target);
        if (!target) return null;
        const cross = series.find(s => s.netWorth >= target);
        if (!cross) return `<div class="row-card"><h3>${escapeHtml(g.name)}</h3><p class="muted" style="font-size:12px;">Target ${money(target)} — not reached within ${fa.monthsAhead || 60} months at these assumptions.</p></div>`;
        const yrs = cross.month / 12;
        return `<div class="row-card"><h3>${escapeHtml(g.name)}</h3><p class="muted" style="font-size:12px;">Target ${money(target)} — reached <strong>${cross.date}</strong> (${yrs.toFixed(1)} yrs)</p></div>`;
      }).filter(Boolean).join("");
      const finalNW = series[series.length - 1].netWorth;
      const delta = finalNW - series[0].netWorth;
      return
        <div class="seg" id="planningSeg" style="margin-bottom:12px;">
          <button type="button" class="seg-btn" data-planningtab="goals">Goals</button>
          <button type="button" class="seg-btn active" data-planningtab="forecast">Forecast</button>
        </div>
        <div class="grid kpis">
          ${kpi("Net worth today", series[0].netWorth, "From current ledger", true)}
          ${kpi(`Projected in ${fa.monthsAhead || 60}m`, finalNW, `${delta >= 0 ? "+" : ""}${money(delta)} vs today`, delta >= 0)}
          ${kpi("Assumed return", `${num(fa.annualReturnPct)}%`, "Annual, blended on portfolio", true)}
          ${kpi("Assumed inflation", `${num(fa.inflationPct)}%`, "Annual, erodes savings power", num(fa.inflationPct) <= 6)}
        </div>
        <div class="panel" style="margin-top:14px">
          <div class="panel-head"><h2>Net worth projection</h2><span class="muted">Solid = history · dashed = forecast</span></div>
          <div class="panel-body"><div class="chart-wrap" style="height:260px;"><canvas id="forecastChart"></canvas></div></div>
        </div>
        <div class="panel" style="margin-top:14px">
          <div class="panel-head"><h2>Assumptions</h2>
            <div class="actions">
              <button data-forecast-scenario="base" class="secondary" style="font-size:11px;">Base</button>
              <button data-forecast-scenario="conservative" class="secondary" style="font-size:11px;">Conservative</button>
              <button data-forecast-scenario="aggressive" class="secondary" style="font-size:11px;">Aggressive</button>
            </div>
          </div>
          <div class="panel-body">
            <div class="grid two">
              <label>Months ahead<input type="number" id="faMonths" value="${fa.monthsAhead || 60}" min="1" max="360"></label>
              <label>Monthly savings override (0 = auto from history)<input type="number" id="faSavings" value="${num(fa.monthlySavingsOverride)}" min="0"></label>
              <label>Annual return %<input type="number" id="faReturn" value="${num(fa.annualReturnPct)}" step="0.5"></label>
              <label>Annual inflation %<input type="number" id="faInflation" value="${num(fa.inflationPct)}" step="0.5"></label>
            </div>
            <label class="toggle-card" style="margin-top:10px;"><input type="checkbox" id="faStickBudgets" ${fa.stickToBudgets ? "checked" : ""}><span><strong>Assume I stick to budgets</strong><span>Caps projected discretionary spend at each budget's limit.</span></span></label>
            <div class="toolbar" style="margin-top:12px;"><button class="primary" id="faApply">Re-project</button></div>
          </div>
        </div>
        ${goals.length ? `<div class="panel" style="margin-top:14px"><div class="panel-head"><h2>Goal ETAs</h2></div><div class="panel-body split-list">${etaRows || '<div class="empty">No goals with a target amount set.</div>'}</div></div>` : ""}
      `;
    }

    // Draw the forecast chart (solid history → dashed projection). Called by
    // an extended drawCharts() via drawForecastChart().
    function drawForecastChart() {
      const el = q("forecastChart");
      if (!el) return;
      const fa = state.forecastAssumptions || {};
      // Seed history from net-worth snapshots (truth), then append projection.
      const snaps = (state.netWorthSnapshots || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
      const histPoints = snaps.map(s => ({ date: s.date, value: s.netWorth }));
      const proj = projectNetWorth({ assumptions: fa });
      const projPoints = proj.map(p => ({ date: p.date, value: p.netWorth }));
      // Join: history last point + projection (dashed from first projection idx).
      const todayPoint = { date: today, value: netWorthAsOf(today).netWorth };
      const allPoints = [...histPoints, todayPoint, ...projPoints];
      const dashedFromIdx = histPoints.length + 1; // projection starts dashed
      lineChart(el, allPoints, { color: "#1d4c74", fillArea: false, dashedFromIdx });
    }

    function planningView(search) {
      const rows = filterRows(state.goals || [], search);
      const tab = state.settings.planningTab || "goals";
      if (tab === "forecast") return forecastPanel();
      return
        <div class="seg" id="planningSeg" style="margin-bottom:12px;">
          <button type="button" class="seg-btn active" data-planningtab="goals">Goals</button>
          <button type="button" class="seg-btn" data-planningtab="forecast">Forecast</button>
        </div>
        ${recordTabs("goals")}
        <div class="grid kpis">
          ${kpi("Active goals", rows.length, "Total open goals", rows.length > 0)}
          ${kpi("Total target", rows.reduce((s, g) => s + num(g.target), 0), "Across all goals", true)}
          ${kpi("Total saved", rows.reduce((s, g) => s + num(g.current), 0), "Current progress", true)}
          ${kpi("Monthly commitment", rows.reduce((s, g) => s + num(g.monthlyContribution), 0), "Sum of all goals", true)}
        </div>
        <div class="panel" style="margin-top:14px">
          <div class="panel-head"><h2>Goals progress</h2><button data-add="goals">Add Goal</button></div>
          <div class="panel-body">
            ${rows.length ? rows.map(g => {
              const goalCurrent = g.linkedAccountId
                ? accountCurrentBalance(g.linkedAccountId, taxPeriod().end)
                : num(g.current);
              const pct = num(g.target) > 0 ? Math.min(100, Math.round((goalCurrent / num(g.target)) * 100)) : 0;
              const remaining = Math.max(0, num(g.target) - goalCurrent);
              const monthsLeft = num(g.monthlyContribution) > 0 ? Math.ceil(remaining / num(g.monthlyContribution)) : 0;
              return
                <div class="row-card" style="flex-direction:column; gap:8px;">
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%;">
                    <div>
                      <h3>${g.name}</h3>
                      <p>${g.type || "goal"} ${g.targetDate ? "&middot; Target: " + g.targetDate : ""}</p>
                    </div>
                    <div class="actions">
                      ${rowMenu([
                        { copy: `goals:${g.id}`, label: "Copy" },
                        { edit: `goals:${g.id}`, label: "Edit" },
                        { sep: true },
                        { delete: `goals:${g.id}`, label: "Delete", danger: true }
                      ])}
                    </div>
                  </div>
                  <div style="width:100%;">
                    <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
                      <span>${money(goalCurrent)} of ${money(g.target)}</span>
                      <span class="${pct >= 100 ? 'positive' : ''}">${pct}%</span>
                    </div>
                    <div style="width:100%; height:8px; background:var(--border); border-radius:4px; overflow:hidden;">
                      <div style="width:${pct}%; height:100%; background:${pct >= 100 ? 'var(--green)' : 'var(--green-light)'}; border-radius:4px; transition:width 0.3s;"></div>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--muted); margin-top:4px;">
                      <span>Remaining: ${money(remaining)}</span>
                      ${num(g.monthlyContribution) > 0 ? `<span>Monthly: ${money(g.monthlyContribution)} &middot; ~${monthsLeft} months to go</span>` : '<span>No monthly contribution set</span>'}
                    </div>
                  </div>
                  ${g.notes ? `<p style="font-size:11px; color:var(--muted); margin-top:2px;">${escapeHtml(g.notes)}</p>` : ''}
                </div>
              `;
            }).join("") : empty("goals")}
          </div>
        </div>
      `;
    }
