    /* ── CALCULATION ENGINE ── */
    function accountCurrentBalance(accountId, asOfDate = null) {
      const account = (state?.accounts || []).find(a => a.id === accountId);
      if (!account) return 0;
      let startBalance = num(account.balance);
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
      const cacheKey = typeof currentStateRevKey === "function"
        ? currentStateRevKey(`derive:${period.label}:${period.start}:${period.end}`)
        : "";
      if (cacheKey && _cachedDeriveKey === cacheKey && _cachedDeriveVal) {
        return _cachedDeriveVal;
      }

      const periodEnd = period.end;
      const transactions = state?.transactions || [];
      const investments = state?.investments || [];
      const assetsList = state?.assets || [];
      const liabilitiesList = state?.liabilities || [];
      const accounts = state?.accounts || [];

      const periodTxs = transactions.filter(t => withinPeriod(t.date, period));
      const txIncome = periodTxs.filter(t => t.type === "income" && t.generatedKind !== "assetTransfer").reduce((s, t) => s + num(t.amount), 0);
      const txExpense = periodTxs.filter(t => t.type === "expense").reduce((s, t) => s + num(t.amount), 0);

      const month = today.slice(0, 7);
      const monthTx = transactions.filter(t => (t.date || "").startsWith(month));
      const monthIncome = monthTx.filter(t => t.type === "income").reduce((s, t) => s + num(t.amount), 0);
      const monthExpense = monthTx.filter(t => t.type === "expense").reduce((s, t) => s + num(t.amount), 0);

      const periodAssets = assetsList.filter(a => !a.acquiredDate || a.acquiredDate <= periodEnd);
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
      const periodLiabilities = liabilitiesList.filter(l => !l.openedDate || l.openedDate <= periodEnd);
      const liabilities = periodLiabilities.reduce((s, l) => s + liabilityCurrentBalance(l.id, periodEnd), 0);

      const taxSummary = yearTaxSummary(period);
      const result = {
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
      if (cacheKey) {
        _cachedDeriveKey = cacheKey;
        _cachedDeriveVal = result;
      }
      return result;
    }

    function rangeContains(date, range) {
      if (!date) return false;
      if (range.start && date < range.start) return false;
      if (range.end && date > range.end) return false;
      return true;
    }

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

    const compute = {
      txTotals(filter = {}) {
        const txs = state?.transactions || [];
        const matched = txs.filter(t => {
          if (filter.from && (t.date || "") < filter.from) return false;
          if (filter.to && (t.date || "") > filter.to) return false;
          if (filter.type && t.type !== filter.type) return false;
          if (filter.category && t.category !== filter.category) return false;
          if (filter.accountId && filter.accountId !== "*" && t.accountId !== filter.accountId) return false;
          if (t.generatedKind === "assetTransfer") return false;
          if (t.generatedKind === "investmentFunding" && filter.type === "expense") return false;
          return true;
        });
        const income = matched.filter(t => t.type === "income").reduce((s, t) => s + num(t.amount), 0);
        const expense = matched.filter(t => t.type === "expense").reduce((s, t) => s + num(t.amount), 0);
        return { income, expense, net: income - expense, count: matched.length };
      },
      netWorthAsOf(date) { return netWorthAsOf(date); },
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
      monthlyNet(monthDate) {
        const m = String(monthDate || today).slice(0, 7);
        return compute.txTotals({ from: m + "-01", to: m + "-31" });
      }
    };

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

    function advanceRecurringDate(dateStr, rule) {
      const d = parseDate(dateStr);
      if (!d) return dateStr;
      const freq = rule.frequency || "monthly";
      const step = Math.max(1, num(rule.interval) || 1);
      if (freq === "weekly") d.setDate(d.getDate() + 7 * step);
      else if (freq === "yearly") d.setFullYear(d.getFullYear() + step);
      else d.setMonth(d.getMonth() + step);
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

    function recurringDateForMonth(year, monthIdx, rule) {
      const dom = Math.max(1, num(rule.dayOfMonth) || 1);
      const lastDay = new Date(year, monthIdx + 1, 0).getDate();
      const day = Math.min(dom, lastDay);
      return `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    function processRecurringRules(opts = {}) {
      const rules = (state.recurringRules || []).filter(r => r.active);
      const accountIds = new Set((state.accounts || []).map(a => a.id));
      const cutoff = today;
      const maxBacktrackDays = 60;
      const hardFloor = (() => {
        const d = parseDate(today); if (!d) return "1900-01-01";
        d.setDate(d.getDate() - maxBacktrackDays);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      })();
      let generated = 0;
      const rulesNeedingPrompt = [];

      for (const rule of rules) {
        if (rule.accountId && !accountIds.has(rule.accountId)) {
          rule._flagMissingAccount = true; continue;
        }
        rule._flagMissingAccount = false;
        if (!rule.nextDate) continue;
        let next = rule.nextDate;
        let dueCount = 0;
        let cursor = next;
        const safetyCap = 240;
        while (cursor <= cutoff && dueCount < safetyCap) {
          if (cursor < hardFloor) break;
          dueCount++;
          cursor = advanceRecurringDate(cursor, rule);
          if (cursor > cutoff) break;
        }
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
                notes: `Recurring: ${rule.name} (${rule.frequency})`
              }, n);
              state.transactions.push(tx);
              rule.generatedTxIds = rule.generatedTxIds || [];
              rule.generatedTxIds.push(tx.id);
              generated++; made++;
              if (mode === "once") { break; }
            }
            const advanced = advanceRecurringDate(n, rule);
            if (advanced <= n) break;
            n = advanced;
          }
          rule.nextDate = n;
        };
        if (opts.mode === "skip") { rule.nextDate = cursor; }
        else if (opts.mode === "once") emit("once");
        else emit("all");
      }
      return { generated, rulesNeedingPrompt };
    }

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

      const rules = (state.recurringRules || []).filter(r => r.active);
      let recurringNet = 0;
      rules.forEach(r => {
        const amt = num(r.amount);
        recurringNet += (r.type === "income" ? amt : -amt);
      });

      let budgetCap = 0;
      if (fa.stickToBudgets) {
        const budgets = (state.budgets || []).filter(b => !b.archivedAt);
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
        const growthEligible = assets * 0.6;
        assets += growthEligible * growthRate;
        const monthSavings = baselineSavings * Math.pow(1 + inflation, i) + recurringNet + budgetCap;
        assets += monthSavings;
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
