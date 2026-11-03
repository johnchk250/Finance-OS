    /* ── NON-BLOCKING MODAL & DIALOG SYSTEM ── */
    let _activeModalResolve = null;

    function closeAppModal(result = null) {
      const dialog = q("appModal");
      if (dialog && dialog.open) dialog.close();
      if (_activeModalResolve) {
        const res = _activeModalResolve;
        _activeModalResolve = null;
        res(result);
      }
    }

    function showAppModal({ title = "Finance OS", bodyHtml = "", actions = [] }) {
      const dialog = q("appModal");
      if (!dialog || typeof dialog.showModal !== "function") {
        return Promise.resolve(null);
      }
      if (_activeModalResolve) closeAppModal(null);

      return new Promise(resolve => {
        _activeModalResolve = resolve;
        q("appModalTitle").textContent = title;
        q("appModalBody").innerHTML = bodyHtml;
        const actionsEl = q("appModalActions");
        actionsEl.innerHTML = "";
        actions.forEach(act => {
          const btn = document.createElement("button");
          btn.type = act.submit ? "submit" : "button";
          btn.className = act.className || "";
          btn.textContent = act.label;
          btn.onclick = (e) => {
            if (!act.submit) {
              e.preventDefault();
              const val = typeof act.getValue === "function" ? act.getValue() : act.value;
              closeAppModal(val);
            }
          };
          actionsEl.appendChild(btn);
        });
        const form = q("appModalForm");
        form.onsubmit = (e) => {
          e.preventDefault();
          const submitAct = actions.find(a => a.submit) || actions[actions.length - 1];
          const val = submitAct && typeof submitAct.getValue === "function" ? submitAct.getValue() : (submitAct ? submitAct.value : true);
          closeAppModal(val);
        };
        const closeBtn = q("appModalClose");
        if (closeBtn) closeBtn.onclick = () => closeAppModal(null);
        dialog.oncancel = () => {
          if (_activeModalResolve) {
            const res = _activeModalResolve;
            _activeModalResolve = null;
            res(null);
          }
        };
        dialog.showModal();
        const firstInput = dialog.querySelector("input, select, button.primary");
        if (firstInput) firstInput.focus();
      });
    }

    function showAppNotice(title, message) {
      return showAppModal({
        title,
        bodyHtml: `<p style="font-size:13.5px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(message)}</p>`,
        actions: [{ label: "OK", value: true, className: "primary", submit: true }]
      });
    }

    function showAppConfirm(title, message, { confirmLabel = "Confirm", danger = false } = {}) {
      return showAppModal({
        title,
        bodyHtml: `<p style="font-size:13.5px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(message)}</p>`,
        actions: [
          { label: "Cancel", value: false },
          { label: confirmLabel, value: true, className: danger ? "danger-solid" : "primary", submit: true }
        ]
      });
    }

    function showAppPrompt(title, message, defaultValue = "", inputType = "text") {
      return showAppModal({
        title,
        bodyHtml: `
          <p style="font-size:13px;color:var(--muted);margin-bottom:10px;white-space:pre-wrap;">${escapeHtml(message)}</p>
          <input id="appModalPromptInput" type="${escapeHtml(inputType)}" value="${escapeHtml(String(defaultValue ?? ""))}" style="width:100%;">
        `,
        actions: [
          { label: "Cancel", value: null },
          {
            label: "Save",
            className: "primary",
            submit: true,
            getValue: () => q("appModalPromptInput")?.value ?? null
          }
        ]
      });
    }

    function showRecurringCatchUpModal(items) {
      if (!items || !items.length) return Promise.resolve("all");
      const totalDue = items.reduce((s, i) => s + i.dueCount, 0);
      const listHtml = items.map(i => `<li style="padding:3px 0;"><strong>${escapeHtml(i.rule.name)}</strong>: ${i.dueCount} missed instance(s) (${money(i.rule.amount)} each)</li>`).join("");
      return showAppModal({
        title: "Recurring payments catch-up",
        bodyHtml: `
          <p style="font-size:13px;line-height:1.5;margin-bottom:8px;"><strong>${totalDue}</strong> scheduled recurring transaction(s) fell due while Finance OS was closed:</p>
          <ul style="margin:0 0 12px 18px;font-size:12.5px;color:var(--text);">${listHtml}</ul>
          <p class="muted" style="font-size:12px;">How would you like to handle this gap?</p>
        `,
        actions: [
          { label: "Skip gap", value: "skip" },
          { label: "Generate latest 1 only", value: "once" },
          { label: `Generate all (${totalDue})`, value: "all", className: "primary", submit: true }
        ]
      });
    }

    /* ── TAX WHAT-IF SIMULATOR CONTROLLER ── */
    function updateTaxWhatIfSimulator() {
      const box = q("taxWhatIfSimulator");
      const slider = q("taxWhatIfSlider");
      const metricsEl = q("taxWhatIfMetrics");
      const addLabel = q("taxWhatIfAddLabel");
      if (!box || !slider || !metricsEl) return;

      const addAmount = num(slider.value);
      const baseRebate = num(box.dataset.baseRebate);
      const taxable = num(box.dataset.taxable);
      const grossSlabTax = num(box.dataset.grossSlabTax);
      const finalSourceTax = num(box.dataset.finalSourceTax);
      const taxPaid = num(box.dataset.taxPaid);
      const rebateRate = num(box.dataset.rebateRate) || 0.15;
      const capPct = num(box.dataset.capPct) || 0.20;
      const maxCap = num(box.dataset.maxCap) || 10000000;

      const maxRebateBySlab = Math.round(taxable * 0.03);
      const curEligible = Math.min(baseRebate, taxable * capPct, maxCap);
      const curRebate = Math.min(Math.round(curEligible * rebateRate), maxRebateBySlab);

      const newTotalInvested = baseRebate + addAmount;
      const newEligible = Math.min(newTotalInvested, taxable * capPct, maxCap);
      const newRebate = Math.min(Math.round(newEligible * rebateRate), maxRebateBySlab);
      const extraTaxSaved = Math.max(0, newRebate - curRebate);

      const newSlabTax = Math.max(0, grossSlabTax - newRebate);
      const newTotalTax = newSlabTax + finalSourceTax;
      const newTaxDue = Math.max(0, newTotalTax - taxPaid);

      // Estimate months remaining until June 30 of the active assessment year
      const endDt = parseDate(taxPeriod().end);
      const nowDt = new Date();
      const monthsRem = endDt && endDt > nowDt
        ? Math.max(1, Math.ceil((endDt - nowDt) / (30.44 * 86400000)))
        : 12;
      const perMonthNeeded = Math.round(addAmount / monthsRem);

      if (addLabel) addLabel.textContent = `+${money(addAmount)}`;
      metricsEl.innerHTML = `
        <div class="whatif-metric">
          <span>Extra tax saved</span>
          <strong class="positive">+${money(extraTaxSaved)}</strong>
          <small>Total rebate: ${money(newRebate)}</small>
        </div>
        <div class="whatif-metric">
          <span>Simulated net tax</span>
          <strong>${money(newTotalTax)}</strong>
          <small>${newTaxDue > 0 ? `Still due: ${money(newTaxDue)}` : "Fully covered by TDS"}</small>
        </div>
        <div class="whatif-metric">
          <span>Monthly target</span>
          <strong>${money(perMonthNeeded)}/mo</strong>
          <small>Over ~${monthsRem} mo until FY end</small>
        </div>
      `;
    }

    /* ── EVENT DELEGATION & COMPONENT CONTROLLERS ── */
    const closeAllRowMenus = () => {
      document.querySelectorAll(".row-menu.open").forEach(m => {
        m.classList.remove("open");
        m.style.left = ""; m.style.top = ""; m.style.right = ""; m.style.bottom = "";
      });
    };

    const placeRowMenu = (menu, btn) => {
      const rect = btn.getBoundingClientRect();
      const margin = 4;
      const vwMin = 8;
      const vwMax = window.innerWidth - 8;
      const vhMax = window.innerHeight - 8;
      menu.style.left = "-9999px";
      menu.style.top = "-9999px";
      menu.style.right = "";
      menu.style.bottom = "";
      const w = menu.offsetWidth;
      const h = menu.offsetHeight;
      let left = rect.right - w;
      if (left < vwMin) left = vwMin;
      if (left + w > vwMax) left = vwMax - w;
      if (left < vwMin) left = vwMin;
      const spaceBelow = vhMax - rect.bottom;
      const spaceAbove = rect.top - margin;
      const openBelow = spaceBelow >= h + margin || spaceBelow >= spaceAbove;
      const top = openBelow ? rect.bottom + margin : rect.top - h - margin;
      menu.style.left = Math.max(vwMin, Math.min(left, vwMax - w)) + "px";
      menu.style.top = Math.max(margin, Math.min(top, vhMax - h)) + "px";
    };

    function executePaletteCommand(actionStr) {
      if (!actionStr) return;
      if (q("globalSearch")) q("globalSearch").value = "";
      if (actionStr.startsWith("view:")) {
        setView(actionStr.slice(5), true);
        return;
      }
      if (actionStr === "cmd:theme") {
        q("themeToggleBtn")?.click();
        render();
      } else if (actionStr === "cmd:privacy") {
        if (typeof togglePrivacyMode === "function") togglePrivacyMode();
      } else if (actionStr === "cmd:cloneSalary") {
        setView("salary");
        quickAddLastMonthSalary();
      } else if (actionStr === "cmd:exportHtml") {
        render();
        downloadPortableHtml();
      } else if (actionStr === "cmd:exportJson") {
        render();
        exportAll();
      }
    }

    function executeQuickLogTx(qTx) {
      if (!qTx || !qTx.amount) return;
      pushHistory();
      state.transactions = state.transactions || [];
      state.transactions.push({
        id: id(),
        createdAt: new Date().toISOString(),
        name: qTx.name,
        type: qTx.type || "expense",
        date: qTx.date || today,
        amount: num(qTx.amount),
        taxableAmount: 0,
        category: qTx.category || "",
        accountId: qTx.accountId || "",
        affectsAccount: Boolean(qTx.accountId),
        cashFlowMode: qTx.accountId ? "cash" : "memo",
        notes: "Logged via Quick Command (Ctrl+K)"
      });
      if (q("globalSearch")) q("globalSearch").value = "";
      save();
      renderNav();
      render();
      if (typeof showUndoToast === "function") {
        showUndoToast(`Logged ${qTx.name} (${money(qTx.amount)})`);
      }
    }

    function bindViewEvents() {
      // Ensure global row-menu close listeners are attached once
      if (!window._rowMenuGlobalWired) {
        window._rowMenuGlobalWired = true;
        document.addEventListener("click", closeAllRowMenus);
        document.addEventListener("keydown", e => {
          if (e.key === "Escape") closeAllRowMenus();
        });
        const dismissOnScroll = () => closeAllRowMenus();
        window.addEventListener("resize", dismissOnScroll);
        window.addEventListener("scroll", dismissOnScroll, true);
      }

      // Initialize interactive Tax What-If simulator when present in the view
      if (q("taxWhatIfSimulator")) {
        updateTaxWhatIfSimulator();
        const slider = q("taxWhatIfSlider");
        if (slider) slider.oninput = updateTaxWhatIfSimulator;
        const optBtn = q("taxWhatIfOptimalBtn");
        if (optBtn) {
          optBtn.onclick = () => {
            if (slider) {
              slider.value = optBtn.dataset.optimal || 0;
              updateTaxWhatIfSimulator();
            }
          };
        }
      }

      document.querySelectorAll("[data-add]").forEach(btn => btn.onclick = () => {
        let presets = null;
        if (btn.dataset.presets) {
          try { presets = JSON.parse(btn.dataset.presets); } catch(e) { console.error(e); }
        }
        openForm(btn.dataset.add, null, presets);
      });
      if (q("quickAddSalaryBtn")) q("quickAddSalaryBtn").onclick = quickAddLastMonthSalary;

      if (q("loadMoreTxBtn")) {
        q("loadMoreTxBtn").onclick = () => {
          _txRenderLimit += 150;
          render();
        };
      }

      if (q("quickLogConfirmBtn")) {
        q("quickLogConfirmBtn").onclick = (e) => {
          try {
            const qTx = JSON.parse(e.currentTarget.dataset.quickTx);
            executeQuickLogTx(qTx);
          } catch (err) { console.error(err); }
        };
      }

      document.querySelectorAll("[data-run-cmd]").forEach(btn => {
        btn.onclick = () => executePaletteCommand(btn.dataset.runCmd);
      });

      // Hub sub-navigation bar clicks
      document.querySelectorAll("[data-hub-nav]").forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          const targetView = btn.dataset.hubNav;
          if (btn.dataset.hubTxtab) {
            state.settings.transactionViewTab = btn.dataset.hubTxtab;
            persistViewOnly();
          }
          if (btn.dataset.hubPlantab) {
            state.settings.planningTab = btn.dataset.hubPlantab;
            persistViewOnly();
          }
          if (activeView === targetView) {
            renderNav();
            render();
          } else {
            setView(targetView, true, true);
          }
        };
      });

      document.querySelectorAll(".row-kebab").forEach(btn => btn.onclick = (e) => {
        e.stopPropagation();
        const menu = btn.nextElementSibling;
        const willOpen = !menu.classList.contains("open");
        closeAllRowMenus();
        if (willOpen) {
          menu.classList.add("open");
          placeRowMenu(menu, btn);
        }
      });

      document.querySelectorAll("[data-inv-row]").forEach(row => {
        row.onclick = (e) => {
          if (e.target.closest(".inv-detail-box")) return;
          if (e.target.closest(".row-menu-wrap")) return;
          const wasOpen = row.classList.contains("open");
          const container = row.closest(".inv-rows");
          if (container) container.querySelectorAll(".inv-row.open").forEach(r => r.classList.remove("open"));
          if (!wasOpen) row.classList.add("open");
        };
      });
      document.querySelectorAll("[data-edit]").forEach(btn => btn.onclick = () => {
        const [type, recId] = btn.dataset.edit.split(":");
        openForm(type, recId);
      });
      document.querySelectorAll("[data-copy]").forEach(btn => btn.onclick = () => {
        const [type, recId] = btn.dataset.copy.split(":");
        openCopyForm(type, recId);
      });
      document.querySelectorAll("[data-delete]").forEach(btn => btn.onclick = () => {
        const [type, recId] = btn.dataset.delete.split(":");
        deleteRecord(type, recId);
      });
      document.querySelectorAll("[data-settle]").forEach(btn => btn.onclick = () => openInvestmentSettlement(btn.dataset.settle));
      document.querySelectorAll("[data-asset-transfer]").forEach(btn => btn.onclick = () => openAssetTransfer(btn.dataset.assetTransfer));
      document.querySelectorAll("[data-delete-asset-transfer]").forEach(btn => btn.onclick = () => {
        const [assetId, transferId] = btn.dataset.deleteAssetTransfer.split(":");
        deleteAssetTransfer(assetId, transferId);
      });
      document.querySelectorAll("[data-pf-edit]").forEach(btn => btn.onclick = () => {
        const [investmentId, entryId] = btn.dataset.pfEdit.split(":");
        openProvidentFundEntryForm(investmentId, entryId);
      });
      document.querySelectorAll("[data-pf-copy]").forEach(btn => btn.onclick = () => {
        const [investmentId, entryId] = btn.dataset.pfCopy.split(":");
        openProvidentFundEntryCopyForm(investmentId, entryId);
      });
      document.querySelectorAll("[data-pf-delete]").forEach(btn => btn.onclick = () => {
        const [investmentId, entryId] = btn.dataset.pfDelete.split(":");
        deleteProvidentFundEntry(investmentId, entryId);
      });
      document.querySelectorAll("[data-convert-recurring]").forEach(btn => btn.onclick = () => {
        const tx = (state.transactions || []).find(t => t.id === btn.dataset.convertRecurring);
        if (!tx) return;
        const rule = ruleFromTransaction(tx);
        if (!rule) return;
        pushHistory();
        state.recurringRules = state.recurringRules || [];
        state.recurringRules.push(rule);
        state.settings.transactionViewTab = "automation";
        save();
        if (typeof showUndoToast === "function") showUndoToast(`"${rule.name}" is now recurring — next: ${rule.nextDate}`);
        renderNav(); render();
      });
      document.querySelectorAll("[data-open]").forEach(btn => btn.onclick = () => {
        if (btn.dataset.clearSearch && q("globalSearch")) q("globalSearch").value = "";
        setView(btn.dataset.open);
      });
      document.querySelectorAll("[data-seg]").forEach(btn => btn.onclick = () => {
        state.taxSeg = btn.dataset.seg;
        render();
      });
      document.querySelectorAll("[data-txview]").forEach(btn => btn.onclick = () => {
        state.settings.transactionViewTab = btn.dataset.txview;
        persistViewOnly();
        render();
      });
      document.querySelectorAll("[data-planningtab]").forEach(btn => btn.onclick = () => {
        state.settings.planningTab = btn.dataset.planningtab;
        persistViewOnly();
        render();
      });
      document.querySelectorAll("[data-toggle-recurring]").forEach(btn => btn.onclick = () => {
        const rule = (state.recurringRules || []).find(r => r.id === btn.dataset.toggleRecurring);
        if (!rule) return;
        pushHistory();
        rule.active = !rule.active;
        save(); render();
      });
      // Budget month stepper is a view-only navigation filter — do not trigger native save
      document.querySelectorAll("[data-budget-step]").forEach(btn => btn.onclick = () => {
        const cur = state.settings.budgetMonth || today.slice(0, 7);
        let [y, m] = cur.split("-").map(Number);
        const step = btn.dataset.budgetStep;
        if (step === "today") { state.settings.budgetMonth = today.slice(0, 7); }
        else {
          if (step === "prev") { m--; if (m < 1) { m = 12; y--; } }
          else if (step === "next") { m++; if (m > 12) { m = 1; y++; } }
          state.settings.budgetMonth = `${y}-${String(m).padStart(2, "0")}`;
        }
        persistViewOnly();
        render();
      });
      if (q("faApply")) q("faApply").onclick = () => {
        const fa = state.forecastAssumptions || (state.forecastAssumptions = {});
        fa.monthsAhead = Math.max(1, num(q("faMonths").value) || 60);
        const sav = num(q("faSavings").value);
        fa.monthlySavingsOverride = sav > 0 ? sav : null;
        fa.annualReturnPct = num(q("faReturn").value);
        fa.inflationPct = num(q("faInflation").value);
        fa.stickToBudgets = !!q("faStickBudgets").checked;
        save(); render();
      };
      document.querySelectorAll("[data-forecast-scenario]").forEach(btn => btn.onclick = () => {
        const fa = state.forecastAssumptions || (state.forecastAssumptions = {});
        const scenarios = {
          base: { annualReturnPct: 8, inflationPct: 5, scenarioName: "Base case" },
          conservative: { annualReturnPct: 4, inflationPct: 7, scenarioName: "Conservative" },
          aggressive: { annualReturnPct: 12, inflationPct: 5, scenarioName: "Aggressive" }
        };
        Object.assign(fa, scenarios[btn.dataset.forecastScenario]);
        save(); render();
      });
      document.querySelectorAll("[data-module]").forEach(input => input.onchange = () => {
        state.settings.activeModules[input.dataset.module] = input.checked;
        save();
        if (!state.settings.activeModules[activeView]) activeView = "home";
        renderNav();
        render();
      });
      if (q("taxYearSetting")) {
        q("taxYearSetting").onchange = e => {
          const val = e.target.value;
          state.settings.taxYear = val;
          const dates = taxYearDates(val);
          state.settings.incomeYearStart = dates.start;
          state.settings.incomeYearEnd = dates.end;
          if (q("periodBadgeLabel")) q("periodBadgeLabel").textContent = "AY " + val;
          save();
          renderNav();
          render();
        };
      }
      if (q("cascadeSetting")) {
        q("cascadeSetting").onchange = e => {
          state.settings.cascadePolicy = e.target.value;
          save();
          render();
        };
      }
      if (q("exportBtn")) q("exportBtn").onclick = exportAll;
      if (q("importBtn")) q("importBtn").onclick = importAll;
      if (q("portableBtn")) q("portableBtn").onclick = downloadPortableHtml;
      if (q("seedBtn")) q("seedBtn").onclick = seedData;
      if (q("resetBtn")) q("resetBtn").onclick = resetData;
      if (q("clearSearchInline")) q("clearSearchInline").onclick = clearSearch;
      if (q("ownerSetting")) q("ownerSetting").onchange = e => { state.settings.owner = e.target.value; save(); updateBrand(); };
      if (q("brandSubtitleSetting")) q("brandSubtitleSetting").onchange = e => { state.settings.brandSubtitle = e.target.value; save(); updateBrand(); };
      if (q("newTaxYearBtn")) q("newTaxYearBtn").onclick = advanceTaxYear;
      if (q("backfillHistoryBtn")) q("backfillHistoryBtn").onclick = () => {
        pushHistory();
        const res = runBackfill();
        save();
        showAppNotice("Backfill complete", `${res.added} month-end snapshot${res.added === 1 ? "" : "s"} added.\nTotal snapshots: ${(state.netWorthSnapshots || []).length}.`);
        render();
      };
      // Settings PIN & Privacy & Native Sync buttons
      if (q("configurePinBtn")) q("configurePinBtn").onclick = () => { if (typeof promptConfigurePin === "function") promptConfigurePin(); };
      if (q("removePinBtn")) q("removePinBtn").onclick = () => { if (typeof promptRemovePin === "function") promptRemovePin(); };
      if (q("lockWorkspaceBtn")) q("lockWorkspaceBtn").onclick = () => { if (typeof lockWorkspaceNow === "function") lockWorkspaceNow(); };
      if (q("settingsPrivacyBtn")) q("settingsPrivacyBtn").onclick = () => { if (typeof togglePrivacyMode === "function") togglePrivacyMode(); };
      if (q("settingsSyncNowBtn")) q("settingsSyncNowBtn").onclick = () => window.financeNativeBridge?.syncNow?.();
      if (q("settingsChooseFolderBtn")) q("settingsChooseFolderBtn").onclick = () => window.financeNativeBridge?.chooseSyncFolder?.();
      if (q("settingsSafetyVaultBtn")) q("settingsSafetyVaultBtn").onclick = () => window.financeNativeBridge?.openSafetyCenter?.();

      if (q("addCatBtn")) q("addCatBtn").onclick = () => {
        const name = q("newCatName")?.value?.trim(); const type = q("newCatType")?.value;
        if (!name) return;
        pushHistory();
        state.categories.push({ id: id(), type, name });
        save(); render();
      };
      document.querySelectorAll("[data-del-cat]").forEach(btn => btn.onclick = async () => {
        const catToDelete = state.categories.find(c => c.id === btn.dataset.delCat);
        if (catToDelete?._system) {
          showAppNotice("System category", "System categories cannot be deleted. They are required for auto-generated transactions.");
          return;
        }
        if (catToDelete?.isIncomeSourceOfTruth) {
          const ok = await showAppConfirm("Delete tax category?", `"${catToDelete.name}" is used by the tax engine to classify income. Deleting it will affect tax calculations. Continue?`, { confirmLabel: "Delete", danger: true });
          if (!ok) return;
        }
        pushHistory();
        state.categories = state.categories.filter(c => c.id !== btn.dataset.delCat);
        save(); render();
      });
      if (q("addAccBtn")) q("addAccBtn").onclick = () => {
        const name = q("newAccName")?.value?.trim(); const type = q("newAccType")?.value;
        const balance = num(q("newAccBalance")?.value);
        if (!name) return;
        pushHistory();
        state.accounts.push({ id: id(), name, type, balance, active: true });
        save(); render();
      };
      document.querySelectorAll("[data-del-acc]").forEach(btn => btn.onclick = async () => {
        const acc = state.accounts.find(a => a.id === btn.dataset.delAcc);
        if (!acc) return;
        const ok = await showAppConfirm("Remove account?", `Remove account "${acc.name}"?`, { confirmLabel: "Remove", danger: true });
        if (!ok) return;
        pushHistory();
        state.accounts = state.accounts.filter(a => a.id !== btn.dataset.delAcc);
        save(); render();
      });
      document.querySelectorAll("[data-edit-acc-bal]").forEach(btn => btn.onclick = async () => {
        const accId = btn.dataset.editAccBal;
        const account = state.accounts.find(a => a.id === accId);
        if (!account) return;
        const newValStr = await showAppPrompt("Starting balance", `Enter starting balance for "${account.name}":`, account.balance, "number");
        if (newValStr === null) return;
        const newVal = num(newValStr);
        pushHistory();
        account.balance = newVal;
        save(); render();
      });
      if (q("addSlabBtn")) q("addSlabBtn").onclick = () => {
        pushHistory();
        const threshold = num(q("newSlabThreshold")?.value); const rate = num(q("newSlabRate")?.value) / 100;
        const slabs = getTaxSlabsForYear(state?.settings?.taxYear);
        slabs.push({ id: id(), threshold, rate });
        save(); render();
      };
      document.querySelectorAll("[data-del-slab]").forEach(btn => btn.onclick = () => {
        pushHistory();
        const idx = parseInt(btn.dataset.delSlab);
        const slabs = getTaxSlabsForYear(state?.settings?.taxYear);
        slabs.splice(idx, 1);
        save(); render();
      });
      document.querySelectorAll("[data-slab-threshold]").forEach(inp => inp.onchange = () => {
        const idx = parseInt(inp.dataset.slabThreshold);
        const slabs = getTaxSlabsForYear(state?.settings?.taxYear);
        slabs[idx].threshold = num(inp.value);
        save(); render();
      });
      document.querySelectorAll("[data-slab-rate]").forEach(inp => inp.onchange = () => {
        const idx = parseInt(inp.dataset.slabRate);
        const slabs = getTaxSlabsForYear(state?.settings?.taxYear);
        slabs[idx].rate = num(inp.value) / 100;
        save(); render();
      });
      if (q("saveDeductionBtn")) q("saveDeductionBtn").onclick = () => {
        pushHistory();
        const newStdDed = { fraction: num(q("stdFraction")?.value), cap: num(q("stdCap")?.value) };
        const newRebate = { rate: num(q("rebateRate")?.value), investmentCapPercent: num(q("rebateCapPct")?.value), maxCapAbsolute: num(q("rebateMaxCap")?.value) };
        state.settings.standardDeduction = newStdDed;
        state.settings.rebateParams = newRebate;
        const taxYear = state?.settings?.taxYear || currentTaxYear();
        state.settings.yearlyTaxRules = state.settings.yearlyTaxRules || {};
        if (!state.settings.yearlyTaxRules[taxYear]) state.settings.yearlyTaxRules[taxYear] = {};
        state.settings.yearlyTaxRules[taxYear].standardDeduction = JSON.parse(JSON.stringify(newStdDed));
        state.settings.yearlyTaxRules[taxYear].rebateParams = JSON.parse(JSON.stringify(newRebate));
        save(); render();
        showUndoToast('Deduction & rebate rules saved for ' + taxYear);
      };
      if (q("salTemplate_addOtherBtn")) q("salTemplate_addOtherBtn").onclick = () => {
        const name = q("salTemplate_newOtherName")?.value?.trim();
        const type = q("salTemplate_newOtherType")?.value;
        const value = num(q("salTemplate_newOtherValue")?.value);
        if (!name) return;
        pushHistory();
        if (!state.settings.salaryTemplate) migrateState(state);
        state.settings.salaryTemplate.otherComponents.push({ name, type, value });
        save(); render();
      };
      document.querySelectorAll(".remove-other-comp").forEach(btn => btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx);
        pushHistory();
        if (!state.settings.salaryTemplate) migrateState(state);
        state.settings.salaryTemplate.otherComponents.splice(idx, 1);
        save(); render();
      });
      if (q("saveSalaryTemplateBtn")) q("saveSalaryTemplateBtn").onclick = () => {
        pushHistory();
        if (!state.settings.salaryTemplate) migrateState(state);
        ["hra", "conveyance", "medical", "pfEmployee", "pfEmployer"].forEach(field => {
          state.settings.salaryTemplate[field] = {
            type: q(`salTemplate_${field}_type`).value,
            value: num(q(`salTemplate_${field}_value`).value)
          };
        });
        const otherList = q("salTemplate_otherList");
        if (otherList) {
          const rows = otherList.querySelectorAll(".slab-row");
          rows.forEach(row => {
            const idx = parseInt(row.dataset.otherIdx);
            const name = row.querySelector(".other-name").value.trim();
            const type = row.querySelector(".other-type").value;
            const value = num(row.querySelector(".other-value").value);
            if (name && state.settings.salaryTemplate.otherComponents[idx]) {
              state.settings.salaryTemplate.otherComponents[idx] = { name, type, value };
            }
          });
        }
        save(); render();
        showUndoToast("Salary template saved");
      };
      // View-only sort/filter controls: use persistViewOnly() so changing a dropdown
      // never triggers a full native file/sync save!
      if (q("transactionSort")) q("transactionSort").onchange = e => {
        state.settings.transactionSort = e.target.value;
        persistViewOnly();
        render();
      };
      if (q("transactionTypeFilter")) q("transactionTypeFilter").onchange = e => {
        state.settings.transactionTypeFilter = e.target.value;
        const validCats = categoriesForTypeFilter(e.target.value);
        const cur = state.settings.transactionCategoryFilter || "";
        if (cur && !validCats.includes(cur)) state.settings.transactionCategoryFilter = "";
        _txRenderLimit = 120;
        persistViewOnly();
        render();
      };
      if (q("transactionCategoryFilter")) q("transactionCategoryFilter").onchange = e => {
        state.settings.transactionCategoryFilter = e.target.value;
        _txRenderLimit = 120;
        persistViewOnly();
        render();
      };
      if (q("transactionPeriodFilter")) q("transactionPeriodFilter").onchange = e => {
        state.settings.transactionPeriodFilter = e.target.value;
        _txRenderLimit = 120;
        bumpStateRev();
        persistViewOnly();
        renderNav();
        render();
      };
    }

    function bindSalaryFormEvents() {
      const form = q("recordForm");
      if (!form || editing.type !== "salary") return;

      const basicInp = form.elements.basic;
      if (!basicInp) return;

      const template = state?.settings?.salaryTemplate || {};

      const updateCalculations = () => {
        const basic = num(basicInp.value);
        if (!basic) return;

        const isNew = !editing.id;

        const hraVal = template.hra?.type === "percentage" ? Math.round(basic * template.hra.value / 100) : num(template.hra?.value);
        const convVal = template.conveyance?.type === "percentage" ? Math.round(basic * template.conveyance.value / 100) : num(template.conveyance?.value);
        const medVal = template.medical?.type === "percentage" ? Math.round(basic * template.medical.value / 100) : num(template.medical?.value);
        const pfEmpVal = template.pfEmployee?.type === "percentage" ? Math.round(basic * template.pfEmployee.value / 100) : num(template.pfEmployee?.value);
        const pfEmpEmployerVal = template.pfEmployer?.type === "percentage" ? Math.round(basic * template.pfEmployer.value / 100) : num(template.pfEmployer?.value);

        let otherVal = 0;
        let otherBreakdown = [];
        if (Array.isArray(template.otherComponents)) {
          template.otherComponents.forEach(comp => {
            const val = comp.type === "percentage" ? Math.round(basic * comp.value / 100) : num(comp.value);
            otherVal += val;
            otherBreakdown.push(`${comp.name} BDT ${val.toLocaleString("en-IN")}`);
          });
        }

        if (isNew || num(form.elements.houseRent.value) === 0) form.elements.houseRent.value = hraVal;
        if (isNew || num(form.elements.conveyance.value) === 0) form.elements.conveyance.value = convVal;
        if (isNew || num(form.elements.medical.value) === 0) form.elements.medical.value = medVal;
        if (isNew || num(form.elements.pfEmployee.value) === 0) form.elements.pfEmployee.value = pfEmpVal;
        if (isNew || num(form.elements.pfEmployer.value) === 0) form.elements.pfEmployer.value = pfEmpEmployerVal;
        if (isNew || num(form.elements.other.value) === 0) form.elements.other.value = otherVal;

        if (otherBreakdown.length > 0 && (isNew || !form.elements.notes.value.trim())) {
          form.elements.notes.value = `Other allowances (BDT ${otherVal.toLocaleString("en-IN")}): ${otherBreakdown.join(" + ")}.`;
        }

        updateLiveSummary();
      };

      const updateLiveSummary = () => {
        const basic = num(form.elements.basic.value);
        const houseRent = num(form.elements.houseRent.value);
        const medical = num(form.elements.medical.value);
        const conveyance = num(form.elements.conveyance.value);
        const bonus = num(form.elements.bonus.value);
        const other = num(form.elements.other.value);
        const pfEmployee = num(form.elements.pfEmployee.value);
        const pfEmployer = num(form.elements.pfEmployer.value);
        const tds = num(form.elements.tds.value);

        const gross = basic + houseRent + medical + conveyance + bonus + other;
        const deductions = pfEmployee + tds;
        const net = gross - deductions;

        let summaryEl = q("salaryLiveSummary");
        if (!summaryEl) {
          summaryEl = document.createElement("div");
          summaryEl.id = "salaryLiveSummary";
          summaryEl.style.cssText = "grid-column: 1 / -1; background: var(--surface-soft); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; margin-top: 10px; font-size: 13px;";
          form.querySelector(".form-grid").appendChild(summaryEl);
        }

        summaryEl.innerHTML = `
          <div style="display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 4px;">
            <span>Gross Salary:</span>
            <span>${money(gross)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; color: var(--muted); font-size: 12px; margin-bottom: 4px; padding-left: 10px;">
            <span>(Basic ${money(basic)} + HRA ${money(houseRent)} + Conv ${money(conveyance)} + Med ${money(medical)} + Bonus ${money(bonus)} + Other ${money(other)})</span>
          </div>
          ${pfEmployer ? `<div style="display: flex; justify-content: space-between; color: var(--blue); font-size: 12px; margin-bottom: 6px;">
            <span>+ Employer PF (taxable, not paid to you):</span>
            <span>${money(pfEmployer)}</span>
          </div>` : ""}
          <div style="display: flex; justify-content: space-between; color: var(--red); margin-bottom: 6px;">
            <span>Deductions:</span>
            <span>-${money(deductions)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; color: var(--muted); font-size: 12px; margin-bottom: 8px; padding-left: 10px;">
            <span>(PF Employee ${money(pfEmployee)} + TDS ${money(tds)})</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 14px; border-top: 1px solid var(--border); padding-top: 8px; color: var(--green);">
            <span>Net Take-Home:</span>
            <span>${money(net)}</span>
          </div>
        `;
      };

      basicInp.addEventListener("input", updateCalculations);
      ["houseRent", "medical", "conveyance", "bonus", "other", "pfEmployee", "pfEmployer", "tds"].forEach(name => {
        form.elements[name]?.addEventListener("input", updateLiveSummary);
      });

      if (basicInp.value) {
        updateCalculations();
      }
    }

    function bindTransactionFormEvents() {
      const form = q("recordForm");
      if (!form || editing.type !== "transactions") return;
      const typeSelect = form.elements.type;
      const categorySelectEl = form.elements.category;
      if (!typeSelect || !categorySelectEl) return;

      const applyTransferUI = () => {
        const isTransfer = typeSelect.value === "transfer";
        const fromWrap = form.elements.fromAccountId?.closest("label");
        const toWrap = form.elements.accountId?.closest("label");
        if (fromWrap) fromWrap.style.display = isTransfer ? "" : "none";
        if (toWrap) {
          const labelNode = [...toWrap.childNodes].find(n => n.nodeType === Node.TEXT_NODE);
          if (labelNode) labelNode.nodeValue = isTransfer ? "To account" : "Account";
        }
      };
      applyTransferUI();
      typeSelect.addEventListener("change", applyTransferUI);

      typeSelect.addEventListener("change", () => {
        const currentVal = categorySelectEl.value;
        const cats = (state?.categories || []).filter(c => c.type === typeSelect.value);
        categorySelectEl.innerHTML = `<option value="">Select...</option>` +
          cats.map(c => `<option value="${escapeHtml(c.name)}" ${currentVal === c.name ? "selected" : ""}>${escapeHtml(c.type)}: ${escapeHtml(c.name)}</option>`).join("");
      });
    }

    function quickAddLastMonthSalary() {
      if (!state.salary || !state.salary.length) {
        showAppNotice("No salary history", "No existing salary records to clone. Please add one manually first.");
        return;
      }

      const sorted = [...state.salary].sort((a,b) => String(b.date || "").localeCompare(String(a.date || "")));
      const latest = sorted[0];

      const copy = safeClone(latest);
      copy.id = id();
      copy.createdAt = new Date().toISOString();
      delete copy.closedAt;

      const lastDate = parseDate(latest.date || today);
      if (lastDate) {
        lastDate.setMonth(lastDate.getMonth() + 1);

        const y = lastDate.getFullYear();
        const m = String(lastDate.getMonth() + 1).padStart(2, "0");
        const d = String(lastDate.getDate()).padStart(2, "0");
        copy.date = `${y}-${m}-${d}`;

        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const nameMatch = latest.name.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/);
        if (nameMatch) {
          const currentMonthIdx = months.indexOf(nameMatch[1]);
          const nextMonthIdx = (currentMonthIdx + 1) % 12;
          const nextYear = currentMonthIdx === 11 ? parseInt(nameMatch[2]) + 1 : parseInt(nameMatch[2]);
          copy.name = latest.name.replace(nameMatch[0], `${months[nextMonthIdx]} ${nextYear}`);
        } else {
          copy.name = `${latest.name} (copy)`;
        }
      } else {
        copy.date = today;
        copy.name = `${latest.name} (copy)`;
      }
      const template = state?.settings?.salaryTemplate || {};
      copy.tds = latest.tds > latest.basic * 0.2 ? 0 : latest.tds;
      copy.bonus = 0;

      let otherVal = 0;
      let otherBreakdown = [];
      if (Array.isArray(template.otherComponents)) {
        template.otherComponents.forEach(comp => {
          const val = comp.type === "percentage" ? Math.round(copy.basic * comp.value / 100) : num(comp.value);
          otherVal += val;
          otherBreakdown.push(`${comp.name} BDT ${val.toLocaleString("en-IN")}`);
        });
      }
      if (otherBreakdown.length > 0) {
        copy.notes = `Other allowances (BDT ${otherVal.toLocaleString("en-IN")}): ${otherBreakdown.join(" + ")}.`;
      } else {
        copy.notes = "";
      }

      copy.gross = ["basic","houseRent","medical","conveyance","bonus","other"].reduce((s,k)=>s+num(copy[k]),0);
      pushHistory();
      state.salary.push(copy);
      syncSalaryTransaction(copy);
      syncPfLedgerFromSalary(copy);
      syncLinksFromDocuments();
      save();
      renderNav();
      render();
      showUndoToast(`Cloned as "${copy.name}"`);
    }

    function openCopyForm(type, recId) {
      const source = (state[type] || []).find(r => r.id === recId);
      if (!source) return;
      const copy = cloneRecordForCopy(source);
      editing = { type, id: null };
      q("drawerTitle").textContent = `Copy ${labelFor(type)}`;
      q("drawerBody").innerHTML = formFor(type, copy);
      q("drawer").classList.add("open");
      q("drawer").setAttribute("aria-hidden", "false");
      q("recordForm").onsubmit = saveForm;
      if (type === "salary") bindSalaryFormEvents();
      if (type === "transactions") bindTransactionFormEvents();
    }

    function cloneRecordForCopy(record) {
      const copy = safeClone(record);
      ["id","createdAt","closedAt","sourceType","sourceId","generatedKind","withdrawalDate","withdrawalAccountId","withdrawalGrossProceeds","withdrawalNetProceeds","principalReturned","settlementNotes"].forEach(key => delete copy[key]);
      if (copy.type === "provident_fund" && Array.isArray(record.pfLedger) && record.pfLedger.length) {
        const latest = record.pfLedger[record.pfLedger.length - 1];
        copy.name = `${latest.name || record.name} (copy)`;
        copy.startDate = latest.date || copy.startDate;
        copy.principal = latest.principal;
        copy.currentValue = latest.currentValue;
        copy.taxableProfit = latest.taxableProfit;
        copy.taxDeducted = latest.taxDeducted;
        copy.notes = latest.notes || copy.notes || "";
        delete copy.pfLedger;
        return copy;
      }
      if (copy.name) copy.name = `${copy.name} (copy)`;
      if (copy.status === "matured" || copy.status === "withdrawn") copy.status = "active";
      if (copy.type === "provident_fund") delete copy.pfLedger;
      return copy;
    }

    function openProvidentFundEntryForm(investmentId, entryId) {
      const pf = (state?.investments || []).find(i => i.id === investmentId && i.type === "provident_fund");
      const entry = pf?.pfLedger?.find(e => e.id === entryId);
      if (!pf || !entry) return;
      editing = { type: "pfLedger", id: entryId, parentId: investmentId };
      q("drawerTitle").textContent = "Edit PF Entry";
      q("drawerBody").innerHTML = providentFundEntryForm(entry);
      q("drawer").classList.add("open");
      q("drawer").setAttribute("aria-hidden", "false");
      q("recordForm").onsubmit = saveProvidentFundEntry;
    }

    function openProvidentFundEntryCopyForm(investmentId, entryId) {
      const pf = (state?.investments || []).find(i => i.id === investmentId && i.type === "provident_fund");
      const entry = pf?.pfLedger?.find(e => e.id === entryId);
      if (!pf || !entry) return;
      const copy = {
        name: `${entry.name || "PF entry"} (copy)`,
        type: "provident_fund",
        institution: pf.institution || "",
        principal: entry.principal,
        currentValue: entry.currentValue || entry.principal,
        taxableProfit: entry.taxableProfit,
        taxDeducted: entry.taxDeducted,
        startDate: entry.date || today,
        notes: entry.notes || "",
        rebateEligible: true
      };
      editing = { type: "investments", id: null };
      q("drawerTitle").textContent = "Copy PF Entry";
      q("drawerBody").innerHTML = formFor("investments", copy);
      q("drawer").classList.add("open");
      q("drawer").setAttribute("aria-hidden", "false");
      q("recordForm").onsubmit = saveForm;
    }

    function providentFundEntryForm(entry) {
      return `<form id="recordForm" class="grid">
        <div class="form-grid">
          ${input("name", "Entry name", entry.name)}
          ${input("date", "Entry date", entry.date || today, "date")}
          ${input("principal", "Principal/contribution", entry.principal, "number")}
          ${input("currentValue", "Current value", entry.currentValue || entry.principal, "number")}
          ${input("taxableProfit", "Taxable gain/profit", entry.taxableProfit, "number")}
          ${input("taxDeducted", "Source tax deducted", entry.taxDeducted, "number")}
          ${textarea("notes", "Notes", entry.notes)}
        </div>
        <div class="toolbar"><button class="primary" type="submit">Save PF Entry</button><button type="button" id="cancelForm">Cancel</button></div>
      </form>`;
    }

    function openInvestmentSettlement(investmentId) {
      editing = { type: "investmentSettlement", id: investmentId };
      const inv = (state?.investments || []).find(i => i.id === investmentId);
      if (!inv) return;
      const isEditingSettlement = inv.status === "matured" || inv.status === "withdrawn";
      q("drawerTitle").textContent = isEditingSettlement ? `Edit Settlement` : `Withdraw/Mature ${labelFor("investments")}`;
      q("drawerBody").innerHTML = settlementFormFor(inv);
      q("drawer").classList.add("open");
      q("drawer").setAttribute("aria-hidden", "false");
      q("recordForm").onsubmit = saveInvestmentSettlement;
    }

    function settlementFormFor(inv) {
      const isEditingSettlement = inv.status === "matured" || inv.status === "withdrawn";
      const defaultPrincipal = num(inv.principalReturned || inv.currentValue || inv.principal);
      const defaultGain = num(inv.taxableProfit);
      const defaultTax = num(inv.taxDeducted);
      const accounts = (state?.accounts || []).map(a => `<option value="${a.id}" ${inv.withdrawalAccountId === a.id ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("");
      const currentMethod = inv.profitTaxMethod || defaultProfitTaxMethod(inv.type);
      return `<form id="recordForm" class="grid">
        <div class="settlement-card">
          <strong>${escapeHtml(inv.name)}</strong><br>
          ${isEditingSettlement
            ? "Editing a saved settlement. Changes will update the linked transfer transaction and all tax figures."
            : "Net deposit will be principal returned + taxable gain - source tax. The deposit is recorded as a linked transfer, while gain and source tax stay on this investment for tax filing."}
        </div>
        <div class="form-grid">
          ${select("status", "Event type", inv.status || "matured", [["matured","Matured"],["withdrawn","Withdrawn"]])}
          ${input("withdrawalDate", "Settlement date", inv.withdrawalDate || inv.maturityDate || today, "date")}
          ${selectHtml("withdrawalAccountId", "Deposit account", accounts)}
          ${input("principalReturned", "Principal returned", defaultPrincipal, "number")}
          ${input("taxableProfit", "Taxable gain/profit", defaultGain, "number")}
          ${input("taxDeducted", "Source tax deducted", defaultTax, "number")}
          ${select("profitTaxMethod", "Profit tax treatment", currentMethod, [["final","Final tax (source tax = final tax)"],["slab","Slab tax (profit joins slab, source tax = credit)"]])}
          <label style="grid-column: 1 / -1; font-size: 11px; color: var(--muted); margin-top: -4px;">Tax rules may change — confirm or change the treatment at withdrawal.</label>
          ${textarea("settlementNotes", "Settlement notes", inv.settlementNotes || inv.notes || "")}
        </div>
        <div class="toolbar"><button class="primary" type="submit">${isEditingSettlement ? "Update Settlement" : "Save Settlement"}</button><button type="button" id="cancelForm">Cancel</button></div>
      </form>`;
    }

    function openForm(type, recId, presets) {
      editing = { type, id: recId || null };
      let record = recId ? state[type].find(r => r.id === recId) : (presets || {});
      if (type === "salary" && !recId) {
        const sorted = [...(state.salary || [])].sort((a,b) => String(b.date || "").localeCompare(String(a.date || "")));
        const latestBasic = sorted[0]?.basic || 70000;

        let nextMonthName = "";
        const now = new Date();
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

        if (sorted[0]) {
          const nameMatch = sorted[0].name.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/);
          if (nameMatch) {
            const currentMonthIdx = months.indexOf(nameMatch[1]);
            const nextMonthIdx = (currentMonthIdx + 1) % 12;
            const nextYear = currentMonthIdx === 11 ? parseInt(nameMatch[2]) + 1 : parseInt(nameMatch[2]);
            nextMonthName = `Salary – ${months[nextMonthIdx]} ${nextYear}`;
          }
        }

        if (!nextMonthName) {
          nextMonthName = `Salary – ${months[now.getMonth()]} ${now.getFullYear()}`;
        }

        record = {
          basic: latestBasic,
          date: today,
          name: nextMonthName
        };
      }
      q("drawerTitle").textContent = `${recId ? "Edit" : "Add"} ${labelFor(type)}`;
      q("drawerBody").innerHTML = formFor(type, record || {});
      q("drawer").classList.add("open");
      q("drawer").setAttribute("aria-hidden", "false");
      q("recordForm").onsubmit = saveForm;
      if (type === "salary") bindSalaryFormEvents();
      if (type === "transactions") bindTransactionFormEvents();
    }

    function formFor(type, r) {
      const accounts = (state?.accounts || []).map(a => `<option value="${a.id}" ${r.accountId === a.id ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("");
      const fundingAccounts = (state?.accounts || []).map(a => `<option value="${a.id}" ${r.fundingAccountId === a.id ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("");
      const linkedAccountOptions = `<option value=""${!r.linkedAccountId ? " selected" : ""}>None (manual)</option>` + (state?.accounts || []).map(a => `<option value="${a.id}" ${r.linkedAccountId === a.id ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("");
      const liabilityOptions = `<option value=""${!r.linkedLiabilityId ? " selected" : ""}>None</option>` + (state?.liabilities || []).map(l => `<option value="${l.id}" ${r.linkedLiabilityId === l.id ? "selected" : ""}>${escapeHtml(l.name)}</option>`).join("");
      let fields = "";
      if (type === "transactions") fields = `
        ${input("name", "Name", r.name)}${select("type", "Type", r.type, [["income","Income"],["expense","Expense"],["transfer","Transfer"]])}${input("date", "Date", r.date || today, "date")}${input("amount", "Amount", r.amount, "number")}
        ${categorySelect(r.category, r.type || "income")}${selectHtml("fromAccountId", "From account (transfer only)", accounts)}${selectHtml("accountId", "Account", accounts)}${input("taxableAmount", "Taxable amount", r.taxableAmount, "number")}${selectHtml("linkedLiabilityId", "Linked liability (EMI/repayment, optional)", liabilityOptions)}${textarea("notes", "Notes", r.notes)}
        ${checkbox("affectsAccount", "Affects account balance", r.affectsAccount !== false, "When checked, this transaction updates the linked account balance and total assets. Uncheck for memo-only records.")}`;
      if (type === "salary") fields = `
        ${input("name", "Salary month/name", r.name)}${input("date", "Pay date", r.date || today, "date")}${input("basic", "Basic", r.basic, "number")}${input("houseRent", "House rent", r.houseRent, "number")}
        ${input("medical", "Medical", r.medical, "number")}${input("conveyance", "Conveyance", r.conveyance, "number")}${input("bonus", "Bonus/festival", r.bonus, "number")}${input("other", "Other allowance", r.other, "number")}
        ${input("pfEmployee", "Employee PF", r.pfEmployee, "number")}${input("pfEmployer", "Employer PF", r.pfEmployer, "number")}${input("tds", "TDS", r.tds, "number")}${selectHtml("accountId", "Salary deposit account", accounts)}
        ${textarea("notes", "Notes", r.notes)}`;
      if (type === "assets") fields = `
        ${input("name", "Name", r.name)}${select("type", "Type", r.type, [["property","Property"],["vehicle","Vehicle"],["gold","Gold"],["receivable","Receivable"],["other","Other"]])}${input("institution", "Institution / Location", r.institution)}${input("amount", "Original amount", r.amount, "number")}
        ${input("currentValue", "Current value", r.currentValue, "number")}${input("acquiredDate", "Acquired date", r.acquiredDate, "date")}${textarea("notes", "Notes", r.notes)}`;
      if (type === "liabilities") fields = `
        ${input("name", "Name", r.name)}${select("type", "Type", r.type, [["loan","Loan"],["credit_card","Credit card"],["tax_payable","Tax payable"],["family","Family obligation"],["other","Other"]])}${input("amount", "Original amount", r.amount, "number")}${input("balance", "Current balance", r.balance, "number")}
        ${input("rate", "Interest/profit rate", r.rate, "number")}${input("dueDate", "Next due date", r.dueDate, "date")}${textarea("notes", "Notes", r.notes)}`;
      if (type === "investments") fields = `
        ${input("name", "Name", r.name)}${select("type", "Type", r.type, [["savings_certificate","Savings certificate"],["dps","DPS"],["fdr","FDR"],["mutual_fund","Mutual fund"],["provident_fund","Provident fund"],["other","Other"]])}${input("institution", "Institution", r.institution)}${input("principal", "Principal", r.principal, "number")}
        ${input("currentValue", "Current value", r.currentValue, "number")}${input("profitRate", "Profit/rate %", r.profitRate, "number")}
        ${input("startDate", "Start date", r.startDate, "date")}${input("maturityDate", "Maturity date", r.maturityDate, "date")}${checkbox("rebateEligible", "Eligible for tax rebate", r.rebateEligible)}
        ${select("profitTaxMethod", "Profit tax treatment", r.profitTaxMethod || defaultProfitTaxMethod(r.type), [["final","Final tax (source tax = final tax)"],["slab","Slab tax (profit joins slab, source tax = credit)"]])}
        ${select("fundingMode", "Funding source", r.fundingMode || (r.type === "provident_fund" ? "payroll_pf" : "cash_account"), [["cash_account","Paid from cash/bank account"],["payroll_pf","Payroll PF - no cash outflow"],["external_opening","Opening/external asset - no cash outflow"]])}${selectHtml("fundingAccountId", "Funding account", fundingAccounts)}
        ${textarea("notes", "Notes", r.notes)}`;
      if (type === "taxPayments") fields = `
        ${input("name", "Name", r.name)}${select("type", "Type", r.type, [["tds","TDS"],["ait","AIT"],["challan","Challan"],["refund","Refund adjustment"],["other","Other"]])}${input("amount", "Amount", r.amount, "number")}${input("date", "Date", r.date || today, "date")}
        ${input("taxYear", "Tax year", r.taxYear || (state?.settings?.taxYear || "2026-27"))}${selectHtml("accountId", "Deduct from account (optional)", accounts)}${textarea("notes", "Notes", r.notes)}`;
      if (type === "goals") fields = `
        ${input("name", "Name", r.name)}${select("type", "Type", r.type, [["emergency_fund","Emergency fund"],["tax_planning","Tax planning"],["retirement","Retirement"],["purchase","Big purchase"],["travel","Travel"],["other","Other"]])}${input("target", "Target amount", r.target, "number")}${input("current", "Current saved", r.current, "number")}
        ${input("monthlyContribution", "Monthly contribution", r.monthlyContribution, "number")}${input("targetDate", "Target date", r.targetDate, "date")}${selectHtml("linkedAccountId", "Auto-track from account (optional)", linkedAccountOptions)}${textarea("notes", "Notes", r.notes)}`;
      if (type === "recurringRules") {
        const ruleTypeOpts = [["expense","Expense (payment)"],["income","Income"]];
        const freqOpts = [["monthly","Monthly"],["weekly","Weekly"],["yearly","Yearly"]];
        const domVal = r.dayOfMonth || (r.nextDate ? (() => { const d = parseDate(r.nextDate); return d ? d.getDate() : 5; })() : 5);
        fields = `
        ${input("name", "Name", r.name)}${select("type", "Cash direction", r.type || "expense", ruleTypeOpts)}${input("amount", "Amount", r.amount, "number")}${categorySelect(r.category, r.type || "expense")}
        ${selectHtml("accountId", "Account", accounts)}${selectHtml("linkedLiabilityId", "Linked liability (EMI paydown, optional)", liabilityOptions)}
        ${select("frequency", "Frequency", r.frequency || "monthly", freqOpts)}${input("interval", "Every N (interval, 1=every, 3=quarterly)", r.interval || 1, "number")}${input("dayOfMonth", "Day of month (1-31, clamps to month end)", domVal, "number")}
        ${input("nextDate", "Next due date", r.nextDate || today, "date")}${input("startDate", "Start date (optional)", r.startDate, "date")}${input("endDate", "End date (optional, blank=open)", r.endDate, "date")}
        ${checkbox("active", "Active", r.active !== false, "When on, this rule generates transactions on its next due date.")}${textarea("notes", "Notes", r.notes)}`;
      }
      if (type === "budgets") {
        const expCats = (state?.categories || []).filter(c => c.type === "expense");
        const expOpts = expCats.map(c => `<option value="${escapeHtml(c.name)}" ${r.category === c.name ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("");
        fields = `
        <label>Category (one budget per category)<select name="category"><option value="">Select...</option>${expOpts}</select></label>
        ${input("monthlyLimit", "Monthly limit", r.monthlyLimit, "number")}${checkbox("rollover", "Rollover unused (reserved for a future version)", r.rollover || false, "Off in v1 — kept on the record so enabling it later is a flip, not a migration.")}
        ${textarea("notes", "Notes", r.notes)}`;
      }

      return `<form id="recordForm" class="grid"><div class="form-grid">${fields}</div><div class="toolbar"><button class="primary" type="submit">Save</button><button type="button" id="cancelForm">Cancel</button></div></form>`;
    }

    function input(name, label, value = "", type = "text") {
      return `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value ?? "")}"></label>`;
    }

    function textarea(name, label, value = "") {
      return `<label class="full">${label}<textarea name="${name}">${escapeHtml(value ?? "")}</textarea></label>`;
    }

    function select(name, label, value, options) {
      return `<label>${label}<select name="${name}">${options.map(([v, l]) => `<option value="${v}" ${String(value || "") === String(v) ? "selected" : ""}>${l}</option>`).join("")}</select></label>`;
    }

    function selectHtml(name, label, optionsHtml) {
      return `<label>${label}<select name="${name}"><option value="">None</option>${optionsHtml}</select></label>`;
    }

    function checkbox(name, label, checked, help = "Feeds Bangladesh tax rebate planning.") {
      return `<label class="toggle-card"><input name="${name}" type="checkbox" ${checked ? "checked" : ""}><span><strong>${label}</strong><span>${escapeHtml(help)}</span></span></label>`;
    }

    function categorySelect(value, typeFilter = "") {
      const cats = (state?.categories || []).filter(c => !typeFilter || c.type === typeFilter);
      const opts = cats.map(c => `<option value="${escapeHtml(c.name)}" ${value === c.name ? "selected" : ""}>${escapeHtml(c.type)}: ${escapeHtml(c.name)}</option>`).join("");
      return `<label>Category<select name="category"><option value="">Select...</option>${opts}</select></label>`;
    }

    function escapeHtml(v) {
      return String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function saveForm(e) {
      e.preventDefault();
      const form = new FormData(e.target);
      const rec = {};
      for (const [key, value] of form.entries()) rec[key] = value;
      if (editing.type === "investments") rec.rebateEligible = e.target.elements.rebateEligible?.checked || false;
      if (editing.type === "transactions") {
        const cb = e.target.elements.affectsAccount;
        rec.affectsAccount = cb ? cb.checked : true;
        rec.cashFlowMode = rec.affectsAccount ? "cash" : "memo";
        if (rec.affectsAccount && !rec.accountId) {
          showAppNotice("Account required", "This transaction is set to affect an account balance, but no account is selected.\n\nPlease choose an account, or uncheck \"Affects account balance\" to record it as memo-only.");
          return;
        }
        if (rec.type === "transfer") {
          if (!rec.fromAccountId || !rec.accountId) {
            showAppNotice("Accounts required", "A transfer needs both a 'From account' and a 'To account'. Please select both before saving.");
            return;
          }
          if (rec.fromAccountId === rec.accountId) {
            showAppNotice("Invalid transfer", "The 'From account' and 'To account' for a transfer must be different.");
            return;
          }
        } else {
          rec.fromAccountId = "";
        }
      }
      if (editing.type === "recurringRules") rec.active = e.target.elements.active?.checked !== false;
      if (editing.type === "budgets") rec.rollover = e.target.elements.rollover?.checked || false;
      if (editing.type === "salary") rec.gross = ["basic","houseRent","medical","conveyance","bonus","other"].reduce((s,k)=>s+num(rec[k]),0);
      const numericKeys = ["amount","taxableAmount","basic","houseRent","medical","conveyance","bonus","other","pfEmployee","pfEmployer","tds","currentValue","balance","rate","principal","taxableProfit","taxDeducted","profitRate","target","current","monthlyContribution","fundingAmount","interval","dayOfMonth","monthlyLimit"];
      numericKeys.forEach(k => { if (rec[k] !== undefined && rec[k] !== "") rec[k] = num(rec[k]); });
      if (editing.type === "investments" && rec.type === "provident_fund" && !editing.id) {
        addProvidentFundLedgerEntry(rec);
        normalizeInvestmentFunding(state);
        syncInvestmentFundingRecords(state);
        syncLinksFromDocuments();
        save();
        closeDrawer();
        renderNav();
        render();
        return;
      }
      if (editing.id) {
        const idx = state[editing.type].findIndex(r => r.id === editing.id);
        state[editing.type][idx] = Object.assign({}, state[editing.type][idx], rec);
        if (editing.type === "investments") {
          state.investments = consolidateProvidentFundRecords(state.investments || []);
          normalizeInvestmentFunding(state);
          syncInvestmentFundingRecords(state);
        }
      } else {
        state[editing.type].push(Object.assign({ id: id(), createdAt: new Date().toISOString() }, rec));
        if (editing.type === "investments") {
          normalizeInvestmentFunding(state);
          syncInvestmentFundingRecords(state);
        }
      }
      if (editing.type === "budgets" && !editing.id && rec.category) {
        const dup = (state.budgets || []).find(b => b.category === rec.category && !b.archivedAt);
        if (dup) dup.archivedAt = today;
      }
      if (editing.type === "recurringRules") {
        if (!editing.id) rec.generatedTxIds = [];
        if (rec.endDate === "") rec.endDate = null;
      }
      if (editing.type === "salary") {
        const savedRow = editing.id
          ? state.salary.find(r => r.id === editing.id)
          : state.salary[state.salary.length - 1];
        if (savedRow) {
          syncSalaryTransaction(savedRow);
          syncPfLedgerFromSalary(savedRow);
        }
      }
      if (editing.type === "taxPayments") {
        const savedPayment = editing.id
          ? state.taxPayments.find(r => r.id === editing.id)
          : state.taxPayments[state.taxPayments.length - 1];
        if (savedPayment) syncTaxPaymentTransaction(savedPayment);
      }
      syncLinksFromDocuments();
      save();
      closeDrawer();
      renderNav();
      render();
    }

    function addProvidentFundLedgerEntry(rec) {
      state.investments = consolidateProvidentFundRecords(state.investments || []);
      let pf = (state.investments || []).find(i => i.type === "provident_fund");
      if (!pf) {
        pf = {
          id: id(),
          name: "Provident Fund Balance",
          type: "provident_fund",
          institution: rec.institution || "BIFPCL",
          principal: 0,
          currentValue: 0,
          taxableProfit: 0,
          taxDeducted: 0,
          startDate: rec.startDate || today,
          rebateEligible: true,
          pfLedger: []
        };
        state.investments.push(pf);
      }
      pf.pfLedger = Array.isArray(pf.pfLedger) ? pf.pfLedger : [];
      pf.pfLedger.push({
        id: id(),
        date: rec.startDate || today,
        name: rec.name || `PF entry ${taxYearForDate(rec.startDate || today)}`,
        principal: num(rec.principal),
        currentValue: num(rec.currentValue || rec.principal),
        taxableProfit: num(rec.taxableProfit),
        taxDeducted: num(rec.taxDeducted),
        notes: rec.notes || ""
      });
      pf.institution = rec.institution || pf.institution;
      pf.documentId = rec.documentId || pf.documentId || "";
      recalcProvidentFund(pf);
    }

    function recalcProvidentFund(pf) {
      const ledger = Array.isArray(pf.pfLedger) ? pf.pfLedger : [];
      pf.principal = ledger.reduce((sum, e) => sum + num(e.principal), 0);
      pf.currentValue = ledger.reduce((sum, e) => sum + num(e.currentValue || e.principal), 0);
      pf.taxableProfit = ledger.reduce((sum, e) => sum + num(e.taxableProfit), 0);
      pf.taxDeducted = ledger.reduce((sum, e) => sum + num(e.taxDeducted), 0);
      pf.startDate = ledger[0]?.date || pf.startDate || today;
      pf.rebateEligible = true;
      pf.pfLedger = ledger.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    }

    function saveProvidentFundEntry(e) {
      e.preventDefault();
      const pf = (state?.investments || []).find(i => i.id === editing.parentId && i.type === "provident_fund");
      const entry = pf?.pfLedger?.find(row => row.id === editing.id);
      if (!pf || !entry) return;
      const form = new FormData(e.target);
      entry.name = form.get("name") || "PF entry";
      entry.date = form.get("date") || today;
      entry.principal = num(form.get("principal"));
      entry.currentValue = num(form.get("currentValue"));
      entry.taxableProfit = num(form.get("taxableProfit"));
      entry.taxDeducted = num(form.get("taxDeducted"));
      entry.notes = form.get("notes") || "";
      recalcProvidentFund(pf);
      save();
      closeDrawer();
      renderNav();
      render();
    }

    async function deleteProvidentFundEntry(investmentId, entryId) {
      const pf = (state?.investments || []).find(i => i.id === investmentId && i.type === "provident_fund");
      if (!pf || !Array.isArray(pf.pfLedger)) return;
      const entry = pf.pfLedger.find(row => row.id === entryId);
      if (!entry) return;
      const ok = await showAppConfirm("Delete PF entry?", `Delete PF entry "${entry.name || entry.date || "PF entry"}"?\n\nThe provident fund balance, gain, and source tax totals will be recalculated immediately.`, { confirmLabel: "Delete", danger: true });
      if (!ok) return;
      pf.pfLedger = pf.pfLedger.filter(row => row.id !== entryId);
      recalcProvidentFund(pf);
      save();
      renderNav();
      render();
    }

    function saveInvestmentSettlement(e) {
      e.preventDefault();
      const inv = (state?.investments || []).find(i => i.id === editing.id);
      if (!inv) return;
      const form = new FormData(e.target);
      const status = form.get("status") || "matured";
      const withdrawalDate = form.get("withdrawalDate") || today;
      const withdrawalAccountId = form.get("withdrawalAccountId") || "";
      const principalReturned = num(form.get("principalReturned"));
      const taxableProfit = num(form.get("taxableProfit"));
      const taxDeducted = num(form.get("taxDeducted"));
      const settlementNotes = form.get("settlementNotes") || "";
      const profitTaxMethod = form.get("profitTaxMethod") || inv.profitTaxMethod || defaultProfitTaxMethod(inv.type);
      const grossProceeds = principalReturned + taxableProfit;
      const netProceeds = Math.max(0, grossProceeds - taxDeducted);

      inv.status = status;
      inv.withdrawalDate = withdrawalDate;
      inv.withdrawalAccountId = withdrawalAccountId;
      inv.principalReturned = principalReturned;
      inv.taxableProfit = taxableProfit;
      inv.taxDeducted = taxDeducted;
      inv.profitTaxMethod = profitTaxMethod;
      inv.withdrawalGrossProceeds = grossProceeds;
      inv.withdrawalNetProceeds = netProceeds;
      inv.currentValue = 0;
      inv.settlementNotes = settlementNotes;
      inv.closedAt = new Date().toISOString();

      syncInvestmentSettlement(inv);

      save();
      closeDrawer();
      renderNav();
      render();
    }

    function syncInvestmentSettlement(inv) {
      const existing = (state.transactions || []).find(t => t.sourceType === "investments" && t.sourceId === inv.id && t.generatedKind === "investmentSettlement");

      const transfer = {
        id: existing?.id || id(),
        name: `${inv.status === "withdrawn" ? "Withdrawal" : "Maturity"} proceeds - ${inv.name}`,
        type: "transfer",
        date: inv.withdrawalDate || today,
        amount: num(inv.withdrawalNetProceeds),
        taxableAmount: 0,
        category: "Investment maturity/withdrawal",
        accountId: inv.withdrawalAccountId || "",
        documentId: inv.documentId || "",
        sourceType: "investments",
        sourceId: inv.id,
        generatedKind: "investmentSettlement",
        notes: [
          `Principal returned ${money(inv.principalReturned)}`,
          `Taxable gain ${money(inv.taxableProfit)}`,
          `Source tax ${money(inv.taxDeducted)}`,
          inv.settlementNotes
        ].filter(Boolean).join(" | ")
      };

      if (existing) {
        Object.assign(existing, transfer);
      } else {
        state.transactions.push(transfer);
      }
    }

    function adjustAccountBalance(accountId, delta) {
      if (!accountId || !delta) return;
      const account = (state?.accounts || []).find(a => a.id === accountId);
      if (account) account.balance = num(account.balance) + delta;
    }

    function syncSalaryTransactionsFromMigration(data) {
      const salaryCatName = (data.categories || []).find(c => c.isIncomeSourceOfTruth === "salary")?.name || "Salary";
      (data.salary || []).forEach(salaryRow => {
        if (!salaryRow.id) return;
        const alreadyLinked = (data.transactions || []).some(t =>
          t.sourceType === "salary" && t.sourceId === salaryRow.id && t.generatedKind === "salaryNet"
        );
        if (alreadyLinked) return;

        const net = Number(salaryRow.gross || 0) - Number(salaryRow.tds || 0) - Number(salaryRow.pfEmployee || 0);
        const month = String(salaryRow.date || "").slice(0, 7);

        const adopt = (data.transactions || []).find(t =>
          !t.sourceType && !t.generatedKind &&
          t.type === "income" &&
          t.category === salaryCatName &&
          String(t.date || "").slice(0, 7) === month &&
          Math.abs(Number(t.amount || 0) - net) < 200
        );
        if (adopt) {
          adopt.sourceType = "salary";
          adopt.sourceId = salaryRow.id;
          adopt.generatedKind = "salaryNet";
        }
      });
    }

    function syncSalaryTransaction(salaryRow) {
      if (!salaryRow?.id) return;
      state.transactions = state.transactions || [];

      const salaryCat = (state.categories || []).find(c => c.isIncomeSourceOfTruth === "salary");
      const salaryCatName = salaryCat?.name || "Salary";

      const salaryAccountId = salaryRow.accountId
        || (state.accounts || []).find(a => /salary/i.test(a.name || ""))?.id
        || preferredInvestmentFundingAccount(state)
        || "";

      const net = num(salaryRow.gross) - num(salaryRow.tds) - num(salaryRow.pfEmployee);
      if (net <= 0) return;

      const existing = state.transactions.find(t =>
        t.sourceType === "salary" && t.sourceId === salaryRow.id && t.generatedKind === "salaryNet"
      );

      const txBase = {
        name: `Salary Credit – ${salaryRow.name || salaryRow.date || ""}`,
        type: "income",
        date: salaryRow.date || today,
        amount: net,
        taxableAmount: 0,
        category: salaryCatName,
        accountId: salaryAccountId,
        sourceType: "salary",
        sourceId: salaryRow.id,
        generatedKind: "salaryNet",
        affectsAccount: true,
        cashFlowMode: "cash",
        notes: `Auto-generated: Gross ${money(num(salaryRow.gross))} − PF ${money(num(salaryRow.pfEmployee))} − TDS ${money(num(salaryRow.tds))} = Net ${money(net)}`
      };

      if (existing) {
        Object.assign(existing, txBase);
      } else {
        state.transactions.push({ id: id(), createdAt: new Date().toISOString(), ...txBase });
      }
    }

    function syncPfLedgerFromSalary(salaryRow, salaries) {
      state.investments = state.investments || [];
      const pfInv = state.investments.find(i => i.type === "provident_fund");
      if (!pfInv) return;
      rebuildSalaryPfAggregates(pfInv, salaries || state.salary);
    }

    function rebuildSalaryPfAggregates(pfInv, salaries) {
      if (!pfInv || pfInv.type !== "provident_fund") return;
      pfInv.pfLedger = Array.isArray(pfInv.pfLedger) ? pfInv.pfLedger : [];
      salaries = salaries || state?.salary || [];

      const manualEntries = pfInv.pfLedger.filter(e =>
        e.sourceType !== 'salaryAggregate' && !e.sourceId
      );

      const byYear = {};
      salaries.forEach(s => {
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
          id: id(),
          sourceType: 'salaryAggregate',
          sourceYear: fy,
          date: info.lastDate || (taxYearDates(fy)?.end || today),
          name: `PF contributions – AY ${fy} (from salary)`,
          principal: info.total,
          currentValue: info.total,
          taxableProfit: 0,
          taxDeducted: 0,
          notes: `Aggregated employee + employer PF from salary records for AY ${fy}.`
        };
      });

      pfInv.pfLedger = [...manualEntries, ...aggregates];
      recalcProvidentFund(pfInv);
    }

    function liabilityCurrentBalance(liabilityId, asOfDate = null) {
      const liability = (state?.liabilities || []).find(l => l.id === liabilityId);
      if (!liability) return 0;
      const opening = num(liability.balance || liability.amount);
      const repayments = (state?.transactions || [])
        .filter(t =>
          t.linkedLiabilityId === liabilityId &&
          t.type === "expense" &&
          (!asOfDate || t.date <= asOfDate)
        )
        .reduce((sum, t) => sum + num(t.amount), 0);
      return Math.max(0, opening - repayments);
    }

    function accruedValue(inv, asOfDate = null) {
      if (!inv) return 0;
      if (inv.status === "withdrawn" || inv.status === "matured") return num(inv.currentValue || inv.principal);
      if (inv.type === "provident_fund") return num(inv.currentValue || inv.principal);
      if (!["savings_certificate", "dps", "fdr"].includes(inv.type)) return num(inv.currentValue || inv.principal);

      const principal = num(inv.principal);
      const profitRate = num(inv.profitRate);
      if (!profitRate || !principal) return num(inv.currentValue || principal);

      const startDate = parseDate(inv.startDate);
      const asOf = asOfDate ? parseDate(asOfDate) : new Date();
      if (!startDate || !asOf || asOf < startDate) return num(inv.currentValue || principal);

      const daysElapsed = Math.floor((asOf - startDate) / 86400000);
      return Math.round(principal * (1 + (profitRate / 100) * (daysElapsed / 365)));
    }

    function syncTaxPaymentTransaction(payment) {
      if (!payment?.id || !payment.accountId || !num(payment.amount)) return;
      if (payment.type === "refund") return;

      state.transactions = state.transactions || [];
      const existing = state.transactions.find(t =>
        t.sourceType === "taxPayments" && t.sourceId === payment.id && t.generatedKind === "taxPaymentOutflow"
      );
      const txBase = {
        name: `Tax payment – ${payment.name || payment.type || ""}`,
        type: "expense",
        date: payment.date || today,
        amount: num(payment.amount),
        taxableAmount: 0,
        category: "Tax/fees",
        accountId: payment.accountId,
        sourceType: "taxPayments",
        sourceId: payment.id,
        generatedKind: "taxPaymentOutflow",
        affectsAccount: true,
        cashFlowMode: "cash",
        notes: `Auto-generated tax payment outflow. ${payment.notes || ""}`.trim()
      };
      if (existing) {
        Object.assign(existing, txBase);
      } else {
        state.transactions.push({ id: id(), createdAt: new Date().toISOString(), ...txBase });
      }
    }

    function liabilitiesView(search) {
      const period = taxPeriod();
      const periodEnd = period.end;
      let rows = filterRows(state.liabilities || [], search);
      rows = rows.filter(l => !l.openedDate || l.openedDate <= periodEnd);

      const totalOutstanding = rows.reduce((s, l) => s + liabilityCurrentBalance(l.id, periodEnd), 0);
      const upcomingDue = rows.filter(l => l.dueDate && l.dueDate >= today).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
      const nextDue = upcomingDue[0];
      const d = derive();
      const debtToAsset = d.assets > 0 ? ((totalOutstanding / d.assets) * 100).toFixed(1) : "0.0";

      return `
        ${recordTabs("liabilities")}
        <div class="grid kpis" style="margin-bottom:14px;">
          ${kpi("Total Outstanding", totalOutstanding, `${rows.length} liabilities`, totalOutstanding === 0)}
          ${kpi("Debt-to-Asset", debtToAsset + "%", "Outstanding ÷ total assets", Number(debtToAsset) < 30)}
          ${kpi("Next due date", nextDue ? nextDue.dueDate : "None upcoming", nextDue ? nextDue.name : "All clear", !nextDue || nextDue.dueDate > today)}
          ${kpi("Paid-off count", rows.filter(l => liabilityCurrentBalance(l.id, periodEnd) === 0).length, "Liabilities at zero balance", true)}
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Active &amp; past obligations</h2><button class="primary" data-add="liabilities">+ Add Liability</button></div>
          <div class="panel-body" style="padding:0;">
            ${rows.length ? `<table class="data-table"><thead><tr><th class="col-main">Name</th><th class="col-type">Type</th><th class="col-num">Outstanding Balance</th><th class="col-date">Due date</th><th class="col-link">Source</th><th class="col-act"></th></tr></thead><tbody>${rows.map(r => `<tr><td class="col-main"><strong>${escapeHtml(r.name)}</strong></td><td class="col-type"><span class="tchip other">${escapeHtml(String(r.type || "loan").replace(/_/g, " "))}</span></td><td class="amount col-num negative">${money(liabilityCurrentBalance(r.id, periodEnd))}</td><td class="col-date">${r.dueDate || "—"}</td><td class="col-link"><span class="link-pill">${escapeHtml(linkText(r))}</span></td>${rowActions("liabilities", r.id)}</tr>`).join("")}</tbody></table>` : `<div style="padding:16px;">${empty("liabilities")}</div>`}
          </div>
        </div>`;
    }

    async function deleteRecord(type, recId) {
      const rec = state[type].find(r => r.id === recId);
      if (!rec) return;
      if (type === "budgets") {
        const ok = await showAppConfirm("Archive budget?", `Archive budget "${rec.category}"? Past months remain comparable; the budget stops tracking going forward.`, { confirmLabel: "Archive", danger: true });
        if (!ok) return;
        pushHistory();
        rec.archivedAt = today;
        save(); renderNav(); render();
        return;
      }
      if (type === "recurringRules") {
        const genTx = (state.transactions || []).filter(t => t.sourceType === "recurring" && t.sourceId === recId);
        let cascadeMsg = "";
        if (genTx.length && state.settings.cascadePolicy === "deleteGenerated") {
          cascadeMsg = `\n\n${genTx.length} already-generated transaction(s) will also be removed.`;
        }
        const ok = await showAppConfirm("Delete recurring rule?", `Delete recurring rule "${rec.name}"?\nFuture generations stop.${cascadeMsg}`, { confirmLabel: "Delete", danger: true });
        if (!ok) return;
        pushHistory();
        if (genTx.length && state.settings.cascadePolicy === "deleteGenerated") {
          state.transactions = state.transactions.filter(t => !(t.sourceType === "recurring" && t.sourceId === recId));
        } else {
          genTx.forEach(t => { delete t.sourceType; delete t.sourceId; delete t.generatedKind; });
        }
        state.recurringRules = state.recurringRules.filter(r => r.id !== recId);
        save(); renderNav(); render();
        return;
      }
      const generatedTx = state.transactions.filter(t => t.sourceType === type && t.sourceId === recId).length;
      const ok = await showAppConfirm("Delete record?", `Delete "${rec.name || rec.type}"?${generatedTx ? `\n\nLinked auto-generated transactions: ${generatedTx}` : ""}`, { confirmLabel: "Delete", danger: true });
      if (!ok) return;
      pushHistory();
      if (type === "transactions" && rec.generatedKind === "assetTransfer") {
        const asset = (state?.assets || []).find(a => a.id === rec.sourceId);
        if (asset && Array.isArray(asset.transfers)) {
          asset.transfers = asset.transfers.filter(t => t.id !== rec.transferId);
        }
      }
      state[type] = state[type].filter(r => r.id !== recId);
      if (state.settings.cascadePolicy === "deleteGenerated") {
        state.transactions = state.transactions.filter(t => !(t.sourceType === type && t.sourceId === recId));
      } else {
        state.transactions.forEach(t => {
          if (t.sourceType === type && t.sourceId === recId) {
            delete t.sourceType;
            delete t.sourceId;
          }
        });
      }
      (state.documents || []).forEach(d => {
        if (d.linkedType === type && d.linkedId === recId) {
          d.linkedType = "";
          d.linkedId = "";
        }
      });
      if (type === "salary") {
        (state.investments || []).forEach(inv => {
          if (inv.type !== "provident_fund") return;
          rebuildSalaryPfAggregates(inv, state.salary);
        });
      }
      save();
      renderNav();
      render();
    }

    function syncLinksFromDocuments() {
      (state?.documents || []).forEach(doc => {
        if (!doc.linkedType || !doc.linkedId || !state[doc.linkedType]) return;
        const target = state[doc.linkedType].find(r => r.id === doc.linkedId);
        if (target) target.documentId = doc.id;
      });
    }

    function updateBrand() {
      const el = q("brandSubtitle");
      if (el) el.textContent = state?.settings?.brandSubtitle || "Personal finance core";
      document.title = "Personal Finance OS" + (state?.settings?.owner ? " - " + state.settings.owner : "");
    }

    async function advanceTaxYear() {
      const current = state.settings.taxYear || currentTaxYear();
      const ay = parseInt(current.split("-")[0]);
      const newLabel = `${ay + 1}-${String(ay + 2).slice(-2)}`;
      const newDates = taxYearDates(newLabel);
      const ok = await showAppConfirm(
        `Advance to AY ${newLabel}?`,
        `This will:\n• Switch the active assessment year to ${newLabel}\n• Create opening balance memo snapshots for each account\n• Seed tax slabs and deduction rules for ${newLabel}\n• Preserve all historical records intact.`,
        { confirmLabel: `Advance to ${newLabel}` }
      );
      if (!ok) return;

      pushHistory();

      const closingEnd = state.settings.incomeYearEnd || taxYearDates(current).end;
      const snapDate = newDates.start;
      (state.accounts || []).forEach(account => {
        const closingBal = accountCurrentBalance(account.id, closingEnd);
        if (!closingBal) return;
        const alreadyHasSnap = (state.transactions || []).some(t =>
          t.accountId === account.id && t._snapshotYear === current);
        if (!alreadyHasSnap) {
          state.transactions = state.transactions || [];
          state.transactions.push({
            id: id(),
            name: `Opening balance snapshot – ${newLabel}`,
            type: "income",
            date: snapDate,
            amount: 0,
            taxableAmount: 0,
            category: "Opening balance memo",
            accountId: account.id,
            affectsAccount: false,
            cashFlowMode: "memo",
            _snapshotYear: current,
            notes: `Auto-snapshot: closing balance ${money(closingBal)} at end of ${current}.`
          });
        }
      });

      captureSnapshot(closingEnd);

      state.settings.yearlyTaxSlabs = state.settings.yearlyTaxSlabs || {};
      if (!state.settings.yearlyTaxSlabs[newLabel]) {
        state.settings.yearlyTaxSlabs[newLabel] = JSON.parse(JSON.stringify(
          state.settings.yearlyTaxSlabs[current] || state.settings.taxSlabs || []
        ));
      }
      state.settings.yearlyTaxRules = state.settings.yearlyTaxRules || {};
      if (!state.settings.yearlyTaxRules[newLabel]) {
        const currentRules = getTaxRulesForYear(current);
        state.settings.yearlyTaxRules[newLabel] = JSON.parse(JSON.stringify(currentRules));
      }

      state.settings.taxYear = newLabel;
      state.settings.incomeYearStart = newDates.start;
      state.settings.incomeYearEnd = newDates.end;

      save();
      renderNav();
      render();
      showUndoToast(`Advanced to ${newLabel}`);
    }

    /* ── DATA IMPORT / EXPORT / PORTABLE SAVE ── */
    function exportAll() {
      download("personal-finance-os-backup.json", JSON.stringify(state, null, 2));
    }

    function importAll() {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json";
      input.onchange = () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const parsed = JSON.parse(reader.result);
            const isPartial = Array.isArray(parsed) || (!parsed.settings && !parsed.categories && !parsed.accounts);

            pushHistory();
            if (isPartial) {
              const mergeTable = (key, dataArray) => {
                if (!state[key]) state[key] = [];
                const existingIds = new Set(state[key].map(item => item.id));
                let added = 0;
                dataArray.forEach(item => {
                  if (!item.id) item.id = id();
                  if (!existingIds.has(item.id)) {
                    state[key].push(item);
                    added++;
                  }
                });
                return added;
              };

              if (Array.isArray(parsed)) {
                let targetKey = "transactions";
                if (parsed.length > 0) {
                  const sample = parsed[0];
                  if ("basic" in sample || "pfEmployee" in sample) targetKey = "salary";
                  else if ("target" in sample) targetKey = "goals";
                }
                const count = mergeTable(targetKey, parsed);
                showAppNotice("Partial import complete", `Successfully merged ${count} record(s) into "${targetKey}".`);
              } else {
                let mergedLogs = [];
                for (const key of Object.keys(parsed)) {
                  if (Array.isArray(parsed[key]) && state[key] !== undefined) {
                    const count = mergeTable(key, parsed[key]);
                    if (count > 0) mergedLogs.push(`${count} into "${key}"`);
                  }
                }
                if (mergedLogs.length > 0) {
                  showAppNotice("Partial import complete", `Successfully merged ${mergedLogs.join(", ")}.`);
                } else {
                  showAppNotice("No new records", "All records in the selected file were already present.");
                }
              }
            } else {
              state = mergeDefaults(parsed);
              showAppNotice("System restore complete", "Full finance dataset restored successfully.");
            }
            save();
            renderNav();
            render();
          } catch (err) {
            console.error("Import failed:", err);
            showAppNotice("Import failed", "Could not parse the selected JSON file.");
          }
        };
        reader.readAsText(file);
      };
      input.click();
    }

    function downloadPortableHtml() {
      const cleanHtml = getCleanPortableHtml();
      const blob = new Blob([cleanHtml], { type: "text/html" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const pad = n => String(n).padStart(2, "0");
      const d = new Date();
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      a.download = `finance_os_portable-${stamp}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);

      historyStack = [];
      updateUndoButton();
    }

    function getCleanPortableHtml() {
      const clone = document.documentElement.cloneNode(true);
      clone.removeAttribute("data-finance-sync-status");
      clone.removeAttribute("data-finance-native-host");
      clone.removeAttribute("data-privacy");
      clone.querySelector('.app')?.removeAttribute('inert');
      clone.querySelector('#mobileNav')?.removeAttribute('inert');
      clone.querySelector('#moduleMenu')?.removeAttribute('open');
      clone.querySelector('#appModal')?.removeAttribute('open');
      clone.querySelector('#workspaceActions')?.removeAttribute('open');
      clone.querySelector('#taxYearMenu')?.classList.remove('open');
      clone.querySelector('#periodBadge')?.setAttribute('aria-expanded', 'false');
      clone.querySelector('#nativeSyncWrap')?.setAttribute('hidden', '');
      clone.querySelector('#pinLockOverlay')?.setAttribute('hidden', '');
      clone.querySelectorAll('.native-only-item').forEach(node => node.setAttribute('hidden', ''));
      clone.querySelectorAll('.browser-only-item').forEach(node => node.removeAttribute('hidden'));
      clone.querySelectorAll('.undo-toast').forEach(node => node.remove());
      clone.querySelector("#financeNativeBridge")?.remove();

      const undoBtn = clone.querySelector("#undoBtn");
      if (undoBtn) undoBtn.remove();

      const saveBtn = clone.querySelector("#savePortableBtn");
      if (saveBtn) saveBtn.classList.remove("dirty");

      const overwriteBtn = clone.querySelector("#overwriteFileBtn");
      if (overwriteBtn) { overwriteBtn.classList.remove("linked"); overwriteBtn.textContent = "Link / save file"; }

      const embedded = clone.querySelector("#embeddedState");
      if (embedded) {
        embedded.textContent = JSON.stringify(state, null, 2).replace(/</g, "\\u003c");
      }

      const view = clone.querySelector("#view");
      if (view) view.innerHTML = "";

      const nav = clone.querySelector("#nav");
      if (nav) nav.innerHTML = "";

      const mobileNav = clone.querySelector("#mobileNav");
      if (mobileNav) mobileNav.innerHTML = "";

      const drawer = clone.querySelector("#drawer");
      if (drawer) {
        drawer.classList.remove("open");
        drawer.setAttribute("aria-hidden", "true");
      }

      const drawerBody = clone.querySelector("#drawerBody");
      if (drawerBody) drawerBody.innerHTML = "";

      return "<!DOCTYPE html>\n" + clone.outerHTML;
    }

    function download(name, text) {
      const blob = new Blob([text], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    function seedData() {
      pushHistory();
      const bank = state.accounts[1]?.id || "id_acc_default_2";
      state.transactions.push(
        { id: id(), name: "Monthly salary deposit", type: "income", date: today, amount: 120000, category: "Salary", taxableAmount: 120000, accountId: bank },
        { id: id(), name: "Rent", type: "expense", date: today, amount: 30000, category: "Rent/Home", accountId: bank },
        { id: id(), name: "Groceries", type: "expense", date: today, amount: 12000, category: "Food/Groceries", accountId: bank }
      );
      state.salary.push({ id: id(), name: "Current salary month", date: today, basic: 65000, houseRent: 32500, medical: 10000, conveyance: 5000, bonus: 0, other: 7500, pfEmployee: 6000, pfEmployer: 6000, gross: 126000, tds: 9000 });
      state.investments.push({ id: id(), name: "5-year savings certificate", type: "savings_certificate", institution: "National Savings", principal: 500000, currentValue: 520000, taxableProfit: 20000, taxDeducted: 2000, profitRate: 11, startDate: today, maturityDate: "2031-06-04", rebateEligible: true });
      state.goals.push({ id: id(), name: "Emergency fund", type: "emergency_fund", target: 600000, current: 150000, monthlyContribution: 25000, targetDate: "2027-06-30" });
      save();
      renderNav();
      render();
      showUndoToast("Sample data loaded");
    }

    async function resetData() {
      const ok = await showAppConfirm(
        "Reset all data?",
        "Reset all data and start fresh? This clears every record on this device.",
        { confirmLabel: "Reset everything", danger: true }
      );
      if (!ok) return;
      state = migrateState(safeClone(SEED_DATA));
      save();
      setView("home");
    }
