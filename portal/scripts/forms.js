    function bindViewEvents() {
      document.querySelectorAll("[data-add]").forEach(btn => btn.onclick = () => {
        let presets = null;
        if (btn.dataset.presets) {
          try { presets = JSON.parse(btn.dataset.presets); } catch(e) { console.error(e); }
        }
        openForm(btn.dataset.add, null, presets);
      });
      if (q("quickAddSalaryBtn")) q("quickAddSalaryBtn").onclick = quickAddLastMonthSalary;

      // ── Row kebab (⋯) menu ──
      // The menu is position:fixed and placed via viewport coords computed
      // from the button's getBoundingClientRect(). This makes it immune to
      // being clipped by ANY ancestor's overflow (panel overflow:hidden,
      // #view overflow:auto, the PF-ledger scroll-box, the settings lists,
      // table cells, etc.). Both axes are clamped so the menu never runs off
      // the right edge or the bottom of the viewport, and it flips above the
      // button when there isn't room below (last rows of any list).
      const closeAllRowMenus = () => {
        document.querySelectorAll(".row-menu.open").forEach(m => {
          m.classList.remove("open");
          m.style.left = ""; m.style.top = ""; m.style.right = ""; m.style.bottom = "";
        });
      };
      const placeRowMenu = (menu, btn) => {
        const rect = btn.getBoundingClientRect();
        const margin = 4;     // gap from button
        const vwMin = 8;      // left-most the menu edge may si
        const vwMax = window.innerWidth - 8;
        const vhMax = window.innerHeight - 8;
        // Show offscreen so we can measure real width/height first.
        menu.style.left = "-9999px";
        menu.style.top = "-9999px";
        menu.style.right = "";
        menu.style.bottom = "";
        // Force a layout flush before reading dimensions.
        const w = menu.offsetWidth;
        const h = menu.offsetHeight;
        // Horizontal: align to the button's right edge, but slide left if i
        // would overflow the viewport. Never let it cross the left margin.
        let left = rect.right - w;
        if (left < vwMin) left = vwMin;
        if (left + w > vwMax) left = vwMax - w;
        if (left < vwMin) left = vwMin;
        // Vertical: open below by default; flip above if no room below AND
        // there's room above (handles the last row of every list).
        const spaceBelow = vhMax - rect.bottom;
        const spaceAbove = rect.top - margin;
        const openBelow = spaceBelow >= h + margin || spaceBelow >= spaceAbove;
        const top = openBelow ? rect.bottom + margin : rect.top - h - margin;
        menu.style.left = Math.max(vwMin, Math.min(left, vwMax - w)) + "px";
        menu.style.top = Math.max(margin, Math.min(top, vhMax - h)) + "px";
      };
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
      // Outside-click / Escape closes any open row menu (attached once).
      if (!window._rowMenuGlobalWired) {
        window._rowMenuGlobalWired = true;
        document.addEventListener("click", closeAllRowMenus);
        document.addEventListener("keydown", e => {
          if (e.key === "Escape") closeAllRowMenus();
        });
        // If the page scrolls or the window resizes, an open menu would floa
        // away from its row — close it rather than let it drift.
        const dismissOnScroll = () => closeAllRowMenus();
        window.addEventListener("resize", dismissOnScroll);
        window.addEventListener("scroll", dismissOnScroll, true); // capture: catch nested scrollers (#view, PF box, settings lists)
      }

      // ── Investment row toggle (one-open-at-a-time) ──
      // Each .inv-row can be expanded/collapsed by clicking the row. The
      // detail box is always in the DOM (hidden via display:none); toggling
      // adds/removes .open on the row to reveal it. Only one row open at a
      // time — opening a new one auto-closes the previous. Kebab clicks are
      // already stopPropagation'd above, so they open the menu without toggling.
      document.querySelectorAll("[data-inv-row]").forEach(row => {
        row.addEventListener("click", (e) => {
          // Don't toggle if clicking inside the detail-box (user may be
          // clicking chips, links, or PF ledger actions inside it).
          if (e.target.closest(".inv-detail-box")) return;
          // Don't toggle if clicking the kebab (already isolated, but belt-and-suspenders).
          if (e.target.closest(".row-menu-wrap")) return;
          const wasOpen = row.classList.contains("open");
          // Close all sibling rows in the same container.
          const container = row.closest(".inv-rows");
          if (container) container.querySelectorAll(".inv-row.open").forEach(r => r.classList.remove("open"));
          if (!wasOpen) row.classList.add("open");
        });
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
      // ── Phase 2: convert an existing transaction into a recurring rule ──
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
        showUndoToast ? showUndoToast(`"${rule.name}" is now recurring — next: ${rule.nextDate}`) : alert(`"${rule.name}" is now recurring — next: ${rule.nextDate}`);
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
      // ── Phase 2: Transactions ↔ Automation sub-tab switch ──
      document.querySelectorAll("[data-txview]").forEach(btn => btn.onclick = () => {
        state.settings.transactionViewTab = btn.dataset.txview;
        persistViewOnly();
        render();
      });
      // ── Phase 4: Goals ↔ Forecast tab switch inside Planning ──
      document.querySelectorAll("[data-planningtab]").forEach(btn => btn.onclick = () => {
        state.settings.planningTab = btn.dataset.planningtab;
        persistViewOnly();
        render();
      });
      // ── Phase 2: pause/resume a recurring rule ──
      document.querySelectorAll("[data-toggle-recurring]").forEach(btn => btn.onclick = () => {
        const rule = (state.recurringRules || []).find(r => r.id === btn.dataset.toggleRecurring);
        if (!rule) return;
        pushHistory();
        rule.active = !rule.active;
        save(); render();
      });
      // ── Phase 3: budget month stepper ──
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
        save(); render();
      });
      // ── Phase 4: forecast assumption controls ──
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
          save();
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
        alert(`Backfill complete: ${res.added} month-end snapshot${res.added === 1 ? "" : "s"} added.\nTotal snapshots: ${(state.netWorthSnapshots || []).length}.`);
        render();
      };
      if (q("addCatBtn")) q("addCatBtn").onclick = () => {
        const name = q("newCatName")?.value?.trim(); const type = q("newCatType")?.value;
        if (!name) return;
        pushHistory(); // ── FIX: was missing undo coverage
        state.categories.push({ id: id(), type, name });
        save(); render();
      };
      document.querySelectorAll("[data-del-cat]").forEach(btn => btn.onclick = () => {
        const catToDelete = state.categories.find(c => c.id === btn.dataset.delCat);
        if (catToDelete?._system) { alert("System categories cannot be deleted. They are required for auto-generated transactions."); return; }
        if (catToDelete?.isIncomeSourceOfTruth) {
          if (!confirm(`"${catToDelete.name}" is used by the tax engine to classify income. Deleting it will affect tax calculations. Continue?`)) return;
        }
        pushHistory();
        state.categories = state.categories.filter(c => c.id !== btn.dataset.delCat);
        save(); render();
      });
      if (q("addAccBtn")) q("addAccBtn").onclick = () => {
        const name = q("newAccName")?.value?.trim(); const type = q("newAccType")?.value;
        const balance = num(q("newAccBalance")?.value);
        if (!name) return;
        pushHistory(); // ── FIX: was missing undo coverage
        state.accounts.push({ id: id(), name, type, balance, active: true });
        save(); render();
      };
      document.querySelectorAll("[data-del-acc]").forEach(btn => btn.onclick = () => {
        pushHistory(); // ── FIX: was missing undo coverage
        state.accounts = state.accounts.filter(a => a.id !== btn.dataset.delAcc);
        save(); render();
      });
      document.querySelectorAll("[data-edit-acc-bal]").forEach(btn => btn.onclick = () => {
        const accId = btn.dataset.editAccBal;
        const account = state.accounts.find(a => a.id === accId);
        if (!account) return;
        const newValStr = prompt(`Enter new starting balance for "${account.name}":`, account.balance);
        if (newValStr === null) return;
        const newVal = num(newValStr);
        pushHistory(); // ── FIX: was missing undo coverage
        account.balance = newVal;
        save(); render();
      });
      if (q("addSlabBtn")) q("addSlabBtn").onclick = () => {
        pushHistory(); // ── FIX: was missing undo coverage
        const threshold = num(q("newSlabThreshold")?.value); const rate = num(q("newSlabRate")?.value) / 100;
        const slabs = getTaxSlabsForYear(state?.settings?.taxYear);
        slabs.push({ id: id(), threshold, rate }); // id() for stable identity
        save(); render();
      };
      document.querySelectorAll("[data-del-slab]").forEach(btn => btn.onclick = () => {
        pushHistory(); // ── FIX: was missing undo coverage
        const idx = parseInt(btn.dataset.delSlab);
        const slabs = getTaxSlabsForYear(state?.settings?.taxYear);
        slabs.splice(idx, 1);
        save(); render();
      });
      document.querySelectorAll("[data-slab-threshold]").forEach(inp => inp.onchange = () => {
        const idx = parseInt(inp.dataset.slabThreshold);
        const slabs = getTaxSlabsForYear(state?.settings?.taxYear);
        slabs[idx].threshold = num(inp.value);
        save(); render(); // ── FIX: was missing render()
      });
      document.querySelectorAll("[data-slab-rate]").forEach(inp => inp.onchange = () => {
        const idx = parseInt(inp.dataset.slabRate);
        const slabs = getTaxSlabsForYear(state?.settings?.taxYear);
        slabs[idx].rate = num(inp.value) / 100;
        save(); render(); // ── FIX: was missing render()
      });
      if (q("saveDeductionBtn")) q("saveDeductionBtn").onclick = () => {
        pushHistory();
        const newStdDed = { fraction: num(q("stdFraction")?.value), cap: num(q("stdCap")?.value) };
        const newRebate = { rate: num(q("rebateRate")?.value), investmentCapPercent: num(q("rebateCapPct")?.value), maxCapAbsolute: num(q("rebateMaxCap")?.value) };
        // Write to global defaults (used as seed for new years)
        state.settings.standardDeduction = newStdDed;
        state.settings.rebateParams = newRebate;
        // ── FIX: also write to the current year's per-year rule object ──
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
      if (q("transactionSort")) q("transactionSort").onchange = e => {
        state.settings.transactionSort = e.target.value;
        save();
        render();
      };
      if (q("transactionTypeFilter")) q("transactionTypeFilter").onchange = e => {
        state.settings.transactionTypeFilter = e.target.value;
        // Reset the category filter if it no longer belongs to the selected Type
        const validCats = categoriesForTypeFilter(e.target.value);
        const cur = state.settings.transactionCategoryFilter || "";
        if (cur && !validCats.includes(cur)) state.settings.transactionCategoryFilter = "";
        save();
        render();
      };
      if (q("transactionCategoryFilter")) q("transactionCategoryFilter").onchange = e => {
        state.settings.transactionCategoryFilter = e.target.value;
        save();
        render();
      };
      if (q("transactionPeriodFilter")) q("transactionPeriodFilter").onchange = e => {
        state.settings.transactionPeriodFilter = e.target.value;
        save();
        render();
      };
      if (q("expenseSort")) q("expenseSort").onchange = e => {
        state.settings.expenseSort = e.target.value;
        save();
        render();
      };
      if (q("expenseCategoryFilter")) q("expenseCategoryFilter").onchange = e => {
        state.settings.expenseCategoryFilter = e.target.value;
        save();
        render();
      };
      document.querySelectorAll("[data-export-type]").forEach(btn => {
        btn.onclick = () => {
          const type = btn.dataset.exportType;
          if (type === "expenses") {
            const exp = (state.transactions || []).filter(t => t.type === "expense" && withinPeriod(t.date));
            download("expenses.json", JSON.stringify(exp, null, 2));
          } else {
            download(`${type}.json`, JSON.stringify(state[type], null, 2));
          }
        };
      });
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

        summaryEl.innerHTML =
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

      // ── Transfer UI coupling ──
      // When Type = Transfer, "From account" becomes relevant and the Account field
      // is relabeled "To account". For income/expense, "From account" is hidden and
      // Account reverts to its generic label. Runs on type change and once on open
      // so an edited transfer shows the right fields immediately.
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
        alert("No existing salary records to clone. Please add one manually first.");
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

      // Regenerate notes to clear one-time remarks and use template components
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
          ${isEditingSettlemen
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
      const accounts = (state?.accounts || []).map(a => `<option value="${a.id}" ${r.accountId === a.id ? "selected" : ""}>${a.name}</option>`).join("");
      const fundingAccounts = (state?.accounts || []).map(a => `<option value="${a.id}" ${r.fundingAccountId === a.id ? "selected" : ""}>${a.name}</option>`).join("");
      const linkedAccountOptions = `<option value=""${!r.linkedAccountId ? " selected" : ""}>None (manual)</option>` + (state?.accounts || []).map(a => `<option value="${a.id}" ${r.linkedAccountId === a.id ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("");
      const liabilityOptions = `<option value=""${!r.linkedLiabilityId ? " selected" : ""}>None</option>` + (state?.liabilities || []).map(l => `<option value="${l.id}" ${r.linkedLiabilityId === l.id ? "selected" : ""}>${escapeHtml(l.name)}</option>`).join("");
      let fields = "";
      if (type === "transactions") fields =
        ${input("name", "Name", r.name)}${select("type", "Type", r.type, [["income","Income"],["expense","Expense"],["transfer","Transfer"]])}${input("date", "Date", r.date || today, "date")}${input("amount", "Amount", r.amount, "number")}
        ${categorySelect(r.category, r.type || "income")}${selectHtml("fromAccountId", "From account (transfer only)", accounts)}${selectHtml("accountId", "Account", accounts)}${input("taxableAmount", "Taxable amount", r.taxableAmount, "number")}${selectHtml("linkedLiabilityId", "Linked liability (EMI/repayment, optional)", liabilityOptions)}        ${textarea("notes", "Notes", r.notes)}
        ${checkbox("affectsAccount", "Affects account balance", r.affectsAccount !== false, "When checked, this transaction updates the linked account balance and total assets. Uncheck for memo-only records (e.g. amounts already declared elsewhere) that should not move cash.")}`;
      if (type === "salary") fields =
        ${input("name", "Salary month/name", r.name)}${input("date", "Pay date", r.date || today, "date")}${input("basic", "Basic", r.basic, "number")}${input("houseRent", "House rent", r.houseRent, "number")}
        ${input("medical", "Medical", r.medical, "number")}${input("conveyance", "Conveyance", r.conveyance, "number")}${input("bonus", "Bonus/festival", r.bonus, "number")}${input("other", "Other allowance", r.other, "number")}
        ${input("pfEmployee", "Employee PF", r.pfEmployee, "number")}${input("pfEmployer", "Employer PF", r.pfEmployer, "number")}${input("tds", "TDS", r.tds, "number")}${selectHtml("accountId", "Salary deposit account", accounts)}
        ${textarea("notes", "Notes", r.notes)}`;
      if (type === "assets") fields =
        ${input("name", "Name", r.name)}${select("type", "Type", r.type, [["property","Property"],["vehicle","Vehicle"],["gold","Gold"],["receivable","Receivable"],["other","Other"]])}${input("institution", "Institution", r.institution)}${input("amount", "Original amount", r.amount, "number")}
        ${input("currentValue", "Current value", r.currentValue, "number")}${input("acquiredDate", "Acquired date", r.acquiredDate, "date")}${textarea("notes", "Notes", r.notes)}`;
      if (type === "liabilities") fields =
        ${input("name", "Name", r.name)}${select("type", "Type", r.type, [["loan","Loan"],["credit_card","Credit card"],["tax_payable","Tax payable"],["family","Family obligation"],["other","Other"]])}${input("amount", "Original amount", r.amount, "number")}${input("balance", "Current balance", r.balance, "number")}
        ${input("rate", "Interest/profit rate", r.rate, "number")}${input("dueDate", "Next due date", r.dueDate, "date")}${textarea("notes", "Notes", r.notes)}`;
      if (type === "investments") fields =
        ${input("name", "Name", r.name)}${select("type", "Type", r.type, [["savings_certificate","Savings certificate"],["dps","DPS"],["fdr","FDR"],["mutual_fund","Mutual fund"],["provident_fund","Provident fund"],["other","Other"]])}${input("institution", "Institution", r.institution)}${input("principal", "Principal", r.principal, "number")}
        ${input("currentValue", "Current value", r.currentValue, "number")}${input("profitRate", "Profit/rate %", r.profitRate, "number")}
        ${input("startDate", "Start date", r.startDate, "date")}${input("maturityDate", "Maturity date", r.maturityDate, "date")}${checkbox("rebateEligible", "Eligible for tax rebate", r.rebateEligible)}
        ${select("profitTaxMethod", "Profit tax treatment", r.profitTaxMethod || defaultProfitTaxMethod(r.type), [["final","Final tax (source tax = final tax)"],["slab","Slab tax (profit joins slab, source tax = credit)"]])}
        ${select("fundingMode", "Funding source", r.fundingMode || (r.type === "provident_fund" ? "payroll_pf" : "cash_account"), [["cash_account","Paid from cash/bank account"],["payroll_pf","Payroll PF - no cash outflow"],["external_opening","Opening/external asset - no cash outflow"]])}${selectHtml("fundingAccountId", "Funding account", fundingAccounts)}
        ${textarea("notes", "Notes", r.notes)}`;
      if (type === "taxPayments") fields =
        ${input("name", "Name", r.name)}${select("type", "Type", r.type, [["tds","TDS"],["ait","AIT"],["challan","Challan"],["refund","Refund adjustment"],["other","Other"]])}${input("amount", "Amount", r.amount, "number")}${input("date", "Date", r.date || today, "date")}
        ${input("taxYear", "Tax year", r.taxYear || (state?.settings?.taxYear || "2026-27"))}${selectHtml("accountId", "Deduct from account (optional)", accounts)}${textarea("notes", "Notes", r.notes)}`;
      if (type === "goals") fields =
        ${input("name", "Name", r.name)}${select("type", "Type", r.type, [["emergency_fund","Emergency fund"],["tax_planning","Tax planning"],["retirement","Retirement"],["purchase","Big purchase"],["travel","Travel"],["other","Other"]])}${input("target", "Target amount", r.target, "number")}${input("current", "Current saved", r.current, "number")}
        ${input("monthlyContribution", "Monthly contribution", r.monthlyContribution, "number")}${input("targetDate", "Target date", r.targetDate, "date")}${selectHtml("linkedAccountId", "Auto-track from account (optional)", linkedAccountOptions)}${textarea("notes", "Notes", r.notes)}`;
      if (type === "recurringRules") {
        const ruleTypeOpts = [["expense","Expense (payment)"],["income","Income"]];
        const freqOpts = [["monthly","Monthly"],["weekly","Weekly"],["yearly","Yearly"]];
        const domVal = r.dayOfMonth || (r.nextDate ? (() => { const d = parseDate(r.nextDate); return d ? d.getDate() : 5; })() : 5);
        fields =
        ${input("name", "Name", r.name)}${select("type", "Cash direction", r.type || "expense", ruleTypeOpts)}${input("amount", "Amount", r.amount, "number")}${categorySelect(r.category, r.type || "expense")}
        ${selectHtml("accountId", "Account", accounts)}${selectHtml("linkedLiabilityId", "Linked liability (EMI paydown, optional)", liabilityOptions)}
        ${select("frequency", "Frequency", r.frequency || "monthly", freqOpts)}${input("interval", "Every N (interval, 1=every, 3=quarterly)", r.interval || 1, "number")}${input("dayOfMonth", "Day of month (1-31, clamps to month end)", domVal, "number")}
        ${input("nextDate", "Next due date", r.nextDate || today, "date")}${input("startDate", "Start date (optional)", r.startDate, "date")}${input("endDate", "End date (optional, blank=open)", r.endDate, "date")}
        ${checkbox("active", "Active", r.active !== false, "When on, this rule generates transactions on its next due date.")}${textarea("notes", "Notes", r.notes)}`;
      }
      if (type === "budgets") {
        const expCats = (state?.categories || []).filter(c => c.type === "expense");
        const expOpts = expCats.map(c => `<option value="${escapeHtml(c.name)}" ${r.category === c.name ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("");
        fields =
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
        // The "Affects account balance" checkbox is checked by default in the form.
        // Default to true if the control is somehow absent (older drawers) so a
        // recorded transaction always moves money unless the user opts into memo-only.
        const cb = e.target.elements.affectsAccount;
        rec.affectsAccount = cb ? cb.checked : true;
        rec.cashFlowMode = rec.affectsAccount ? "cash" : "memo";
        // ── Tighten add-transaction logic ──
        // If the transaction is flagged to affect the account balance, it MUST be
        // tied to an account — otherwise accountCurrentBalance() silently drops i
        // from every account and the record becomes a no-op with no financial impact.
        if (rec.affectsAccount && !rec.accountId) {
          alert("This transaction is set to affect the account balance, but no account is selected.\n\nPlease choose an account. To record it as memo-only (no cash impact), uncheck \"Affects account balance\".");
          return;
        }
        // ── Real A→B transfers ──
        // A transfer must name both sides of the move and they must differ, so the
        // balance math can debit one account and credit the other. Transfers canno
        // be memo-only: if the user wants a no-op transfer they should uncheck the box.
        if (rec.type === "transfer") {
          if (!rec.fromAccountId || !rec.accountId) {
            alert("A transfer needs both a 'From account' and a 'To account'. Please select both before saving.");
            return;
          }
          if (rec.fromAccountId === rec.accountId) {
            alert("The 'From account' and 'To account' for a transfer must be different.");
            return;
          }
        } else {
          // fromAccountId is only meaningful for transfers; clear it for income/expense
          // so a stale value can't sit unnoticed in a non-transfer record.
          rec.fromAccountId = "";
        }
      }
      if (editing.type === "recurringRules") rec.active = e.target.elements.active?.checked !== false;
      if (editing.type === "budgets") rec.rollover = e.target.elements.rollover?.checked || false;
      if (editing.type === "salary") rec.gross = ["basic","houseRent","medical","conveyance","bonus","other"].reduce((s,k)=>s+num(rec[k]),0);      const numericKeys = ["amount","taxableAmount","basic","houseRent","medical","conveyance","bonus","other","pfEmployee","pfEmployer","tds","currentValue","balance","rate","principal","taxableProfit","taxDeducted","profitRate","target","current","monthlyContribution","fundingAmount","interval","dayOfMonth","monthlyLimit"];
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
      // ── Phase 3: enforce one budget per category on create; archive existing ──
      if (editing.type === "budgets" && !editing.id && rec.category) {
        const dup = (state.budgets || []).find(b => b.category === rec.category && !b.archivedAt);
        if (dup) dup.archivedAt = today;
      }
      // ── Phase 2: new recurring rule starts with empty generatedTxIds; existing
      // rules keep their id so cascade links stay intact. ──
      if (editing.type === "recurringRules") {
        if (!editing.id) rec.generatedTxIds = [];
        // Coerce empty optional dates to null
        if (rec.endDate === "") rec.endDate = null;
      }
      // ── Phase 2.1: sync salary → transaction ──
      if (editing.type === "salary") {
        const savedRow = editing.id
          ? state.salary.find(r => r.id === editing.id)
          : state.salary[state.salary.length - 1];
        if (savedRow) syncSalaryTransaction(savedRow);
      }
      // ── Phase 2.2: sync salary → PF ledger ──
      if (editing.type === "salary") {
        const savedRow = editing.id
          ? state.salary.find(r => r.id === editing.id)
          : state.salary[state.salary.length - 1];
        if (savedRow) syncPfLedgerFromSalary(savedRow);
      }
      // ── Phase 2.6: sync tax payment → account outflow ──
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

    function deleteProvidentFundEntry(investmentId, entryId) {
      const pf = (state?.investments || []).find(i => i.id === investmentId && i.type === "provident_fund");
      if (!pf || !Array.isArray(pf.pfLedger)) return;
      const entry = pf.pfLedger.find(row => row.id === entryId);
      if (!entry) return;
      if (!confirm(`Delete PF entry "${entry.name || entry.date || "PF entry"}"?\n\nThe provident fund balance, gain, and source tax totals will be recalculated immediately.`)) return;
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

      // Update Investment Record - KEEP all tax data intact!
      inv.status = status; // This moves it to 'Historical'
      inv.withdrawalDate = withdrawalDate;
      inv.withdrawalAccountId = withdrawalAccountId;
      inv.principalReturned = principalReturned;
      inv.taxableProfit = taxableProfit; // RETAINED FOR TAX
      inv.taxDeducted = taxDeducted;     // RETAINED FOR TAX
      inv.profitTaxMethod = profitTaxMethod; // User can override at withdrawal
      inv.withdrawalGrossProceeds = grossProceeds;
      inv.withdrawalNetProceeds = netProceeds;
      inv.currentValue = 0; // Value in 'Active' section becomes 0
      inv.settlementNotes = settlementNotes;
      inv.closedAt = new Date().toISOString();

      // Reconcile Funds with Accoun
      syncInvestmentSettlement(inv);

      save();
      closeDrawer();
      renderNav();
      render();
    }

    function syncInvestmentSettlement(inv) {
      // NOTE: We do NOT call adjustAccountBalance() here. Settlement proceeds
      // flow exclusively through the transfer transaction so accountCurrentBalance()
      // counts them exactly once. Calling adjustAccountBalance() would double-count.
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
      // No adjustAccountBalance call — balance is derived from transactions only.
    }

    function adjustAccountBalance(accountId, delta) {
      if (!accountId || !delta) return;
      const account = (state?.accounts || []).find(a => a.id === accountId);
      if (account) account.balance = num(account.balance) + delta;
    }


    // ══════════════════════════════════════════════════════════════════
    // PHASE 2.1 MIGRATION — syncSalaryTransactionsFromMigration
    // Links existing unlinked salary transactions to their salary rows.
    // Called once from migrateState on load.
    // ══════════════════════════════════════════════════════════════════
    function syncSalaryTransactionsFromMigration(data) {
      const salaryCatName = (data.categories || []).find(c => c.isIncomeSourceOfTruth === "salary")?.name || "Salary";
      (data.salary || []).forEach(salaryRow => {
        if (!salaryRow.id) return;
        // Skip if already tagged
        const alreadyLinked = (data.transactions || []).some(t =>
          t.sourceType === "salary" && t.sourceId === salaryRow.id && t.generatedKind === "salaryNet"
        );
        if (alreadyLinked) return;

        const net = Number(salaryRow.gross || 0) - Number(salaryRow.tds || 0) - Number(salaryRow.pfEmployee || 0);
        const month = String(salaryRow.date || "").slice(0, 7);

        // Find an unlinked salary-category transaction for the same month with a close amoun
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

    // ══════════════════════════════════════════════════════════════════
    // PHASE 2.1 — syncSalaryTransaction
    // Creates or updates a salary-net income transaction for a salary row.
    // ══════════════════════════════════════════════════════════════════
    function syncSalaryTransaction(salaryRow) {
      if (!salaryRow?.id) return;
      state.transactions = state.transactions || [];

      const salaryCat = (state.categories || []).find(c => c.isIncomeSourceOfTruth === "salary");
      const salaryCatName = salaryCat?.name || "Salary";

      // Find preferred salary deposit accoun
      const salaryAccountId = salaryRow.accountId
        || (state.accounts || []).find(a => /salary/i.test(a.name || ""))?.id
        || preferredInvestmentFundingAccount(state)
        || "";

      const net = num(salaryRow.gross) - num(salaryRow.tds) - num(salaryRow.pfEmployee);
      if (net <= 0) return;

      // Find existing generated transaction
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
        notes: `Auto-generated: Gross ${money(num(salaryRow.gross))} − PF ${money(num(salaryRow.pfEmployee))} − TDS ${money(num(salaryRow.tds))} = Net ${money(net)}
      };

      if (existing) {
        Object.assign(existing, txBase);
      } else {
        state.transactions.push({ id: id(), createdAt: new Date().toISOString(), ...txBase });
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // PHASE 2.2 — PF ledger aggregation
    // Instead of one ledger entry per salary month, all salary-driven PF
    // contributions for a financial year are merged into a SINGLE aggregate
    // entry. Manual entries (no salary linkage — e.g. the year-end interes
    // you enter later, or historical opening balances) are always preserved
    // as their own separate list items.
    // ══════════════════════════════════════════════════════════════════
    function syncPfLedgerFromSalary(salaryRow, salaries) {
      // Kept for call-site compatibility — delegates to the full rebuild so
      // any salary add/edit/delete (or copy) refreshes every FY aggregate.
      state.investments = state.investments || [];
      const pfInv = state.investments.find(i => i.type === "provident_fund");
      if (!pfInv) return; // PF fund doesn't exist yet — user must create manually firs
      rebuildSalaryPfAggregates(pfInv, salaries || state.salary);
    }

    function rebuildSalaryPfAggregates(pfInv, salaries) {
      if (!pfInv || pfInv.type !== "provident_fund") return;
      pfInv.pfLedger = Array.isArray(pfInv.pfLedger) ? pfInv.pfLedger : [];
      salaries = salaries || state?.salary || [];

      // Keep ONLY manual entries: those with no salary linkage at all. This
      // protects the year-end interest entry and opening balances. We drop
      // every salary-derived row — both the new aggregate forma
      // (sourceType === 'salaryAggregate') and the legacy per-month forma
      // (any entry still carrying a sourceId) — then rebuild from scratch.
      const manualEntries = pfInv.pfLedger.filter(e =>
        e.sourceType !== 'salaryAggregate' && !e.sourceId
      );

      // Group salary contributions by financial year and sum them.
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

      // One aggregate entry per financial year.
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
          notes: `Aggregated employee + employer PF from salary records for AY ${fy}.
        };
      });

      pfInv.pfLedger = [...manualEntries, ...aggregates];
      recalcProvidentFund(pfInv);
    }

    // ══════════════════════════════════════════════════════════════════
    // PHASE 2.3 — liabilityCurrentBalance
    // Computes outstanding balance by subtracting linked EMI transactions.
    // ══════════════════════════════════════════════════════════════════
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

    // ══════════════════════════════════════════════════════════════════
    // PHASE 2.5 — accruedValue
    // Computes investment value using simple interest accrual for
    // savings_certificate, dps, and fdr types. All other types return
    // stored currentValue (or principal as fallback).
    // ══════════════════════════════════════════════════════════════════
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

    // ══════════════════════════════════════════════════════════════════
    // PHASE 2.6 — syncTaxPaymentTransaction
    // Creates or updates a cash outflow transaction for a tax paymen
    // that has an accountId set.
    // ══════════════════════════════════════════════════════════════════
    function syncTaxPaymentTransaction(payment) {
      if (!payment?.id || !payment.accountId || !num(payment.amount)) return;
      if (payment.type === "refund") return; // refunds are inflows, handled separately

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

    // ══════════════════════════════════════════════════════════════════
    // PHASE 4.3 — liabilitiesView
    // Dedicated view with KPI cards and period scoping.
    // ══════════════════════════════════════════════════════════════════
    function liabilitiesView(search) {
      const period = taxPeriod();
      const periodEnd = period.end;
      let rows = filterRows(state.liabilities || [], search);
      // Period scope: only liabilities that existed by periodEnd
      rows = rows.filter(l => !l.openedDate || l.openedDate <= periodEnd);

      const totalOutstanding = rows.reduce((s, l) => s + liabilityCurrentBalance(l.id, periodEnd), 0);
      const upcomingDue = rows.filter(l => l.dueDate && l.dueDate >= today).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
      const nextDue = upcomingDue[0];
      const d = derive();
      const debtToAsset = d.assets > 0 ? ((totalOutstanding / d.assets) * 100).toFixed(1) : "0.0";

      const headers = ["Name", "Type", "Outstanding Balance", "Due date", "Linked"];
      return
        ${recordTabs("liabilities")}
        <div class="grid kpis" style="margin-bottom:14px;">
          ${kpi("Total Outstanding", totalOutstanding, `${rows.length} liabilities`, totalOutstanding === 0)}
          ${kpi("Debt-to-Asset", debtToAsset + "%", "Outstanding ÷ total assets", Number(debtToAsset) < 30)}
          ${kpi("Next due date", nextDue ? nextDue.dueDate : "None upcoming", nextDue ? nextDue.name : "All clear", !nextDue || nextDue.dueDate > today)}
          ${kpi("Paid-off count", rows.filter(l => liabilityCurrentBalance(l.id, periodEnd) === 0).length, "Liabilities at zero balance", true)}
        </div>
        <div class="panel"><div class="panel-body">
          ${rows.length ? `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}<th></th></tr></thead><tbody>${rows.map(r => `<tr><td><strong>${escapeHtml(r.name)}</strong></td><td>${r.type}</td><td class="amount negative">${money(liabilityCurrentBalance(r.id, periodEnd))}</td><td>${r.dueDate || ""}</td><td>${linkText(r)}</td>${rowActions("liabilities", r.id)}</tr>`).join("")}</tbody></table>` : empty("liabilities")}
        </div></div>`;
    }

    function deleteRecord(type, recId) {
      const rec = state[type].find(r => r.id === recId);
      if (!rec) return;
      // ── Phase 3: budgets archive (soft-delete) instead of hard delete, so
      // historical month comparisons stay intact. ──
      if (type === "budgets") {
        if (!confirm(`Archive budget "${rec.category}"? Past months remain comparable; the budget stops tracking going forward.`)) return;
        rec.archivedAt = today;
        save(); renderNav(); render();
        return;
      }
      // ── Phase 2: recurring rules — offer to cascade-delete already-generated txs. ──
      if (type === "recurringRules") {
        const genTx = (state.transactions || []).filter(t => t.sourceType === "recurring" && t.sourceId === recId);
        let cascadeMsg = "";
        if (genTx.length && state.settings.cascadePolicy === "deleteGenerated") {
          cascadeMsg = `\n\n${genTx.length} already-generated transaction(s) will also be removed.`;
        }
        if (!confirm(`Delete recurring rule "${rec.name}"?\nFuture generations stop.${cascadeMsg}`)) return;
        if (genTx.length && state.settings.cascadePolicy === "deleteGenerated") {
          state.transactions = state.transactions.filter(t => !(t.sourceType === "recurring" && t.sourceId === recId));
        } else {
          // unlink only: keep the txs, drop the rule linkage
          genTx.forEach(t => { delete t.sourceType; delete t.sourceId; delete t.generatedKind; });
        }
        state.recurringRules = state.recurringRules.filter(r => r.id !== recId);
        save(); renderNav(); render();
        return;
      }
      const linkedDocs = (state.documents || []).filter(d => d.linkedType === type && d.linkedId === recId).length;
      const generatedTx = state.transactions.filter(t => t.sourceType === type && t.sourceId === recId).length;
      const ok = confirm(`Delete "${rec.name || rec.type}"?\n\nGenerated transactions: ${generatedTx}\n\nLinked views will sync immediately.`);
      if (!ok) return;
      // Settlement transactions removed via cascade below; no adjustAccountBalance needed
      // because account balances are derived from transactions only.
      if (type === "transactions" && rec.generatedKind === "assetTransfer") {
        // Remove the transfer record from the asset too
        const asset = (state?.assets || []).find(a => a.id === rec.sourceId);
        if (asset && Array.isArray(asset.transfers)) {
          asset.transfers = asset.transfers.filter(t => t.id !== rec.transferId);
        }
      }
      // Settlement transaction: removing it is enough; accountCurrentBalance() will no longer include it.
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
        // Rebuild all salary-derived PF aggregates from the remaining salary
        // records. Manual PF entries (interest, opening balances) are preserved
        // inside rebuildSalaryPfAggregates.
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

    function advanceTaxYear() {
      const current = state.settings.taxYear || currentTaxYear();
      const ay = parseInt(current.split("-")[0]);
      const newLabel = `${ay + 1}-${String(ay + 2).slice(-2)}`;
      const newDates = taxYearDates(newLabel);
      if (!confirm(`Advance tax year from ${current} to ${newLabel}?\n\n` +
        `This will:\n• Change the viewing period to ${newLabel}\n` +
        `• Create opening balance memo transactions for each account\n` +
        `• Seed tax slabs and rules for ${newLabel} from current year\n` +
        `• All historical data is preserved.`)) return;

      pushHistory(); // allow undo

      // ── Snapshot account balances at end of closing year ──
      const closingEnd = state.settings.incomeYearEnd || taxYearDates(current).end;
      const snapDate = newDates.start; // first day of new year
      (state.accounts || []).forEach(account => {
        const closingBal = accountCurrentBalance(account.id, closingEnd);
        if (!closingBal) return;
        // Only create snapshot if one doesn't already exist for this account+year
        const alreadyHasSnap = (state.transactions || []).some(t =>
          t.accountId === account.id && t._snapshotYear === current);
        if (!alreadyHasSnap) {
          state.transactions = state.transactions || [];
          state.transactions.push({
            id: id(),
            name: `Opening balance snapshot – ${newLabel}`,
            type: "income",
            date: snapDate,
            amount: 0,          // zero-amount memo — the real balance is reconstructed
            taxableAmount: 0,
            category: "Opening balance memo",
            accountId: account.id,
            affectsAccount: false,
            cashFlowMode: "memo",
            _snapshotYear: current,
            notes: `Auto-snapshot: closing balance ${money(closingBal)} at end of ${current}.
          });
        }
      });

      // ── Phase 1: capture a net-worth snapshot at the closing year-end (deduped by date) ──
      captureSnapshot(closingEnd);

      // ── Seed new year's tax slabs and rules from current year ──
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

      // ── Switch to new year ──
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
                  if ("fileName" in sample || "extracted" in sample) targetKey = "documents";
                  else if ("basic" in sample || "pfEmployee" in sample) targetKey = "salary";
                  else if ("target" in sample) targetKey = "goals";
                }
                const count = mergeTable(targetKey, parsed);
                alert(`Partial Import: Successfully merged ${count} records into your "${targetKey}" table!`);
              } else {
                let mergedLogs = [];
                for (const key of Object.keys(parsed)) {
                  if (Array.isArray(parsed[key]) && state[key] !== undefined) {
                    const count = mergeTable(key, parsed[key]);
                    if (count > 0) mergedLogs.push(`${count} into "${key}"`);
                  }
                }
                if (mergedLogs.length > 0) {
                  alert(`Partial Import: Successfully merged ${mergedLogs.join(", ")}!`);
                } else {
                  alert("No new records were merged.");
                }
              }
            } else {
              state = mergeDefaults(parsed);
              alert("System Restore: Full database restored successfully.");
            }
            save();
            renderNav();
            render();
          } catch (err) {
            console.error("Import failed:", err);
            alert("Could not process this JSON file.");
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
      // Timestamped filename so the download never collides with the currently-open file
      // (Edge silently treats a matching name as an in-place save and overwrites without a prompt).
      const pad = n => String(n).padStart(2, "0");
      const d = new Date();
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      a.download = `finance_os_portable-${stamp}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);

      // Clear undo history stack when saving/downloading a new file
      historyStack = [];
      updateUndoButton();
    }

    function getCleanPortableHtml() {
      const clone = document.documentElement.cloneNode(true);
      clone.querySelector('.app')?.removeAttribute('inert');
      clone.querySelector('#mobileNav')?.removeAttribute('inert');
      clone.querySelector('#moduleMenu')?.removeAttribute('open');
      clone.querySelector('#workspaceActions')?.removeAttribute('open');
      clone.querySelector('#taxYearMenu')?.classList.remove('open');
      clone.querySelector('#periodBadge')?.setAttribute('aria-expanded', 'false');
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
    }

    function resetData() {
      state = migrateState(safeClone(SEED_DATA));
      save();
      setView("home");
    }
