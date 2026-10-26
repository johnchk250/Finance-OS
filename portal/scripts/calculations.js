    /* ── CALCULATION ENGINE ── */
    function accountCurrentBalance(accountId, asOfDate = null) {
      const account = (state?.accounts || []).find(a => a.id === accountId);
      if (!account) return 0;
      let startBalance = num(account.balance);
      // A transaction touches this account if it credits it (accountId) OR, for a
      // real A→B transfer, debits it (fromAccountId). Legacy one-sided transfers
      // (e.g. investment settlement) have no fromAccountId and only credit here.
      const txs = (state?.transactions || []).filter(t => {
        if (!transactionAffectsAccount(t)) return false;
        const isCredit = t.accountId === accountId;
        const isDebit = t.type === "transfer" && t.fromAccountId === accountId;
        if (!isCredit && !isDebit) return false;
        if (asOfDate && t.date > asOfDate) return false;
        return true;
      });
      let total = startBalance;
      for (const t of txs) {
        if (t.type === "transfer") {
          // +amount on the destination (accountId), −amount on the source (fromAccountId).
          total += t.accountId === accountId ? num(t.amount) : -num(t.amount);
        } else if (t.type === "income") {
          total += num(t.amount);
        } else if (t.type === "expense") {
          total -= num(t.amount);
        }
      }
      return total;
    }

    function derive() {
      const period = taxPeriod();
      const periodEnd = period.end;
      const transactions = state?.transactions || [];
      const salary = state?.salary || [];
      const investments = state?.investments || [];
      const assetsList = state?.assets || [];
      const liabilitiesList = state?.liabilities || [];
      const accounts = state?.accounts || [];
      const taxPayments = state?.taxPayments || [];

      // Period-scoped income/expense (only transactions within the selected tax year)
      const periodTxs = transactions.filter(t => withinPeriod(t.date, period));
      const txIncome = periodTxs.filter(t => t.type === "income" && t.generatedKind !== "assetTransfer").reduce((s, t) => s + num(t.amount), 0);
      const txExpense = periodTxs.filter(t => t.type === "expense").reduce((s, t) => s + num(t.amount), 0);

      // Current month (always wall-clock month, not period-scoped — for the live savings rate KPI)
      const month = today.slice(0, 7);
      const monthTx = transactions.filter(t => (t.date || "").startsWith(month));
      const monthIncome = monthTx.filter(t => t.type === "income").reduce((s, t) => s + num(t.amount), 0);
      const monthExpense = monthTx.filter(t => t.type === "expense").reduce((s, t) => s + num(t.amount), 0);

      // Assets: all scoped to periodEnd so past-year views show past-year balances
      const periodAssets = assetsList.filter(a => !a.acquiredDate || a.acquiredDate <= periodEnd);
      // Period-aware investment filter: include investment if it had started by periodEnd AND
      // was NOT yet withdrawn/matured by periodEnd (i.e. withdrawalDate is after periodEnd, or still active)
      const periodInvestments = investments
        .filter(i => !i.startDate || i.startDate <= periodEnd)
        .filter(i => {
          const isClosedBeforePeriodEnd =
            (i.status === "withdrawn" || i.status === "matured") &&
            i.withdrawalDate && i.withdrawalDate <= periodEnd;
          return !isClosedBeforePeriodEnd;
        });
      const assets =
        periodAssets.reduce((s, a) => s + valueOfAsset(a, periodEnd), 0) +
        periodInvestments.reduce((s, i) => s + accruedValue(i, periodEnd), 0) +
        accounts.reduce((s, a) => s + accountCurrentBalance(a.id, periodEnd), 0);
      // Liabilities: only those that existed by periodEnd (mirrors liabilitiesView),
      // so past-year views don't include debts opened after that date.
      const periodLiabilities = liabilitiesList.filter(l => !l.openedDate || l.openedDate <= periodEnd);
      const liabilities = periodLiabilities.reduce((s, l) => s + liabilityCurrentBalance(l.id, periodEnd), 0);

      const taxSummary = yearTaxSummary();
      return {
        txIncome, txExpense, monthIncome, monthExpense,
        assets, liabilities, netWorth: assets - liabilities,
        savingsRate: monthIncome ? ((monthIncome - monthExpense) / monthIncome) * 100 : 0,
        taxIncome: taxSummary.ordinaryIncome,
        taxPaid: taxSummary.taxPaid,
        estimatedTax: taxSummary.totalTax,
        taxDue: taxSummary.taxDue,
        rebateBase: taxSummary.rebateBase,
        periodEnd
      };
    }

    // ── Phase 1: date-parametric net worth (reused by history + later phases) ──
    // rangeContains: true if date falls within [start, end] inclusive (handles nulls).
    function rangeContains(date, range) {
      if (!date) return false;
      if (range.start && date < range.start) return false;
      if (range.end && date > range.end) return false;
      return true;
    }

    // netWorthAsOf: value everything as of a given date, using the SAME helpers derive() uses.
    // Mirrors derive()'s entity filtering (only assets/liabilities/investments that existed by asOf).
    function netWorthAsOf(asOf) {
      const asOfDate = asOf || taxPeriod().end;
      const assetsList = state?.assets || [];
      const investments = state?.investments || [];
      const liabilitiesList = state?.liabilities || [];
      const accounts = state?.accounts || [];

      const periodAssets = assetsList.filter(a => !a.acquiredDate || a.acquiredDate <= asOfDate);
      const periodInvestments = investments
        .filter(i => !i.startDate || i.startDate <= asOfDate)
        .filter(i => {
          const isClosedBeforeAsOf =
            (i.status === "withdrawn" || i.status === "matured") &&
            i.withdrawalDate && i.withdrawalDate <= asOfDate;
          return !isClosedBeforeAsOf;
        });
      const assets =
        periodAssets.reduce((s, a) => s + valueOfAsset(a, asOfDate), 0) +
        periodInvestments.reduce((s, i) => s + accruedValue(i, asOfDate), 0) +
        accounts.reduce((s, a) => s + accountCurrentBalance(a.id, asOfDate), 0);

      const periodLiabilities = liabilitiesList.filter(l => !l.openedDate || l.openedDate <= asOfDate);
      const liabilities = periodLiabilities.reduce((s, l) => s + liabilityCurrentBalance(l.id, asOfDate), 0);

      const liquid = accounts.reduce((s, a) => s + accountCurrentBalance(a.id, asOfDate), 0);
      const invested = periodInvestments.reduce((s, i) => s + accruedValue(i, asOfDate), 0);
      const assetReal = periodAssets.reduce((s, a) => s + valueOfAsset(a, asOfDate), 0);

      return {
        date: asOfDate,
        assets, liabilities,
        netWorth: assets - liabilities,
        breakdown: { liquid, invested, assets: assetReal, debts: liabilities }
      };
    }

    /* ════════════════════════════════════════════════════════════════════════
       PHASE 2-4 ENGINE BLOCK
       compute.* (P3) · generateTransaction + recurring engine (P2) · projectNetWorth (P4)
       All additive; existing call sites untouched.
       ════════════════════════════════════════════════════════════════════════ */

    // ── PHASE 3: compute layer — period-scoped aggregation reused by budgets,
    // home widgets, and forecasts. derive() numbers come from the same source.
    const compute = {
      // Sum income/expense across transactions matching a filter.
      txTotals(filter = {}) {
        const txs = state?.transactions || [];
        const matched = txs.filter(t => {
          if (filter.from && (t.date || "") < filter.from) return false;
          if (filter.to && (t.date || "") > filter.to) return false;
          if (filter.type && t.type !== filter.type) return false;
          if (filter.category && t.category !== filter.category) return false;
          if (filter.accountId && filter.accountId !== "*" && t.accountId !== filter.accountId) return false;
          // Exclude the synthetic asset-transfer income so it never counts as spend/income.
          if (t.generatedKind === "assetTransfer") return false;
          // Exclude investment-funding outflows — they move cash → invested asset,
          // not real consumption (matches derive()'s treatment).
          if (t.generatedKind === "investmentFunding" && filter.type === "expense") return false;
          return true;
        });
        const income = matched.filter(t => t.type === "income").reduce((s, t) => s + num(t.amount), 0);
        const expense = matched.filter(t => t.type === "expense").reduce((s, t) => s + num(t.amount), 0);
        return { income, expense, net: income - expense, count: matched.length };
      },
      // Net worth as of a date — thin wrapper over the keystone (P1).
      netWorthAsOf(date) { return netWorthAsOf(date); },
      // Per-category spend in a range — used by budgets + home top-N.
      categoryBreakdown(filter = {}) {
        const out = {};
        const txs = state?.transactions || [];
        txs.forEach(t => {
          if (t.type !== "expense") return;
          if (t.generatedKind === "investmentFunding") return;
          if (filter.from && (t.date || "") < filter.from) return;
          if (filter.to && (t.date || "") > filter.to) return;
          if (filter.accountId && filter.accountId !== "*" && t.accountId !== filter.accountId) return;
          const c = t.category || "Uncategorized";
          out[c] = (out[c] || 0) + num(t.amount);
        });
        return out;
      },
      // Income - expense - savings for a single calendar month (YYYY-MM-DD date).
      monthlyNet(monthDate) {
        const m = String(monthDate || today).slice(0, 7);
        return compute.txTotals({ from: m + "-01", to: m + "-31" });
      }
    };

    // ── PHASE 2: consolidated transaction generator.
    // One canonical shape + idempotency. The 4 existing sync* paths keep their
    // own functions but this is the single path NEW generators (recurring, forecast)
    // use, so sourceType taxonomy stays consistent.
    function generateTransaction(template, asOfDate) {
      const tx = {
        id: id(),
        createdAt: new Date().toISOString(),
        name: template.name || (template.type === "income" ? "Recurring income" : "Recurring payment"),
        type: template.type || "expense",
        date: asOfDate || template.date || today,
        amount: num(template.amount),
        taxableAmount: num(template.taxableAmount) || 0,
        category: template.category || "",
        accountId: template.accountId || "",
        affectsAccount: template.affectsAccount !== false,
        cashFlowMode: template.cashFlowMode || (template.affectsAccount === false ? "memo" : "cash"),
        sourceType: template.sourceType || "recurring",
        sourceId: template.sourceId || null,
        generatedKind: template.generatedKind || "recurring",
        notes: template.notes || ""
      };
      if (template.linkedLiabilityId) tx.linkedLiabilityId = template.linkedLiabilityId;
      return tx;
    }

    // Advance a recurring rule's nextDate by its interval (frequency × interval).
    function advanceRecurringDate(dateStr, rule) {
      const d = parseDate(dateStr);
      if (!d) return dateStr;
      const freq = rule.frequency || "monthly";
      const step = Math.max(1, num(rule.interval) || 1);
      if (freq === "weekly") d.setDate(d.getDate() + 7 * step);
      else if (freq === "yearly") d.setFullYear(d.getFullYear() + step);
      else d.setMonth(d.getMonth() + step); // monthly (default)
      // Clamp dayOfMonth to the month's last day (31 → 28/29/30 in short months).
      const dom = num(rule.dayOfMonth);
      if (freq !== "weekly" && dom >= 28) {
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        if (dom > lastDay) d.setDate(lastDay);
      }
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }

    // Find the canonical date a recurring rule should fire in a given month,
    // respecting dayOfMonth clamping (returns YYYY-MM-DD).
    function recurringDateForMonth(year, monthIdx, rule) {
      const dom = Math.max(1, num(rule.dayOfMonth) || 1);
      const lastDay = new Date(year, monthIdx + 1, 0).getDate();
      const day = Math.min(dom, lastDay);
      return `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    // ── PHASE 2: recurring generation engine.
    // Scans rules for nextDate <= today (capped 60 days back), emits txs via
    // generateTransaction, advances nextDate. Idempotent: guarded by checking
    // whether a tx already exists for that rule+date. Returns {generated, gaps}
    // so the caller can decide whether to prompt (large gap = catch-up prompt).
    function processRecurringRules(opts = {}) {
      const rules = (state.recurringRules || []).filter(r => r.active);
      const accountIds = new Set((state.accounts || []).map(a => a.id));
      const cutoff = today; // never generate future-dated beyond today
      const maxBacktrackDays = 60;
      const hardFloor = (() => {
        const d = parseDate(today); if (!d) return "1900-01-01";
        d.setDate(d.getDate() - maxBacktrackDays);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      })();
      let generated = 0;
      const rulesNeedingPrompt = [];

      for (const rule of rules) {
        // Skip if the funding account no longer exists.
        if (rule.accountId && !accountIds.has(rule.accountId)) {
          rule._flagMissingAccount = true; continue;
        }
        rule._flagMissingAccount = false;
        if (!rule.nextDate) continue;
        let next = rule.nextDate;
        // Count how many instances are due, to decide on the catch-up prompt.
        let dueCount = 0;
        let cursor = next;
        const safetyCap = 240; // hard stop against runaway loops
        while (cursor <= cutoff && dueCount < safetyCap) {
          if (cursor < hardFloor) break;
          dueCount++;
          cursor = advanceRecurringDate(cursor, rule);
          if (cursor > cutoff) break;
        }
        // A gap of more than 1 missed instance triggers the user prompt unless
        // we're in force/skip mode (opts.mode = "all" | "once" | "skip").
        if (dueCount > 1 && !opts.mode) {
          rulesNeedingPrompt.push({ rule, dueCount });
          continue;
        }
        const emit = (mode) => {
          let n = next;
          let made = 0;
          while (n <= cutoff && made < safetyCap) {
            if (n < hardFloor) break;
            const already = (state.transactions || []).some(t =>
              t.sourceType === "recurring" && t.sourceId === rule.id && t.date === n);
            if (!already) {
              const tx = generateTransaction({
                name: rule.name,
                type: rule.type || "expense",
                amount: rule.amount,
                category: rule.category || "",
                accountId: rule.accountId || "",
                affectsAccount: true,
                sourceType: "recurring",
                sourceId: rule.id,
                generatedKind: "recurring",
                linkedLiabilityId: rule.linkedLiabilityId || null,
                notes: `Recurring: ${rule.name} (${rule.frequency})
              }, n);
              state.transactions.push(tx);
              rule.generatedTxIds = rule.generatedTxIds || [];
              rule.generatedTxIds.push(tx.id);
              generated++; made++;
              if (mode === "once") { break; }
            }
            const advanced = advanceRecurringDate(n, rule);
            if (advanced <= n) break; // guard against non-advancing rules
            n = advanced;
          }
          rule.nextDate = n;
        };
        if (opts.mode === "skip") { /* advance past the gap without emitting */ rule.nextDate = cursor; }
        else if (opts.mode === "once") emit("once");
        else emit("all");
      }
      return { generated, rulesNeedingPrompt };
    }

    // Convert an existing transaction into a recurring rule template (P2 UX).
    function ruleFromTransaction(tx) {
      if (!tx) return null;
      const dom = (() => { const d = parseDate(tx.date); return d ? d.getDate() : 5; })();
      return {
        id: id(),
        name: tx.name || (tx.type === "income" ? "Recurring income" : "Recurring payment"),
        type: tx.type || "expense",
        amount: num(tx.amount),
        category: tx.category || "",
        accountId: tx.accountId || "",
        frequency: "monthly",
        interval: 1,
        dayOfMonth: Math.min(dom, 28),
        nextDate: advanceRecurringDate(tx.date || today, { frequency: "monthly", interval: 1, dayOfMonth: Math.min(dom, 28) }),
        startDate: tx.date || today,
        endDate: null,
        active: true,
        linkedLiabilityId: tx.linkedLiabilityId || null,
        generatedTxIds: [],
        createdAt: new Date().toISOString()
      };
    }

    // ── PHASE 4: deterministic net-worth projection.
    // Composes P1 netWorthAsOf + P2 recurring + P3 budgets. Pure function —
    // never mutates state. Returns [{month, date, assets, liabilities, netWorth}]
    // with the first point being today (truth), rest projected (assumption).
    function projectNetWorth(opts = {}) {
      const fa = Object.assign({
        monthsAhead: 60, monthlySavingsOverride: null, annualReturnPct: 8,
        inflationPct: 5, stickToBudgets: false
      }, state.forecastAssumptions || {}, opts.assumptions || {});
      const months = Math.max(1, Math.min(360, num(fa.monthsAhead) || 60));
      const growthRate = (num(fa.annualReturnPct) || 0) / 100 / 12;
      const inflation = (num(fa.inflationPct) || 0) / 100 / 12;

      const start = netWorthAsOf(today);
      let assets = start.assets;
      let liabilities = start.liabilities;

      // Baseline monthly savings: override or trailing-3-month average net.
      let baselineSavings = num(fa.monthlySavingsOverride);
      if (!baselineSavings) {
        let sum = 0, counted = 0;
        for (let i = 1; i <= 3; i++) {
          const d = new Date();
          d.setMonth(d.getMonth() - i);
          const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          const mn = compute.monthlyNet(m);
          if (mn.count) { sum += mn.net; counted++; }
        }
        baselineSavings = counted ? (sum / counted) : 0;
      }

      // Projected recurring net per month (salary in - rent/EMI out), virtual.
      const rules = (state.recurringRules || []).filter(r => r.active);
      let recurringNet = 0;
      rules.forEach(r => {
        const amt = num(r.amount);
        recurringNet += (r.type === "income" ? amt : -amt);
      });

      // Budget influence: if sticking to budgets, cap projected discretionary spend.
      let budgetCap = 0; // reduction applied to net if spend would exceed budgets
      if (fa.stickToBudgets) {
        const budgets = (state.budgets || []).filter(b => !b.archivedAt);
        // Approximate: budgets set a ceiling; if trailing spend exceeds it we
        // assume the user tightens to the limit (a positive delta to savings).
        budgets.forEach(b => {
          const avg = (() => {
            let s = 0, c = 0;
            for (let i = 1; i <= 3; i++) {
              const d = new Date(); d.setMonth(d.getMonth() - i);
              const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
              s += compute.txTotals({ from: m + "-01", to: m + "-31", type: "expense", category: b.category }).expense;
              c++;
            }
            return c ? s / c : 0;
          })();
          if (avg > num(b.monthlyLimit)) budgetCap += (avg - num(b.monthlyLimit));
        });
      }

      const series = [{ month: 0, date: today, assets, liabilities, netWorth: assets - liabilities }];
      const base = new Date();
      for (let i = 1; i <= months; i++) {
        // Apply growth to invested/liquid (approximated as assets less hard real-estate).
        // Use a blended 60% of assets as growth-eligible (liquid+invested typical share).
        const growthEligible = assets * 0.6;
        assets += growthEligible * growthRate;
        // Net cash flow this month: baseline savings (inflated to stay real) + recurring + budget cap.
        const monthSavings = baselineSavings * Math.pow(1 + inflation, i) + recurringNet + budgetCap;
        // Positive savings accumulate as assets; deficits draw them down. Shown honestly.
        assets += monthSavings;
        // Liabilities drift down as EMIs pay them (approximated by recurring EMI outflows already counted).
        // Keep simple: liabilities reduce ~proportionally to scheduled recurring if linked.
        const emiPaydown = rules
          .filter(r => r.linkedLiabilityId && r.type === "expense")
          .reduce((s, r) => s + num(r.amount), 0);
        liabilities = Math.max(0, liabilities - emiPaydown);
        const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        series.push({ month: i, date: ds, assets, liabilities, netWorth: assets - liabilities });
      }
      return series;
    }

    function bdTaxEstimate(grossIncome, rebateBase, taxYear = state?.settings?.taxYear || currentTaxYear()) {
      const taxRules = getTaxRulesForYear(taxYear);
      const stdDed = taxRules.standardDeduction || { fraction: 0.3333, cap: 500000 };
      const deduction = Math.min(grossIncome * stdDed.fraction, stdDed.cap);
      const taxableIncome = Math.max(0, grossIncome - deduction);
      const slabConfig = getTaxSlabsForYear(taxYear);
      const slabs = slabConfig.map(s => [s.threshold === 0 ? Infinity : s.threshold, s.rate]);
      if (!slabs.length) slabs.push([Infinity, 0]);
      let remaining = taxableIncome, tax = 0;
      for (const [cap, rate] of slabs) {
        const slice = cap === Infinity ? remaining : Math.min(remaining, cap);
        tax += slice * rate;
        remaining -= slice;
        if (remaining <= 0) break;
      }
      const rp = taxRules.rebateParams || { rate: 0.15, investmentCapPercent: 0.20, maxCapAbsolute: 10000000 };
      const eligibleCap = Math.min(rebateBase, taxableIncome * rp.investmentCapPercent, rp.maxCapAbsolute);
      const rebate = eligibleCap * rp.rate;
      // ITA 2023: rebate cannot exceed 3% of taxable income — apply same cap used in taxView()
      const maxRebateBySlab = Math.round(taxableIncome * 0.03);
      const cappedRebate = Math.min(rebate, maxRebateBySlab);
      return Math.max(0, Math.round(tax - cappedRebate));
    }

    /* ── DYNAMIC SLAB BREAKDOWN ENGINE ── */
    function getTaxSlabs(taxableIncome, taxYear = state?.settings?.taxYear || currentTaxYear()) {
      const slabConfig = getTaxSlabsForYear(taxYear);
      const slabs = slabConfig.map((s, i) => ({
        label: s.rate === 0 ? "Exempt (0%)" : s.threshold === 0 ? `Remainder (${(s.rate * 100).toFixed(0)}%)` : `Slab ${i} (${(s.rate * 100).toFixed(0)}%)`,
        cap: s.threshold === 0 ? Infinity : s.threshold,
        rate: s.rate
      }));
      if (!slabs.length) slabs.push({ label: "No tax", cap: Infinity, rate: 0 });
      let remaining = taxableIncome;
      const rows = [];
      let totalGrossTax = 0;
      for (const slab of slabs) {
        const slice = slab.cap === Infinity ? remaining : Math.min(remaining, slab.cap);
        const slabTax = slice > 0 ? Math.round(slice * slab.rate) : 0;
        totalGrossTax += slabTax;
        rows.push({ label: slab.label, slice: Math.max(0, slice), tax: slabTax });
        remaining -= slice;
        if (remaining <= 0) remaining = 0;
      }
      return { rows, totalGrossTax };
    }
