

    /* ── DEFAULT / SEED DATA ── */
    const defaultData = {
      settings: {
        activeModules: { home:true, transactions:true, salary:true, assets:true, liabilities:true, investments:true, tax:true, planning:true, reports:true, settings:true, budgets:true },
        taxYear: "",
        incomeYearStart: "",
        incomeYearEnd: "",
        cascadePolicy: "deleteGenerated",
        owner: "",
        brandSubtitle: "Personal finance core",
        taxSlabs: [
          { threshold: 375000, rate: 0 },
          { threshold: 300000, rate: 0.10 },
          { threshold: 400000, rate: 0.15 },
          { threshold: 500000, rate: 0.20 },
          { threshold: 2000000, rate: 0.25 },
          { threshold: 0, rate: 0.30 }
        ],
        standardDeduction: { fraction: 0.3333, cap: 500000 },
        rebateParams: { rate: 0.15, investmentCapPercent: 0.20, maxCapAbsolute: 10000000 },
        yearlyTaxRules: {},
        salaryTemplate: {
          hra: { type: "percentage", value: 40 },
          conveyance: { type: "fixed", value: 4000 },
          medical: { type: "fixed", value: 0 },
          pfEmployee: { type: "percentage", value: 10 },
          pfEmployer: { type: "percentage", value: 0 },
          defaultTds: 4100,
          otherComponents: [
            { name: "Electricity Allowance", type: "fixed", value: 1890 },
            { name: "Project Allowance", type: "percentage", value: 25 },
            { name: "Water Allowance", type: "fixed", value: 400 },
            { name: "Gas Allowance", type: "fixed", value: 1080 },
            { name: "Shift Allowance", type: "percentage", value: 15 },
            { name: "Special Allowance", type: "percentage", value: 5 }
          ]
        }
      },
      categories: [
        { id: "cat_salary", type: "income", name: "Salary" },
        { id: "cat_leave", type: "income", name: "Leave/SAL encashment" },
        { id: "cat_sc_profit", type: "income", name: "Savings certificate profit" },
        { id: "cat_dps_int", type: "income", name: "DPS/FDR interest" },
        { id: "cat_mf_div", type: "income", name: "Mutual fund dividend" },
        { id: "cat_pf_int", type: "income", name: "PF/investment interest" },
        { id: "cat_rent", type: "expense", name: "Rent/Home" },
        { id: "cat_food", type: "expense", name: "Food/Groceries" },
        { id: "cat_transport", type: "expense", name: "Transport" },
        { id: "cat_utilities", type: "expense", name: "Utilities" },
        { id: "cat_medical", type: "expense", name: "Medical" },
        { id: "cat_family", type: "expense", name: "Family support" },
        { id: "cat_investment", type: "expense", name: "Investment contribution" },
        { id: "cat_tax", type: "expense", name: "Tax/fees" },
        { id: "sys_cat_reimbursement", type: "income", name: "Income/Reimbursement", _system: true },
        { id: "sys_cat_inv_maturity", type: "transfer", name: "Investment maturity/withdrawal", _system: true },
        { id: "sys_cat_internal_transfer", type: "transfer", name: "Internal Transfer", _system: true },
        { id: "sys_cat_asset_reclass", type: "income", name: "Asset reclassification", _system: true },
        { id: "sys_cat_opening_memo", type: "income", name: "Opening balance memo", _system: true }
      ],
      accounts: [
        { id: "acc_cash", name: "Cash Wallet", type: "cash", balance: 0, active: true },
        { id: "acc_primary", name: "Primary Bank Account", type: "bank", balance: 0, active: true },
        { id: "acc_salary", name: "Salary Account", type: "bank", balance: 0, active: true }
      ],
  transactions: [], salary: [], assets: [], liabilities: [],
  investments: [], taxPayments: [], goals: [], links: [],
  netWorthSnapshots: [],
  recurringRules: [],
  budgets: [],
  forecastAssumptions: {
    monthsAhead: 60,
    monthlySavingsOverride: null,
    annualReturnPct: 8,
    inflationPct: 5,
    scenarioName: "Base case",
    stickToBudgets: false
  }
};

    const SEED_DATA = JSON.parse(JSON.stringify(defaultData));

    /* ── CLOSE DRAWER ── */
    function closeDrawer() {
      if (q("drawer")) {
        q("drawer").classList.remove("open");
        q("drawer").setAttribute("aria-hidden", "true");
      }
    }

    /* ── CHART DRAWING ENGINE (Chart.js-free inline SVG) ── */
    function drawCharts() {
      drawNetChart();
      drawAllocationChart();
      drawCashChart();
      drawTaxChart();
      drawNetHistoryChart();
      drawNetTrendChart();
      drawForecastChart();
    }

    // ── Phase 1: shared chart primitives (de-duplicates drawNet/Cash/TaxChart) ──
    function setupHiDpiCanvas(canvas) {
      const container = canvas.parentElement;
      const w = container.offsetWidth || 320;
      const h = container.offsetHeight || 200;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      const ctx = canvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      return { ctx, w, h };
    }

    function drawBarGrid(ctx, w, h, max) {
      ctx.strokeStyle = "rgba(107, 126, 107, 0.12)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      const gridSteps = 3;
      const chartBottom = h - 30;
      const chartTop = 35;
      const chartHeight = chartBottom - chartTop;
      for (let step = 1; step <= gridSteps; step++) {
        const yGrid = chartBottom - Math.round((step / gridSteps) * chartHeight);
        ctx.beginPath();
        ctx.moveTo(45, yGrid);
        ctx.lineTo(w - 15, yGrid);
        ctx.stroke();
        ctx.fillStyle = "rgba(107, 126, 107, 0.75)";
        ctx.font = "9px Segoe UI, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(shortNum((step / gridSteps) * max), 40, yGrid + 3);
      }
      ctx.setLineDash([]);
      return { chartBottom, chartTop, chartHeight };
    }

    function barChart(canvas, bars) {
      const { ctx, w, h } = setupHiDpiCanvas(canvas);
      const max = Math.max(...bars.map(b => b.value)) || 1;
      const { chartBottom, chartHeight } = drawBarGrid(ctx, w, h, max);
      const plotLeft = 50, plotRight = w - 15;
      const slot = (plotRight - plotLeft) / bars.length;
      const barW = Math.min(Math.floor(slot * 0.55), 70);
      bars.forEach((bar, i) => {
        const cx = plotLeft + slot * (i + 0.5);
        const x = cx - barW / 2;
        const bH = Math.round((bar.value / max) * chartHeight);
        const y = chartBottom - bH;
        if (bH > 0) {
          const grad = ctx.createLinearGradient(x, y, x, chartBottom);
          grad.addColorStop(0, bar.color2);
          grad.addColorStop(1, bar.color1);
          ctx.fillStyle = grad;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(x, y, barW, bH, [4, 4, 0, 0]);
          else ctx.rect(x, y, barW, bH);
          ctx.fill();
        }
        ctx.fillStyle = "#6b7e6b";
        ctx.textAlign = "center";
        ctx.font = "600 11px Segoe UI,sans-serif";
        ctx.fillText(bar.label, cx, h - 11);
        ctx.fillStyle = "#1a2e1a";
        ctx.font = "bold 11px Segoe UI,sans-serif";
        ctx.fillText(shortNum(bar.value), cx, Math.max(y - 5, 20));
      });
    }

    function lineChart(canvas, points, opts = {}) {
      const { ctx, w, h } = setupHiDpiCanvas(canvas);
      const color = opts.color || "#1d4c74";
      const fillArea = opts.fillArea !== false;
      const dashedFromIdx = opts.dashedFromIdx || null;
      if (!points.length) {
        ctx.fillStyle = "#6b7e6b";
        ctx.font = "12px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("No history yet — click Backfill in Settings", w / 2, h / 2);
        return;
      }
      const values = points.map(p => p.value);
      const max = Math.max(...values, 0);
      const min = Math.min(...values, 0);
      const range = (max - min) || 1;
      drawBarGrid(ctx, w, h, max);
      const chartBottom = h - 30;
      const chartTop = 35;
      const chartHeight = chartBottom - chartTop;
      const plotLeft = 50;
      const plotRight = w - 15;
      const plotW = plotRight - plotLeft;
      const xFor = i => plotLeft + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
      const yFor = v => chartBottom - ((v - min) / range) * chartHeight;
      if (fillArea) {
        ctx.beginPath();
        ctx.moveTo(xFor(0), chartBottom);
        points.forEach((p, i) => ctx.lineTo(xFor(i), yFor(p.value)));
        ctx.lineTo(xFor(points.length - 1), chartBottom);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, chartTop, 0, chartBottom);
        grad.addColorStop(0, color + "55");
        grad.addColorStop(1, color + "08");
        ctx.fillStyle = grad;
        ctx.fill();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === dashedFromIdx) {
          ctx.stroke();
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.moveTo(xFor(i - 1), yFor(points[i - 1].value));
        }
        const x = xFor(i), y = yFor(p.value);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      // point markers (small, drawn for every point so history is legible)
      ctx.fillStyle = color;
      points.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(xFor(i), yFor(p.value), 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
      // x-axis date labels — concise (e.g. "Jan '24"), thinned to avoid overlap
      ctx.fillStyle = "#6b7e6b";
      ctx.font = "10px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      const fmtDate = d => {
        const dt = new Date(d);
        if (isNaN(dt)) return "";
        const m = dt.toLocaleString("en", { month: "short" });
        const yr = String(dt.getFullYear()).slice(-2);
        return m + " '" + yr;
      };
      const xLabels = points.map((p, i) => ({ i, x: xFor(i), text: fmtDate(p.date) }));
      // estimate ~36px per label; show first, last, and evenly-spaced ones in between
      const step = Math.max(1, Math.ceil(xLabels.length / Math.max(1, Math.floor(plotW / 38))));
      const shown = new Set();
      xLabels.forEach(l => { if (l.i % step === 0 || l.i === xLabels.length - 1) shown.add(l.i); });
      xLabels.forEach(l => {
        if (shown.has(l.i)) ctx.fillText(l.text, l.x, chartBottom + 16);
      });
      const last = points[points.length - 1];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(xFor(points.length - 1), yFor(last.value), 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a2e1a";
      ctx.font = "bold 11px Segoe UI,sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(shortNum(last.value), plotRight, Math.max(yFor(last.value) - 6, 20));
    }

    // History/trend draw functions (Task 6/7 wire the canvases + state; stubs safe to call pre-UI)
    let netHistoryRange = "12";
    function drawNetHistoryChart() {
      const el = q("netHistoryChart");
      if (!el) return;
      const all = (state.netWorthSnapshots || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
      let snaps = all;
      if (netHistoryRange !== "all") {
        const months = parseInt(netHistoryRange, 10);
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - months);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        snaps = all.filter(s => s.date >= cutoffStr);
      }
      lineChart(el, snaps.map(s => ({ date: s.date, value: s.netWorth })), { color: "#1d4c74", fillArea: true });
    }
    function drawNetTrendChart() {
      const el = q("netTrendChart");
      if (!el) return;
      const snaps = (state.netWorthSnapshots || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
      lineChart(el, snaps.map(s => ({ date: s.date, value: s.netWorth })), { color: "#1d4c74", fillArea: true });
    }

    function drawNetChart() {
      const el = q("netChart");
      if (!el) return;
      const d = derive();
      barChart(el, [
        { label: "Assets", value: d.assets, color1: "#2d6a4f", color2: "#52b788" },
        { label: "Liabilities", value: d.liabilities, color1: "#c0392b", color2: "#ff6b6b" },
        { label: "Net Worth", value: Math.max(0, d.netWorth), color1: "#1d4c74", color2: "#3a86c8" }
      ]);
    }

               function drawAllocationChart() {
      const el = q("allocationChart");
      if (!el) return;

      const canvas = el;
      const ctx = canvas.getContext("2d");
      const container = canvas.parentElement;
      const width = container.offsetWidth || 600;
      const height = 240;  // donut only — breakdown lives in the HTML legend beside i

      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.scale(dpr, dpr);

      ctx.clearRect(0, 0, width, height);

      const investments = state.investments || [];
      const typeMap = {};
      const _allocPeriod = taxPeriod();
      const _allocEnd = _allocPeriod.end;

      // Only include investments that were active during the selected period
      // (started by period end AND not yet withdrawn/matured by period end)
      const activeInvestments = investments.filter(i => {
        if (i.startDate && i.startDate > _allocEnd) return false;
        const isClosedBeforePeriodEnd =
          (i.status === 'withdrawn' || i.status === 'matured') &&
          i.withdrawalDate && i.withdrawalDate <= _allocEnd;
        return !isClosedBeforePeriodEnd;
      });

      activeInvestments.forEach(i => {
        const t = i.type || "other";
        typeMap[t] = (typeMap[t] || 0) + num(i.currentValue || i.principal);
      });

      const entries = Object.entries(typeMap);
      const total = entries.reduce((s, [,v]) => s + v, 0) || 1;

      if (!entries.length) {
        ctx.fillStyle = "#6b7e6b";
        ctx.textAlign = "center";
        ctx.font = "14px Segoe UI, sans-serif";
        ctx.fillText("No active investment data", width/2, height/2);
        return;
      }

      const colors = ["#2d6a4f","#52b788","#95d5b2","#c0392b","#e67e22","#285f91","#8e44ad","#2c3e50"];

      const cx = width / 2;
      const cy = height / 2;
      const outerRadius = Math.min(width, height) / 2 - 40;
      const innerRadius = outerRadius * 0.55;

      let angle = -Math.PI / 2;
      entries.forEach(([label, val], i) => {
        const slice = (val / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, outerRadius, angle, angle + slice);
        ctx.arc(cx, cy, innerRadius, angle + slice, angle, true);
        ctx.closePath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
        angle += slice;
      });

      ctx.fillStyle = "#1a2e1a";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 14px Segoe UI, sans-serif";
      ctx.fillText("Total", cx, cy - 10);
      ctx.font = "bold 16px Segoe UI, sans-serif";
      ctx.fillStyle = "#2d6a4f";
      ctx.fillText(money(total), cx, cy + 16);
    }
    function drawCashChart() {
      const el = q("cashChart");
      if (!el) return;
      const _cashPeriod = taxPeriod();
      // Scope to selected period only, show up to 12 months within i
      const txs = (state.transactions || []).filter(t =>
        t.date && (t.type === "income" || t.type === "expense") &&
        withinPeriod(t.date, _cashPeriod)
      );
      const byMonth = {};
      txs.forEach(t => {
        const mo = (t.date || "").slice(0, 7);
        if (!byMonth[mo]) byMonth[mo] = { income: 0, expense: 0 };
        if (t.type === "income") byMonth[mo].income += num(t.amount);
        else byMonth[mo].expense += num(t.amount);
      });
      const months = Object.keys(byMonth).sort().slice(-12);

      const { ctx, w, h } = setupHiDpiCanvas(el);
      if (!months.length) {
        ctx.fillStyle="#6b7e6b"; ctx.textAlign="center"; ctx.font="13px Segoe UI,sans-serif";
        ctx.fillText("No transaction data", w/2, h/2); return;
      }

      const maxVal = Math.max(...months.flatMap(m => [byMonth[m].income, byMonth[m].expense])) || 1;
      const { chartBottom, chartHeight } = drawBarGrid(ctx, w, h, maxVal);

      const barW = Math.floor((w - 70) / (months.length * 3));
      const padL = 50;

      ctx.font = "10px Segoe UI,sans-serif";
      months.forEach((mo, i) => {
        const x = padL + i * barW * 3;
        const incH = Math.round((byMonth[mo].income / maxVal) * chartHeight);
        const expH = Math.round((byMonth[mo].expense / maxVal) * chartHeight);

        const drawBar = (xVal, heightVal, c1, c2) => {
          if (heightVal <= 0) return;
          const y = chartBottom - heightVal;
          const grad = ctx.createLinearGradient(xVal, y, xVal, chartBottom);
          grad.addColorStop(0, c2); grad.addColorStop(1, c1);
          ctx.fillStyle = grad;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(xVal, y, barW, heightVal, [4, 4, 0, 0]);
          else ctx.rect(xVal, y, barW, heightVal);
          ctx.fill();
        };
        drawBar(x, incH, "#2d6a4f", "#52b788");
        drawBar(x + barW + 3, expH, "#c0392b", "#ff6b6b");

        ctx.fillStyle = "#6b7e6b";
        ctx.textAlign = "center";
        const parts = mo.split("-");
        const monthLabel = parts[1] === "01" ? parts[0].slice(2) + "/" + parts[1] : parts[1];
        ctx.fillText(monthLabel, x + barW + 1.5, h - 12);
      });

      // Legend
      ctx.fillStyle = "#2d6a4f";
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(padL, 10, 10, 10, 2) : ctx.rect(padL, 10, 10, 10);
      ctx.fill();
      ctx.fillStyle = "#1a2e1a";
      ctx.textAlign = "left";
      ctx.font = "600 11px Segoe UI,sans-serif";
      ctx.fillText("Income", padL + 14, 18);
      ctx.fillStyle = "#c0392b";
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(padL + 75, 10, 10, 10, 2) : ctx.rect(padL + 75, 10, 10, 10);
      ctx.fill();
      ctx.fillStyle = "#1a2e1a";
      ctx.fillText("Expense", padL + 89, 18);
    }

    function drawTaxChart() {
      const el = q("taxChart");
      if (!el) return;
      const d = derive();
      barChart(el, [
        { label: "Estimated", value: d.estimatedTax, color1: "#d35400", color2: "#e67e22" },
        { label: "Paid/TDS", value: d.taxPaid, color1: "#2d6a4f", color2: "#52b788" },
        { label: "Gap", value: d.taxDue, color1: d.taxDue > 0 ? "#c0392b" : "#27ae60", color2: d.taxDue > 0 ? "#ff6b6b" : "#2ecc71" }
      ]);
    }

    function shortNum(n) {
      n = Number(n || 0);
      if (n >= 1e7) return (n/1e7).toFixed(1) + "Cr";
      if (n >= 1e5) return (n/1e5).toFixed(1) + "L";
      if (n >= 1e3) return (n/1e3).toFixed(0) + "K";
      return String(Math.round(n));
    }



    /* ── BASE MODULES ── */
    const storeKey = "bdPersonalFinanceOsCore.v1";
    const today = new Date().toISOString().slice(0, 10);

    // ── Phase 1: net-worth snapshot engine ──
    // captureSnapshot: compute net worth as-of today (or a given date) and append,
    // deduped by date (one snapshot per date, max). Writes to state + marks dirty.
    function captureSnapshot(asOf) {
      const date = asOf || today;
      state.netWorthSnapshots = state.netWorthSnapshots || [];
      // dedupe: replace if a snapshot for this date exists
      const existingIdx = state.netWorthSnapshots.findIndex(s => s.date === date);
      const snap = { id: id(), ...netWorthAsOf(date) };
      if (existingIdx >= 0) {
        state.netWorthSnapshots[existingIdx] = snap;
      } else {
        state.netWorthSnapshots.push(snap);
        state.netWorthSnapshots.sort((a, b) => (a.date < b.date ? -1 : 1));
      }
      return snap;
    }

    // maybeCaptureDailySnapshot: called on app open. If no snapshot exists for today,
    // capture one. Idempotent and cheap. Does NOT backfill past days.
    function maybeCaptureDailySnapshot() {
      state.netWorthSnapshots = state.netWorthSnapshots || [];
      const hasToday = state.netWorthSnapshots.some(s => s.date === today);
      if (!hasToday) captureSnapshot(today);
    }

    // runBackfill: walk month-ends from earliest tx/salary/investment date to today,
    // synthesizing a snapshot at each missing month-end. Uses netWorthAsOf (which
    // reconstructs balances from transactions), so it's accurate even for periods
    // before daily snapshots began.
    function runBackfill() {
      state.netWorthSnapshots = state.netWorthSnapshots || [];
      // Find the earliest relevant date across all dated entities.
      const allDates = [];
      for (const t of (state.transactions || [])) if (t.date) allDates.push(t.date);
      for (const s of (state.salary || [])) if (s.date) allDates.push(s.date);
      for (const i of (state.investments || [])) { if (i.startDate) allDates.push(i.startDate); if (i.withdrawalDate) allDates.push(i.withdrawalDate); }
      for (const a of (state.assets || [])) if (a.acquiredDate) allDates.push(a.acquiredDate);
      for (const l of (state.liabilities || [])) if (l.openedDate) allDates.push(l.openedDate);
      if (!allDates.length) return { added: 0 };
      allDates.sort();
      const startStr = allDates[0].slice(0, 7) + "-01"; // first day of earliest month

      // Iterate month-ends from start to today.
      let added = 0;
      let cursor = new Date(startStr + "T00:00:00");
      const endCursor = new Date(today + "T00:00:00");
      while (cursor <= endCursor) {
        // last day of cursor's month
        const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
        const dateStr = monthEnd.toISOString().slice(0, 10);
        const exists = state.netWorthSnapshots.some(s => s.date === dateStr);
        if (!exists && dateStr <= today) {
          captureSnapshot(dateStr);
          added++;
        }
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
      return { added };
    }

    function currentTaxYear() {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const startYear = m >= 6 ? y : y - 1;
      return `${startYear + 1}-${String(startYear + 2).slice(-2)}`;
    }

    function taxYearDates(label) {
      if (!label || !label.includes("-")) label = currentTaxYear();
      const ay = parseInt(label.split("-")[0]);
      return { start: `${ay - 1}-07-01`, end: `${ay}-06-30` };
    }


    function taxYearStartNumber(label) {
      const first = parseInt(String(label || "").split("-")[0], 10);
      return Number.isFinite(first) ? first - 1 : new Date().getFullYear();
    }

    function taxYearLabelFromStart(startYear) {
      return `${startYear + 1}-${String(startYear + 2).slice(-2)}`;
    }

    function taxYearOptionsHtml() {
      const labels = new Set([currentTaxYear(), state?.settings?.taxYear].filter(Boolean));
      const anchors = [taxYearStartNumber(currentTaxYear()), taxYearStartNumber(state?.settings?.taxYear)];
      anchors.forEach(anchor => {
        for (let offset = -8; offset <= 12; offset++) labels.add(taxYearLabelFromStart(anchor + offset));
      });
      [
        ...(state?.salary || []).map(s => s.date),
        ...(state?.transactions || []).map(t => t.date),
        ...(state?.taxPayments || []).map(p => p.date),
        ...(state?.investments || []).map(i => i.startDate || i.withdrawalDate || i.maturityDate),
        ...(state?.assets || []).map(a => a.acquiredDate),
        ...(state?.documents || []).map(d => d.taxYear)
      ].filter(Boolean).forEach(value => {
        if (/^\d{4}-\d{2}$/.test(String(value))) labels.add(value);
        else labels.add(taxYearForDate(value));
      });
      Object.keys(state?.settings?.yearlyTaxSlabs || {}).forEach(y => labels.add(y));
      Object.keys(state?.settings?.yearlyTaxRules || {}).forEach(y => labels.add(y));
      const currentY = state?.settings?.taxYear || currentTaxYear();
      return Array.from(labels)
        .filter(Boolean)
        .sort((a, b) => taxYearStartNumber(a) - taxYearStartNumber(b))
        .map(y => `<option value="${y}" ${currentY === y ? "selected" : ""}>${y}</option>`)
        .join("");
    }
    function getTaxSlabsForYear(taxYear) {
      if (!taxYear) taxYear = state?.settings?.taxYear || currentTaxYear();
      if (!state.settings.yearlyTaxSlabs) {
        state.settings.yearlyTaxSlabs = {};
      }
      if (!state.settings.yearlyTaxSlabs[taxYear]) {
        if (state.settings.taxSlabs && state.settings.taxSlabs.length > 0) {
          state.settings.yearlyTaxSlabs[taxYear] = safeClone(state.settings.taxSlabs);
        } else {
          state.settings.yearlyTaxSlabs[taxYear] = [
            { threshold: 375000, rate: 0 },
            { threshold: 300000, rate: 0.10 },
            { threshold: 400000, rate: 0.15 },
            { threshold: 500000, rate: 0.20 },
            { threshold: 2000000, rate: 0.25 },
            { threshold: 0, rate: 0.30 }
          ];
        }
      }
      return state.settings.yearlyTaxSlabs[taxYear];
    }
    function getTaxRulesForYear(taxYear) {
      if (!taxYear) taxYear = state?.settings?.taxYear || currentTaxYear();
      state.settings.yearlyTaxRules = state.settings.yearlyTaxRules || {};
      if (!state.settings.yearlyTaxRules[taxYear]) {
        state.settings.yearlyTaxRules[taxYear] = {
          standardDeduction: safeClone(state.settings.standardDeduction || { fraction: 0.3333, cap: 500000 }),
          rebateParams: safeClone(state.settings.rebateParams || { rate: 0.15, investmentCapPercent: 0.20, maxCapAbsolute: 10000000 })
        };
      }
      const rules = state.settings.yearlyTaxRules[taxYear];
      rules.standardDeduction = rules.standardDeduction || safeClone(state.settings.standardDeduction || { fraction: 0.3333, cap: 500000 });
      rules.rebateParams = rules.rebateParams || safeClone(state.settings.rebateParams || { rate: 0.15, investmentCapPercent: 0.20, maxCapAbsolute: 10000000 });
      return rules;
    }

    const bdt = new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 });


    function id() {
      return "id_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    }

    function safeClone(obj) {
      try { return structuredClone(obj); } catch { return JSON.parse(JSON.stringify(obj)); }
    }

    function mergeDefaults(data) {
      const merged = safeClone(defaultData);
      Object.assign(merged, data);
      merged.settings = Object.assign({}, safeClone(defaultData.settings), data.settings || {});
      merged.settings.activeModules = Object.assign({}, safeClone(defaultData.settings.activeModules), data.settings?.activeModules || {});
      return migrateState(merged);
    }

    function migrateState(data) {
      // ── Phase 1: ensure top-level arrays exist (auto-migration for older backups) ──
      if (!Array.isArray(data.netWorthSnapshots)) data.netWorthSnapshots = [];
      // ── Phase 2/3: recurring rules + budgets (default empty; old data loads unchanged) ──
      if (!Array.isArray(data.recurringRules)) data.recurringRules = [];
      if (!Array.isArray(data.budgets)) data.budgets = [];
      // ── Phase 4: forecast assumptions (defaults set, never overwritten if present) ──
      if (!data.forecastAssumptions || typeof data.forecastAssumptions !== "object") data.forecastAssumptions = {};
      data.forecastAssumptions = Object.assign({
        monthsAhead: 60, monthlySavingsOverride: null, annualReturnPct: 8,
        inflationPct: 5, scenarioName: "Base case", stickToBudgets: false
      }, data.forecastAssumptions);
      data.settings = data.settings || {};
      data.settings.activeModules = data.settings.activeModules || {};
      if (data.settings.activeModules.expenses === undefined) {
        data.settings.activeModules.expenses = true;
      }
      data.settings.expenseSort = data.settings.expenseSort || "desc";
      data.settings.expenseCategoryFilter = data.settings.expenseCategoryFilter || "";
      data.settings.transactionSort = data.settings.transactionSort || "desc";
      data.settings.yearlyTaxSlabs = data.settings.yearlyTaxSlabs || {};
      if (!data.settings.taxYear) {
        data.settings.taxYear = currentTaxYear();
      }
      const autoYearDates = taxYearDates(data.settings.taxYear);
      if (!data.settings.incomeYearStart) data.settings.incomeYearStart = autoYearDates.start;
      if (!data.settings.incomeYearEnd) data.settings.incomeYearEnd = autoYearDates.end;
      if (!data.settings.taxSlabs || !data.settings.taxSlabs.length) {
        data.settings.taxSlabs = [
          { threshold: 375000, rate: 0 },
          { threshold: 300000, rate: 0.10 },
          { threshold: 400000, rate: 0.15 },
          { threshold: 500000, rate: 0.20 },
          { threshold: 2000000, rate: 0.25 },
          { threshold: 0, rate: 0.30 }
        ];
      }
      if (!data.settings.standardDeduction) data.settings.standardDeduction = { fraction: 0.3333, cap: 500000 };
      if (!data.settings.rebateParams) data.settings.rebateParams = { rate: 0.15, investmentCapPercent: 0.20, maxCapAbsolute: 10000000 };
      data.settings.yearlyTaxRules = data.settings.yearlyTaxRules || {};
      if (!data.settings.yearlyTaxRules[data.settings.taxYear]) {
        data.settings.yearlyTaxRules[data.settings.taxYear] = {
          standardDeduction: safeClone(data.settings.standardDeduction),
          rebateParams: safeClone(data.settings.rebateParams)
        };
      }
      // Ensure system categories always exist (they power auto-generated transactions)
      const SYSTEM_CATS = [
        { id: "sys_cat_reimbursement", type: "income", name: "Income/Reimbursement", _system: true },
        { id: "sys_cat_inv_maturity", type: "transfer", name: "Investment maturity/withdrawal", _system: true },
        { id: "sys_cat_internal_transfer", type: "transfer", name: "Internal Transfer", _system: true },
        { id: "sys_cat_asset_reclass", type: "income", name: "Asset reclassification", _system: true },
        { id: "sys_cat_opening_memo", type: "income", name: "Opening balance memo", _system: true }
      ];
      SYSTEM_CATS.forEach(sc => {
        if (!data.categories) data.categories = [];
        if (!data.categories.some(c => c.id === sc.id)) data.categories.push(sc);
      });
      if (!data.settings.brandSubtitle) data.settings.brandSubtitle = "Personal finance core";
      if (data.settings.hideZeroValueAssets === undefined) data.settings.hideZeroValueAssets = true;
      if (!data.settings.salaryTemplate) {
        data.settings.salaryTemplate = {
          hra: { type: "percentage", value: 40 },
          conveyance: { type: "fixed", value: 4000 },
          medical: { type: "fixed", value: 0 },
          pfEmployee: { type: "percentage", value: 10 },
          pfEmployer: { type: "percentage", value: 0 },
          defaultTds: 4100,
          otherComponents: [
            { name: "Electricity Allowance", type: "fixed", value: 1890 },
            { name: "Project Allowance", type: "percentage", value: 25 },
            { name: "Water Allowance", type: "fixed", value: 400 },
            { name: "Gas Allowance", type: "fixed", value: 1080 },
            { name: "Shift Allowance", type: "percentage", value: 15 },
            { name: "Special Allowance", type: "percentage", value: 5 }
          ]
        };
      }
      normalizeTransactionCashFlowModes(data);
      data.investments = consolidateProvidentFundRecords(data.investments || []);
      normalizeInvestmentFunding(data);
      syncInvestmentFundingRecords(data);

      // ── PF LEDGER AGGREGATION MIGRATION ──
      // Collapse any legacy per-month salary PF entries (entries carrying a
      // sourceId) into one aggregate entry per financial year. Safe to re-run:
      // entries already in aggregate form are regenerated from salary data, and
      // manual entries (interest, opening balances) are preserved.
      try {
        const salaryList = data.salary || [];
        (data.investments || []).forEach(inv => {
          if (inv.type !== "provident_fund") return;
          const hasLegacy = Array.isArray(inv.pfLedger) && inv.pfLedger.some(e => e.sourceId && e.sourceType !== 'salaryAggregate');
          if (hasLegacy || !Array.isArray(inv.pfLedger)) {
            // Inline rebuild using the same logic as rebuildSalaryPfAggregates,
            // but operating on the raw data object (state may not be set yet).
            const manual = (inv.pfLedger || []).filter(e => e.sourceType !== 'salaryAggregate' && !e.sourceId);
            const byYear = {};
            salaryList.forEach(s => {
              const fy = taxYearForDate(s.date);
              if (!fy) return;
              const contrib = num(s.pfEmployee) + num(s.pfEmployer);
              if (contrib <= 0) return;
              if (!byYear[fy]) byYear[fy] = { total: 0, lastDate: "" };
              byYear[fy].total += contrib;
              if (String(s.date || "") > String(byYear[fy].lastDate)) byYear[fy].lastDate = s.date;
            });
            const aggregates = Object.keys(byYear).sort().map(fy => {
              const info = byYear[fy];
              return {
                id: inv.id + "_agg_" + fy,
                sourceType: 'salaryAggregate',
                sourceYear: fy,
                date: info.lastDate || (taxYearDates(fy)?.end || today),
                name: `PF contributions – AY ${fy} (from salary)`,
                principal: info.total,
                currentValue: info.total,
                taxableProfit: 0,
                taxDeducted: 0,
                notes: `Aggregated employee + employer PF from salary records for AY ${fy}.
              };
            });
            inv.pfLedger = [...manual, ...aggregates];
            inv.principal = inv.pfLedger.reduce((sum, e) => sum + num(e.principal), 0);
            inv.currentValue = inv.pfLedger.reduce((sum, e) => sum + num(e.currentValue || e.principal), 0);
            inv.taxableProfit = inv.pfLedger.reduce((sum, e) => sum + num(e.taxableProfit), 0);
            inv.taxDeducted = inv.pfLedger.reduce((sum, e) => sum + num(e.taxDeducted), 0);
            inv.startDate = inv.pfLedger[0]?.date || inv.startDate || today;
          }
        });
      } catch (e) { console.error("PF aggregate migration failed", e); }

      // ── PROFIT TAX TREATMENT MIGRATION ──
      // Every investment gets profitTaxMethod ('final' | 'slab'). Defaults are
      // type-aware: savings_certificate & provident_fund → 'final' (source tax
      // IS the final tax); everything else (dps, fdr, mutual_fund, other) →
      // 'slab' (profit joins the slab base, source tax is a credit). The user
      // can flip either option on any investment at withdrawal. Idempotent.
      (data.investments || []).forEach(inv => {
        if (!inv.profitTaxMethod) inv.profitTaxMethod = defaultProfitTaxMethod(inv.type);
      });

      // ── PHASE 1.2: Tag special income categories with isIncomeSourceOfTruth ──
      const SALARY_CAT_NAMES_P12 = ["Salary"];
      const INV_CAT_NAMES_P12 = ["PF/investment interest","DPS/FDR interest","Savings certificate profit","Mutual fund dividend"];
      (data.categories || []).forEach(c => {
        if (!c.isIncomeSourceOfTruth) {
          if (SALARY_CAT_NAMES_P12.includes(c.name)) c.isIncomeSourceOfTruth = "salary";
          else if (INV_CAT_NAMES_P12.includes(c.name)) c.isIncomeSourceOfTruth = "investment";
        }
      });

      // ── PHASE 2.1: Link existing unlinked salary transactions to their salary rows ──
      syncSalaryTransactionsFromMigration(data);

      // ── PHASE 3.1: Deactivate standalone Expenses module (merged into Transactions type filter) ──
      data.settings.activeModules.expenses = false;
      if (data.settings.transactionTypeFilter === undefined) data.settings.transactionTypeFilter = "";
      if (data.settings.transactionPeriodFilter === undefined) data.settings.transactionPeriodFilter = "current";

      return data;
    }

    // Type-aware default for how an investment's profit is taxed after
    // withdrawal/maturity. Savings certificates & provident funds use source
    // tax as the FINAL tax; DPS/FDR/mutual funds/other roll the profit into
    // the ordinary slab base (source tax becomes a credit). Either value is
    // user-overridable per investment at any time.
    function defaultProfitTaxMethod(type) {
      return (type === "savings_certificate" || type === "provident_fund") ? "final" : "slab";
    }

    function assessmentYearFromText(text) {
      const raw = String(text || "");
      let match = raw.match(/Assessment\s+Year\s+(20\d{2})\s*[-–]\s*(20)?(\d{2})/i);
      if (match) return `${match[1]}-${match[3]}`;
      match = raw.match(/\bAY\s*(20\d{2})\s*[-–]\s*(20)?(\d{2})\b/i);
      if (match) return `${match[1]}-${match[3]}`;
      match = raw.match(/\bFY\s*(20\d{2})\s*[-–]\s*(\d{2})\b/i);
      if (match) {
        const fyStart = Number(match[1]);
        return `${fyStart + 1}-${String(fyStart + 2).slice(-2)}`;
      }
      return "";
    }

    function normalizeTaxYearMetadata(data) {
      (data.documents || []).forEach(doc => {
        const inferred = assessmentYearFromText([doc.name, doc.fileName, doc.extracted, doc.notes].join(" | "));
        if (inferred && doc.type === "tax_return") doc.taxYear = inferred;
      });
      (data.taxPayments || []).forEach(payment => {
        const linkedDoc = (data.documents || []).find(doc => doc.id && doc.id === payment.documentId);
        const inferred = linkedDoc?.taxYear || assessmentYearFromText([payment.name, payment.notes].join(" | "));
        if (inferred) payment.taxYear = inferred;
      });
    }

    function transactionAffectsAccount(tx) {
      return tx?.affectsAccount !== false && tx?.cashFlowMode !== "memo";
    }

    function normalizeTransactionCashFlowModes(data) {
      const taxDocs = new Set((data.documents || []).filter(doc => doc.type === "tax_return").map(doc => doc.id));
      const dates = taxYearDates(data?.settings?.taxYear);
      const period = {
        start: data?.settings?.incomeYearStart || dates.start,
        end: data?.settings?.incomeYearEnd || dates.end
      };
      (data.transactions || []).forEach(tx => {
        const text = [tx.name, tx.category, tx.notes].join(" | ");
        const linkedPriorTaxReturn = taxDocs.has(tx.documentId) && !withinPeriod(tx.date, period);
        const aggregateTaxMemo = /Aggregate|Declared in ITR|Schedule IT-10BB|Lifestyle Expense|ITR TDS/i.test(text);
        const accruedOnlyIncome = tx.type === "income" && /Accrued/i.test(text) && !/(received|credited|paid)/i.test(text);
        if (linkedPriorTaxReturn || aggregateTaxMemo || accruedOnlyIncome) {
          tx.affectsAccount = false;
          tx.cashFlowMode = "memo";
        } else if (tx.affectsAccount === undefined) {
          tx.affectsAccount = true;
        }
        // ── Category rename migration ──
        // The "Internal Transfer" category used to be overloaded by the asse
        // reclassification machine and the opening-balance snapshot memo. Those now
        // have their own categories, and "Internal Transfer" is reserved for real
        // account-to-account cash transfers. Re-tag legacy records accordingly so
        // filters and grouping stay consistent after the split.
        if (tx.category === "Internal Transfer") {
          if (tx.generatedKind === "assetTransfer") tx.category = "Asset reclassification";
          else if (tx.generatedKind === "openingSnapshot" || /^Opening balance snapshot/.test(tx.name || "")) tx.category = "Opening balance memo";
          // Anything else keeps "Internal Transfer" (now meaning a real A→B transfer).
        }
      });
    }

    function preferredInvestmentFundingAccount(data) {
      const accounts = data?.accounts || [];
      return accounts.find(a => /salary/i.test(a.name || ""))?.id
        || accounts.find(a => /primary|bank/i.test(`${a.name || ""} ${a.type || ""}`))?.id
        || accounts[0]?.id
        || "";
    }

    function investmentFundingAmount(inv) {
      return num(inv.fundingAmount || inv.principal || inv.currentValue);
    }

    function normalizeInvestmentFunding(data) {
      const dates = taxYearDates(data?.settings?.taxYear);
      const period = {
        label: data?.settings?.taxYear || currentTaxYear(),
        start: data?.settings?.incomeYearStart || dates.start,
        end: data?.settings?.incomeYearEnd || dates.end
      };
      const defaultFundingAccountId = preferredInvestmentFundingAccount(data);
      (data.investments || []).forEach(inv => {
        if (inv.type === "provident_fund") {
          inv.fundingMode = "payroll_pf";
          inv.fundingAccountId = "";
          inv.fundingAmount = 0;
          return;
        }
        if (!inv.fundingMode) {
          inv.fundingMode = withinPeriod(inv.startDate, period) ? "cash_account" : "external_opening";
        }
        if (inv.fundingMode === "cash_account" && !inv.fundingAccountId) {
          inv.fundingAccountId = defaultFundingAccountId;
        }
        if (inv.fundingMode === "cash_account" && !inv.fundingAmount) {
          inv.fundingAmount = num(inv.principal || inv.currentValue);
        }
      });
    }

    function syncInvestmentFundingRecords(data = state) {
      data.transactions = data.transactions || [];
      const keepIds = new Set();
      (data.investments || []).forEach(inv => {
        if (inv.type === "provident_fund" || inv.fundingMode !== "cash_account" || inv.status === "withdrawn" || inv.status === "matured") return;
        const amount = investmentFundingAmount(inv);
        if (!amount || !inv.fundingAccountId) return;
        const existing = data.transactions.find(t => t.sourceType === "investments" && t.sourceId === inv.id && t.generatedKind === "investmentFunding");
        const candidate = existing || data.transactions.find(t =>
          !t.sourceType &&
          t.type === "expense" &&
          t.category === "Investment contribution" &&
          num(t.amount) === amount &&
          (!inv.fundingAccountId || !t.accountId || t.accountId === inv.fundingAccountId) &&
          (!inv.startDate || !t.date || String(t.date).slice(0, 7) === String(inv.startDate).slice(0, 7) || String(t.name || "").toLowerCase().includes(String(inv.name || "").toLowerCase().slice(0, 18)))
        );
        const tx = {
          id: candidate?.id || id(),
          name: `Investment funding - ${inv.name}`,
          type: "expense",
          date: inv.fundingDate || inv.startDate || today,
          amount,
          taxableAmount: 0,
          category: "Investment contribution",
          accountId: inv.fundingAccountId,
          documentId: inv.documentId || "",
          sourceType: "investments",
          sourceId: inv.id,
          generatedKind: "investmentFunding",
          affectsAccount: true,
          cashFlowMode: "cash",
          notes: "Generated cash outflow so this investment is not double-counted as both bank cash and invested asset. PF uses payroll funding and does not create this outflow."
        };
        if (candidate) Object.assign(candidate, tx);
        else data.transactions.push(tx);
        keepIds.add(tx.id);
      });
      // Preserve historical funding outflows for closed investments. Previously this line deleted
      // any investmentFunding tx whose source investment was withdrawn/matured (not in keepIds),
      // which erased the real cash outflow from account history and inflated account balances on
      // reload. The reconciliation bridge now handles same-period closed funding explicitly, so we
      // no longer strip funding records here — they remain a true part of cash history.
      data.transactions = data.transactions.filter(t => t.generatedKind !== "investmentFunding" || keepIds.has(t.id) || t.sourceId && (data.investments || []).some(inv => inv.id === t.sourceId && (inv.status === "withdrawn" || inv.status === "matured")));
    }

    function investmentFundingLabel(inv) {
      if (inv.type === "provident_fund" || inv.fundingMode === "payroll_pf") return "Payroll PF - no cash outflow";
      if (inv.fundingMode === "cash_account") return `Funded from ${accountName(inv.fundingAccountId)}`;
      return "Opening/external asset";
    }
    function consolidateProvidentFundRecords(investments) {
      const pfRows = investments.filter(i => i.type === "provident_fund");
      if (pfRows.length <= 1 && !pfRows.some(i => !Array.isArray(i.pfLedger))) return investments;
      const nonPfRows = investments.filter(i => i.type !== "provident_fund");
      const master = safeClone(pfRows[0] || {
        id: "id_inv_pf_consolidated",
        name: "Provident Fund Balance",
        type: "provident_fund",
        institution: "Provident Fund",
        rebateEligible: true
      });
      const ledger = [];
      pfRows.forEach(row => {
        if (Array.isArray(row.pfLedger)) ledger.push(...row.pfLedger.map(entry => Object.assign({}, entry)));
        ledger.push({
          id: row.id,
          date: row.startDate || row.withdrawalDate || row.maturityDate || today,
          name: row.name || "Provident Fund entry",
          principal: num(row.principal),
          currentValue: num(row.currentValue || row.principal),
          taxableProfit: num(row.taxableProfit),
          taxDeducted: num(row.taxDeducted),
          notes: row.notes || ""
        });
      });
      const uniqueLedger = Array.from(new Map(ledger.filter(e => e.id || e.date || e.name).map(e => [e.id || `${e.date}:${e.name}:${e.principal}`, e])).values())
        .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
      master.id = master.id || "id_inv_pf_consolidated";
      master.name = "Provident Fund Balance";
      master.type = "provident_fund";
      master.pfLedger = uniqueLedger;
      master.principal = uniqueLedger.reduce((sum, e) => sum + num(e.principal), 0);
      master.currentValue = uniqueLedger.reduce((sum, e) => sum + num(e.currentValue || e.principal), 0);
      master.taxableProfit = uniqueLedger.reduce((sum, e) => sum + num(e.taxableProfit), 0);
      master.taxDeducted = uniqueLedger.reduce((sum, e) => sum + num(e.taxDeducted), 0);
      master.startDate = uniqueLedger[0]?.date || master.startDate || today;
      master.notes = master.notes || "Consolidated rolling provident fund balance. Yearly PF entries are retained inside the PF ledger for tax-year filtering.";
      return [...nonPfRows, master];
    }

    function load() {
      try {
        // Parse embedded state (the JSON baked into the HTML file itself)
        const embeddedEl = q("embeddedState");
        let embeddedData = null;
        if (embeddedEl && embeddedEl.textContent.trim() && embeddedEl.textContent.trim() !== '{}') {
          try { embeddedData = JSON.parse(embeddedEl.textContent); } catch(e) { embeddedData = null; }
        }

        // Parse localStorage state (live edits written by save())
        const stored = localStorage.getItem(storeKey);
        let storedData = null;
        if (stored) {
          try { storedData = JSON.parse(stored); } catch(e) { storedData = null; }
        }

        const hasRecords = d => d &&
          ((d.salary?.length > 0) || (d.transactions?.length > 0) ||
           (d.investments?.length > 0) || (d.assets?.length > 0));
        const embeddedHasRecords = hasRecords(embeddedData);
        const storedHasRecords = hasRecords(storedData);

        // ── PORTABILITY MODEL ──
        // On file:// the browser CANNOT silently overwrite this file, so save()
        // writes every edit to localStorage. To keep those edits alive across
        // refresh/reopen, we pick whichever source is NEWER by lastSavedAt.
        // This is the fix for "my transfer disappears on reload": your live
        // edits (in localStorage) now win over the stale embedded copy.
        // First-run (no records anywhere) seeds localStorage + returns seed.
        if (embeddedHasRecords && storedHasRecords) {
          const eTime = Date.parse(embeddedData.settings?.lastSavedAt || 0) || 0;
          const sTime = Date.parse(storedData.settings?.lastSavedAt || 0) || 0;
          if (sTime >= eTime) {
            console.info('[Finance OS] Loaded from localStorage (newer than file).');
            return mergeDefaults(storedData);
          }
          console.info('[Finance OS] Loaded from embedded file (newer than localStorage).');
          return mergeDefaults(embeddedData);
        }
        if (storedHasRecords) {
          console.info('[Finance OS] Loaded from localStorage.');
          return mergeDefaults(storedData);
        }
        if (embeddedHasRecords) {
          console.info('[Finance OS] Loaded from embedded file.');
          // Mirror the embedded data into localStorage so future edits have a
          // live baseline to compare against — otherwise the timestamp logic
          // above can't detect "edited since file was opened".
          try { localStorage.setItem(storeKey, JSON.stringify(embeddedData)); } catch(e) {}
          return mergeDefaults(embeddedData);
        }

        const seeded = migrateState(safeClone(SEED_DATA));
        localStorage.setItem(storeKey, JSON.stringify(seeded));
        return seeded;
      } catch (err) {
        console.error("Load failed, falling back to seed.", err);
        return safeClone(SEED_DATA);
      }
    }

    let _dirty = false;
    // ── File System Access API plumbing ──
    // Holds the handle to finance_os_portable.html on disk once granted, so every
    // edit can write silently in place (no download prompt). Falls back to auto-
    // download when the API is unavailable (Firefox/Safari).
    let _fileHandle = null;
    let _fileWriteQueued = false;
    const _fileSupport = "showSaveFilePicker" in window;
    const _idbDb = "_finance_os";
    const _idbStore = "handles";
    // Persist the file handle in IndexedDB so a granted handle survives reloads
    // (the API only re-grants per session otherwise). Re-permission is still
    // required on first write after a reload, but no re-pick of the file.
    function idbGetHandle() {
      return new Promise(resolve => {
        if (!_fileSupport || !window.indexedDB) return resolve(null);
        const req = indexedDB.open(_idbDb, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(_idbStore);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(_idbStore, "readonly").objectStore(_idbStore).get("primary");
          tx.onsuccess = () => resolve(tx.result || null);
          tx.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      });
    }
    function idbPutHandle(handle) {
      try {
        const req = indexedDB.open(_idbDb, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(_idbStore);
        req.onsuccess = () => {
          const db = req.result;
          db.transaction(_idbStore, "readwrite").objectStore(_idbStore).put(handle, "primary");
        };
      } catch (e) { /* non-fatal */ }
    }
    function idbClearHandle() {
      try {
        const req = indexedDB.open(_idbDb, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(_idbStore);
        req.onsuccess = () => req.result.transaction(_idbStore, "readwrite").objectStore(_idbStore).delete("primary");
      } catch (e) { /* non-fatal */ }
    }

    // ── SAVE MODEL (file:// reality) ──
    // The browser CANNOT silently overwrite this file when it's opened from
    // disk (file:// is not a secure context, so the File System Access API is
    // blocked). Therefore:
    //   • localStorage is the PRIMARY, GUARANTEED store. Every edit lands here
    //     instantly and survives refresh/reopen. load() picks the newer of
    //     localStorage-vs-embedded, so your edits are never lost.
    //   • If the File System Access picker happens to work (rare on file://,
    //     works when served over localhost), we ALSO write in place as a bonus.
    //     Nothing depends on it succeeding.
    //   • "Save File" (the button) downloads a fresh portable copy with your
    //     data baked in — that's the artifact you copy around. One download,
    //     you replace the old file. No spam, no background downloads.
    function save() {
      try {
        state.settings = state.settings || {};
        state.settings.lastSavedAt = new Date().toISOString();
        localStorage.setItem(storeKey, JSON.stringify(state)); // guaranteed
        _dirty = true; updateSaveBtn();
        queueFileWrite(); // bonus in-place attempt only; safe to fail
      } catch (err) { console.error("Save failed", err); }
    }
    // Persist pure view/UI state (e.g. which sub-tab is open) to localStorage so
    // it survives reloads, WITHOUT marking the file dirty. Only real data edits
    // should turn the Save button orange.
    function persistViewOnly() {
      try {
        state.settings = state.settings || {};
        localStorage.setItem(storeKey, JSON.stringify(state));
      } catch (err) { console.error("Persist failed", err); }
    }
    // Debounce: collapse rapid saves (e.g. typing in a form) into one write.
    function queueFileWrite() {
      if (_fileWriteQueued) return;
      _fileWriteQueued = true;
      setTimeout(() => { _fileWriteQueued = false; persistToFile(); }, 400);
    }
    // Write current state into the linked file handle (if one is set).
    // Called automatically on every save() once the user has linked a file.
    // Silently skips if no handle or permission is not already granted.
    // The Overwrite button (a user-gesture) handles re-granting permission.
    async function persistToFile() {
      if (!_fileHandle) return;
      try {
        const perm = await _fileHandle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') return; // keep dirty; Overwrite button re-grants
        const writable = await _fileHandle.createWritable();
        await writable.write(getCleanPortableHtml());
        await writable.close();
        _dirty = false; updateSaveBtn(); updateOverwriteBtn();
      } catch (err) {
        console.warn('Silent in-place write failed:', err);
        // Don't nuke the handle on transient errors.
      }
    }
    // Pick the file once via the picker (only works over localhost/https). Used
    // by the Save button as the "try silent in-place" path; on file:// it will
    // throw and we fall back to download. Never throws out to the caller.
    async function chooseFileHandle() {
      try {
        _fileHandle = await window.showSaveFilePicker({
          suggestedName: "finance_os_portable.html",
          types: [{ description: "HTML", accept: { "text/html": [".html"] } }]
        });
        idbPutHandle(_fileHandle);
        await persistToFile();
      } catch (err) {
        // On file:// this throws SecurityError → fall back to a download.
        _fileHandle = null;
        downloadPortableHtml();
        _dirty = false; updateSaveBtn();
      }
    }
    function markClean() { _dirty = false; updateSaveBtn(); updateOverwriteBtn(); }
    function updateSaveBtn() {
      const btn = q("savePortableBtn");
      if (!btn) return;
      btn.classList.toggle("dirty", _dirty);
      btn.textContent = "Export portable HTML";
    }
    function updateOverwriteBtn() {
      const btn = q("overwriteFileBtn");
      if (!btn) return;
      if (_fileHandle) {
        btn.textContent = "Save linked file";
        btn.title = "Write current data directly into your linked .html file";
        btn.classList.add("linked");
      } else {
        btn.textContent = "Link / save file";
        btn.title = "Pick your finance_os_portable.html once — future saves write directly into it";
        btn.classList.remove("linked");
      }
    }
    async function overwriteFile() {
      if (!_fileSupport) {
        // Fallback for Firefox/Safari: download with exact same filename (no timestamp).
        // The browser overwrites if the file already exists in Downloads, saving the rename step.
        const cleanHtml = getCleanPortableHtml();
        const blob = new Blob([cleanHtml], { type: "text/html" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "finance_os_portable.html";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
        return;
      }
      // Re-grant permission on an existing handle (requires user gesture, which this click is).
      if (_fileHandle) {
        try {
          const perm = await _fileHandle.requestPermission({ mode: "readwrite" });
          if (perm !== "granted") { _fileHandle = null; idbClearHandle(); }
        } catch (e) { _fileHandle = null; idbClearHandle(); }
      }
      // No handle yet (first time, or lost) — show the file picker.
      if (!_fileHandle) {
        try {
          _fileHandle = await window.showSaveFilePicker({
            suggestedName: "finance_os_portable.html",
            types: [{ description: "HTML File", accept: { "text/html": [".html"] } }]
          });
          idbPutHandle(_fileHandle);
        } catch (e) {
          if (e.name !== "AbortError") {
            // Picker failed (e.g. file:// SecurityError) — fall back to timestamped download.
            downloadPortableHtml();
          }
          return;
        }
      }
      // Write to the (now-confirmed) handle.
      try {
        const writable = await _fileHandle.createWritable();
        await writable.write(getCleanPortableHtml());
        await writable.close();
        _dirty = false; updateSaveBtn(); updateOverwriteBtn();
        historyStack = []; updateUndoButton();
      } catch (err) {
        console.warn("Overwrite write failed:", err);
        _fileHandle = null; idbClearHandle(); updateOverwriteBtn();
        alert("Could not write to the file. The link has been reset — try again to re-link.");
      }
    }

    function money(n) { return bdt.format(Number(n || 0)); }
    function num(n) { return Number(n || 0); }

    /* ── DATE COMPARISON ENGINE (SAFE FORMAT ALIGNMENT) ── */
    function parseDate(dateStr) {
      if (!dateStr) return null;
      if (typeof dateStr !== "string") dateStr = String(dateStr);
      const clean = dateStr.trim();
      if (/^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(clean)) return new Date(clean.replace(/\//g, "-"));
      if (/^\d{2}[-\/]\d{2}[-\/]\d{4}$/.test(clean)) {
        const separator = clean.includes("-") ? "-" : "/";
        const [d, m, y] = clean.split(separator);
        return new Date(`${y}-${m}-${d}`);
      }
      const d = new Date(clean);
      return isNaN(d.getTime()) ? null : d;
    }

    function withinTaxYear(dateStr) {
      const d = parseDate(dateStr);
      const start = parseDate(state?.settings?.incomeYearStart || "2025-07-01");
      const end = parseDate(state?.settings?.incomeYearEnd || "2026-06-30");
      if (!d || !start || !end) return false;
      return d >= start && d <= end;
    }

    function taxPeriod() {
      return {
        label: state?.settings?.taxYear || "2026-27",
        start: state?.settings?.incomeYearStart || "2025-07-01",
        end: state?.settings?.incomeYearEnd || "2026-06-30"
      };
    }

    function withinPeriod(dateStr, period = taxPeriod()) {
      const d = parseDate(dateStr);
      const start = parseDate(period.start);
      const end = parseDate(period.end);
      if (!d || !start || !end) return false;
      return d >= start && d <= end;
    }

    function taxYearForDate(dateStr) {
      const d = parseDate(dateStr);
      if (!d) return state?.settings?.taxYear || "";
      const y = d.getFullYear();
      const startsAfterJune = d.getMonth() >= 6;
      const startYear = startsAfterJune ? y : y - 1;
      return `${startYear + 1}-${String(startYear + 2).slice(-2)}`;
    }


    function taxPaymentBelongsToPeriod(payment, period = taxPeriod()) {
      if (!payment) return false;
      const declaredYear = String(payment.taxYear || "").trim();
      if (declaredYear) return declaredYear === period.label;
      return withinPeriod(payment.date, period);
    }

    function taxPeriodFromLabel(label) {
      const dates = taxYearDates(label);
      return { label, start: dates.start, end: dates.end };
    }
    function investmentTaxEntries(period = taxPeriod()) {
      return (state?.investments || []).flatMap(inv => {
        // Profit tax treatment is inherited from the parent investment so a
        // whole PF fund (or any instrument) has one consistent treatment. PF
        // ledger entries share the parent's profitTaxMethod.
        const method = inv.profitTaxMethod || defaultProfitTaxMethod(inv.type);
        if (inv.type === "provident_fund" && Array.isArray(inv.pfLedger)) {
          return inv.pfLedger.map(entry => ({
            name: `${inv.name} - ${entry.name || taxYearForDate(entry.date)}`,
            type: "provident_fund",
            profitTaxMethod: method,
            date: entry.date,
            principal: num(entry.principal),
            currentValue: num(entry.currentValue || entry.principal),
            taxableProfit: num(entry.taxableProfit),
            taxDeducted: num(entry.taxDeducted),
            status: inv.status || "active",
            accountId: inv.withdrawalAccountId,
            parentId: inv.id
          }));
        }
        return [{
          name: inv.name,
          type: inv.type,
          profitTaxMethod: method,
          date: investmentTaxDate(inv),
          principal: num(inv.principal),
          currentValue: num(inv.currentValue || inv.principal),
          taxableProfit: num(inv.taxableProfit),
          taxDeducted: num(inv.taxDeducted),
          status: inv.status || "active",
          accountId: inv.withdrawalAccountId,
          parentId: inv.id
        }];
      }).filter(entry => withinPeriod(entry.date, period));
    }

        function yearTaxSummary(period = taxPeriod()) {
      const salaryRows = (state?.salary || []).filter(s => withinPeriod(s.date, period));
      // Salary income is sourced from state.salary (gross via salaryRows below).
      // Exclude categories tagged isIncomeSourceOfTruth (salary-generated and investment-income).
      // Also exclude auto-generated salary net transactions to prevent double-counting.
      const specialIncomeCatNames = new Set(
        (state?.categories || []).filter(c => c.isIncomeSourceOfTruth).map(c => c.name)
      );
      const ordinaryTransactions = (state?.transactions || []).filter(t =>
        t.type === "income" &&
        withinPeriod(t.date, period) &&
        t.generatedKind !== "investmentSettlement" &&
        t.generatedKind !== "assetTransfer" &&
        t.generatedKind !== "salaryNet" &&
        !specialIncomeCatNames.has(t.category)
      );

      // --- FIX: Separate investment entries for Tax vs Rebate Base ---
      const allInvestmentEntries = investmentTaxEntries(period);

      // 1. Investment entries for tax reporting (includes gains from previous year investments if profit is in this year)
      const investmentEntries = allInvestmentEntries;

      // 2. Rebate Base: Only include PRINCIPAL of investments STARTED within this tax year
      const rebateBase = (state?.investments || []).reduce((sum, inv) => {
        // If provident fund, sum principal of ledger entries started within period
        if (inv.type === "provident_fund" && Array.isArray(inv.pfLedger)) {
          const periodPrincipal = inv.pfLedger
            .filter(entry => withinPeriod(entry.date, period))
            .reduce((s, e) => s + num(e.principal), 0);
          return sum + periodPrincipal;
        }
        // For all other investments, include principal ONLY if startDate is within period
        if (withinPeriod(inv.startDate, period)) {
          return sum + num(inv.principal);
        }
        return sum;
      }, 0);

      const manualTaxPayments = (state?.taxPayments || []).filter(p => taxPaymentBelongsToPeriod(p, period));

      // Split investment entries by profit tax treatment. 'final' = source tax
      // IS the tax (savings certificates, PF). 'slab' = profit joins the
      // ordinary slab base and source tax is a prepayment credit (DPS/FDR/
      // mutual funds). Either method is user-overridable per investment.
      const finalTaxEntries = investmentEntries.filter(i => i.profitTaxMethod !== "slab");
      const slabTaxEntries = investmentEntries.filter(i => i.profitTaxMethod === "slab");

      const finalTaxIncome = finalTaxEntries.reduce((sum, i) => sum + num(i.taxableProfit), 0);
      const slabInvestmentProfit = slabTaxEntries.reduce((sum, i) => sum + num(i.taxableProfit), 0);
      const finalSourceTax = finalTaxEntries.reduce((sum, i) => sum + num(i.taxDeducted), 0);
      const slabSourceTaxCredit = slabTaxEntries.reduce((sum, i) => sum + num(i.taxDeducted), 0);

      // Slab-taxed investment profit becomes part of ordinary gross income so
      // it is taxed by the progressive slabs (standard deduction still applies).
      const ordinaryIncome = salaryRows.reduce((sum, s) => sum + num(s.gross) + num(s.pfEmployer), 0) +
        ordinaryTransactions.reduce((sum, t) => sum + num(t.taxableAmount ?? t.amount), 0) +
        slabInvestmentProfit;
      // Grand totals kept for backward-compatible consumers (history table etc.)
      const investmentIncome = finalTaxIncome + slabInvestmentProfit;

      const salaryTds = salaryRows.reduce((sum, row) => sum + num(row.tds), 0);
      const manualTaxPaid = manualTaxPayments.reduce((sum, p) => sum + num(p.amount), 0);
      // investmentSourceTax kept as the grand-total source tax across both
      // buckets (used by older UI consumers); split figures below carry the
      // precise final-vs-credit breakdown.
      const investmentSourceTax = finalSourceTax + slabSourceTaxCredit;

      const slabTax = bdTaxEstimate(ordinaryIncome, rebateBase, period.label);
      // totalTax: slab tax (which now includes slab-taxed invest profit) PLUS
      // the final source tax (the standalone tax on final-taxed instruments).
      const totalTax = slabTax + finalSourceTax;
      // taxPaid: salary TDS + manual payments + ALL investment source tax.
      // For final instruments the source tax is part of what you owe; for slab
      // instruments it's a prepayment credit toward the slab tax on that profit.
      const taxPaid = salaryTds + manualTaxPaid + investmentSourceTax;

      return {
        period,
        salaryRows,
        ordinaryTransactions,
        investmentEntries,
        manualTaxPayments,
        ordinaryIncome,
        investmentIncome,
        // Split investment buckets for transparent tax reporting
        finalTaxEntries,
        slabTaxEntries,
        finalTaxIncome,
        slabInvestmentProfit,
        finalSourceTax,
        slabSourceTaxCredit,
        salaryTds,
        manualTaxPaid,
        investmentSourceTax,
        rebateBase, // ✅ Now correctly excludes previous year Sanchaypatra principal
        slabTax,
        totalTax,
        taxPaid,
        taxDue: Math.max(0, totalTax - taxPaid),
        refundable: Math.max(0, taxPaid - totalTax)
      };
    }

    function taxHistoryPeriods() {
      const labels = new Set();
      [
        ...(state?.salary || []).map(s => s.date),
        ...(state?.transactions || []).map(t => t.date),
        ...(state?.investments || []).map(i => investmentTaxDate(i)),
        ...(state?.investments || []).flatMap(i => Array.isArray(i.pfLedger) ? i.pfLedger.map(e => e.date) : [])
      ].filter(Boolean).forEach(date => labels.add(taxYearForDate(date)));
      (state?.taxPayments || []).forEach(payment => {
        if (payment.taxYear) labels.add(payment.taxYear);
        else if (payment.date) labels.add(taxYearForDate(payment.date));
      });
      return Array.from(labels)
        .filter(Boolean)
        .sort((a, b) => taxYearStartNumber(b) - taxYearStartNumber(a))
        .map(taxPeriodFromLabel);
    }

    function q(id) { return document.getElementById(id); }

    /* ── VIEW NAVIGATION & MANAGEMENT ── */
    /* ── Period badge dropdown: build + wire options, refresh active highlight ── */
    let taxYearMenuWired = false;
    function parseTaxYearOptionsHtml(html) {
      // Extract value/label pairs from the <option> markup built by taxYearOptionsHtml()
      const out = [];
      const re = /<option\s+value="([^"]*)"[^>]*>([^<]*)<\/option>/g;
      let m;
      while ((m = re.exec(html || ""))) out.push({ value: m[1], label: m[2] });
      return out;
    }
    function renderTaxYearMenu() {
      const menu = q("taxYearMenu");
      if (!menu) return;
      const current = state?.settings?.taxYear || currentTaxYear();
      const options = parseTaxYearOptionsHtml(taxYearOptionsHtml());
      menu.innerHTML =
        `<div class="ty-head">Select Tax Year</div>` +
        options.map(o =>
          `<button type="button" data-ty="${o.value}" class="${o.value === current ? "active" : ""}"><span>${o.label || o.value}</span><span class="ty-mark">✓</span></button>
        ).join("");

      menu.querySelectorAll("button[data-ty]").forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const val = btn.dataset.ty;
          state.settings.taxYear = val;
          const dates = taxYearDates(val);
          state.settings.incomeYearStart = dates.start;
          state.settings.incomeYearEnd = dates.end;
          menu.classList.remove("open");
          save();
          // Keep Settings view dropdown in sync if it's open
          if (q("taxYearSetting")) q("taxYearSetting").value = val;
          if (q("periodBadgeLabel")) q("periodBadgeLabel").textContent = "AY " + val;
          renderTaxYearMenuActive();
          render();
        };
      });
      taxYearMenuWired = true;
    }
    function renderTaxYearMenuActive() {
      const menu = q("taxYearMenu");
      if (!menu) return;
      const current = state?.settings?.taxYear || currentTaxYear();
      menu.querySelectorAll("button[data-ty]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.ty === current);
      });
    }
    // Close the dropdown on outside click
    document.addEventListener("click", (e) => {
      const menu = q("taxYearMenu");
      const wrap = q("periodBadgeWrap");
      if (menu && menu.classList.contains("open") && wrap && !wrap.contains(e.target)) {
        menu.classList.remove("open");
      }
    });
    // Close on Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { const m = q("taxYearMenu"); if (m) m.classList.remove("open"); }
    });

    function countFor(view) {
      const p = taxPeriod();
      const map = {
        transactions: (state?.transactions || []).filter(t => transactionMatchesPeriod(t)).length,
        salary: (state?.salary || []).filter(s => withinPeriod(s.date, p)).length,
        expenses: (state?.transactions || []).filter(t => t.type === "expense" && withinPeriod(t.date, p)).length,
        assets: (state?.assets || []).filter(a => !a.acquiredDate || a.acquiredDate <= p.end).length,
        liabilities: (state?.liabilities || []).filter(l => !l.openedDate || l.openedDate <= p.end).length,
        investments: (state?.investments || []).filter(i => (!i.startDate || i.startDate <= p.end) && !((i.status === "withdrawn" || i.status === "matured") && i.withdrawalDate && i.withdrawalDate <= p.end)).length,
        tax: (state?.taxPayments || []).filter(t => taxPaymentBelongsToPeriod(t, p)).length,
        planning: (state?.goals || []).length,
        budgets: (state?.budgets || []).filter(b => !b.archivedAt).length
      };
      return map[view] ? String(map[view]) : "";
    }
