    /* ── BOOTSTRAP INITIALIZATION ── */
    let state = load();
    let activeView = "home";
    let editing = null;
    // ── Phase 1: capture a daily net-worth snapshot on app open (idempotent) ──
    {
      const _snapBefore = (state.netWorthSnapshots || []).length;
      maybeCaptureDailySnapshot();
      if ((state.netWorthSnapshots || []).length !== _snapBefore) save();
    }
    // ── Phase 2: process recurring rules on app open. Single missed instances
    // generate silently; gaps >1 are deferred to a catch-up prompt shown by the
    // UI (pendingRecurringPrompt) so the user decides, never a silent flood. ──
    let pendingRecurringPrompt = null;
    {
      const before = (state.transactions || []).length;
      const res = processRecurringRules();
      if (res.generated > 0) save();
      if (res.rulesNeedingPrompt.length) pendingRecurringPrompt = res.rulesNeedingPrompt;
    }
    // Restore any previously linked file handle from IndexedDB.
    // If permission is still granted (same browser session), subsequent save()
    // calls will write silently in place. After a browser restart the firs
    // click of the Overwrite button re-grants permission via requestPermission().
    (async () => {
      _fileHandle = await idbGetHandle();
      updateSaveBtn();
      updateOverwriteBtn();
    })();

    q("addBtn").onclick = () => {
      const map = { home: "transactions", tax: "taxPayments", planning: "goals", reports: "transactions", settings: "transactions" };
      openForm(map[activeView] || activeView);
    };
    q("settingsBtn").onclick = () => setView("settings");

    // Theme toggle: flips <html data-theme> between light (no attr) and dark.
    // Stored under a dedicated localStorage key so it never marks the data file
    // dirty — it's a pure view preference. Applied early (see initThemeAtBoot)
    // to avoid a flash of the wrong theme on load.
    const THEME_KEY = "financeOS_theme";
    function applyThemeIcon() {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const btn = q("themeToggleBtn");
      if (btn) {
        btn.innerHTML = isDark
          ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/></svg>'
          : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/></svg>';
        btn.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
        btn.title = btn.getAttribute('aria-label');
      }
    }
    q("themeToggleBtn").onclick = () => {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      if (isDark) {
        document.documentElement.removeAttribute("data-theme");
        try { localStorage.setItem(THEME_KEY, "light"); } catch (e) {}
      } else {
        document.documentElement.setAttribute("data-theme", "dark");
        try { localStorage.setItem(THEME_KEY, "dark"); } catch (e) {}
      }
      applyThemeIcon();
    };
    applyThemeIcon(); // sync button icon with whatever the head bootstrap applied


    // Save File button. Always downloads a fresh standalone portable copy with
    // a timestamped name, so it never collides with (or silently overwrites) the
    // currently-open file. Works identically in Edge and Chrome. Your edits are
    // ALREADY persisted to localStorage the moment you make them — this button
    // is for producing the portable artifact you keep/share.
    q("savePortableBtn").onclick = async () => {
      try {
        downloadPortableHtml();
        _dirty = false; updateSaveBtn();
      } catch (err) {
        console.warn("Save failed:", err);
      }
    };
    q("overwriteFileBtn").onclick = overwriteFile;
    q("closeDrawer").onclick = closeDrawer;
    q("drawer").onclick = e => { if (e.target.id === "drawer") closeDrawer(); };
    q("globalSearch").oninput = render;
    q("clearSearch").onclick = clearSearch;

    function clearSearch() {
      q("globalSearch").value = "";
      render();
    }

    document.addEventListener("click", e => {
      if (e.target.id === "cancelForm") closeDrawer();
    });
    let chartResizeFrame = 0;
    window.addEventListener("resize", () => {
      if (chartResizeFrame) return;
      chartResizeFrame = requestAnimationFrame(() => {
        chartResizeFrame = 0;
        drawCharts();
      });
    });

    // ── Phase 1: Home net-worth Breakdown/History toggle + range selector ──
    document.addEventListener("click", (e) => {
      const viewBtn = e.target.closest("[data-netview]");
      if (viewBtn) {
        const view = viewBtn.getAttribute("data-netview");
        const toggle = viewBtn.closest("#netChartToggle");
        if (toggle) toggle.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("active", b === viewBtn));
        const rangeRow = q("netRangeRow");
        if (rangeRow) rangeRow.style.display = view === "history" ? "flex" : "none";
        const bd = q("netChartBreakdownWrap"), hi = q("netChartHistoryWrap");
        if (bd) bd.style.display = view === "history" ? "none" : "";
        if (hi) hi.style.display = view === "history" ? "" : "none";
        if (view === "history") drawNetHistoryChart(); else drawNetChart();
        return;
      }
      const rangeBtn = e.target.closest("[data-netrange]");
      if (rangeBtn) {
        netHistoryRange = rangeBtn.getAttribute("data-netrange");
        const row = rangeBtn.closest("#netRangeRow");
        if (row) row.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("active", b === rangeBtn));
        drawNetHistoryChart();
        return;
      }
    });

    setView("home");
    // ── Phase 2: catch-up prompt for recurring rules that fell behind during an
    // offline gap (>1 instance due). One prompt per gap; user picks the action. ──
    if (pendingRecurringPrompt && pendingRecurringPrompt.length) {
      const items = pendingRecurringPrompt;
      const totalDue = items.reduce((s, i) => s + i.dueCount, 0);
      const detail = items.map(i => `• ${i.rule.name}: ${i.dueCount} due`).join("\n");
      // Offer a global choice applied to all pending rules for simplicity (v1).
      const choice = window.prompt(
        `Recurring catch-up\n\n${totalDue} recurring payment(s) would be generated after an offline gap:\n${detail}\n\nType one of: all / once / skip`,
        "all"
      );
      const mode = (choice || "").trim().toLowerCase() === "once" ? "once"
        : (choice || "").trim().toLowerCase() === "skip" ? "skip" : "all";
      const res = processRecurringRules({ mode });
      if (res.generated > 0) save();
      pendingRecurringPrompt = null;
      renderNav(); render();
    }
    /* ── UNDO ENGINE ── */
    let historyStack = [];
    const MAX_HISTORY = 30;

    function pushHistory() {
      // Clone the current state before modifying i
      const snapshot = JSON.parse(JSON.stringify(state));
      historyStack.push(snapshot);
      if (historyStack.length > MAX_HISTORY) {
        historyStack.shift();
      }
      updateUndoButton();
    }

    function undo() {
      if (historyStack.length === 0) return;
      const previousState = historyStack.pop();
      state = mergeDefaults(previousState);
      save();
      renderNav();
      render();
      updateUndoButton();
      showUndoToast('↩ Undo successful');
    }

    function updateUndoButton() {
      const btn = q("undoBtn");
      if (!btn) return;
      btn.disabled = historyStack.length === 0;
      btn.textContent = historyStack.length > 0 ? `↩ Undo (${historyStack.length})` : `↩ Undo`;
    }

    function showUndoToast(msg) {
      let toast = document.querySelector('.undo-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.className = 'undo-toast';
        document.body.appendChild(toast);
      }
      toast.textContent = msg;
      toast.classList.add('show');
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => {
        toast.classList.remove('show');
      }, 2000);
    }

    // ── KEYBOARD SHORTCUT (Ctrl+Z / Cmd+Z) ──
    document.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
    });

    // ── MODIFY EXISTING FUNCTIONS TO PUSH HISTORY ──

    // 1. Hook into saveForm (Add/Edit)
    const originalSaveForm = saveForm;
    saveForm = function(e) {
      pushHistory();
      originalSaveForm.call(this, e);
    };

    // 2. Hook into deleteRecord
    const originalDeleteRecord = deleteRecord;
    deleteRecord = function(type, recId) {
      pushHistory();
      originalDeleteRecord.call(this, type, recId);
    };

    // 3. Hook into investment settlemen
    const originalSaveInvestmentSettlement = saveInvestmentSettlement;
    saveInvestmentSettlement = function(e) {
      pushHistory();
      originalSaveInvestmentSettlement.call(this, e);
    };

    // 4. Hook into PF entry save
    const originalSaveProvidentFundEntry = saveProvidentFundEntry;
    saveProvidentFundEntry = function(e) {
      pushHistory();
      originalSaveProvidentFundEntry.call(this, e);
    };

    // 5. Hook into PF entry delete
    const originalDeleteProvidentFundEntry = deleteProvidentFundEntry;
    deleteProvidentFundEntry = function(investmentId, entryId) {
      pushHistory();
      originalDeleteProvidentFundEntry.call(this, investmentId, entryId);
    };

    // 6. Hook into seedData
    const originalSeedData = seedData;
    seedData = function() {
      pushHistory();
      originalSeedData.call(this);
    };

    // 7. Hook into resetData
    const originalResetData = resetData;
    resetData = function() {
      // No undo for reset because it's a hard reset.
      // If you want undo for reset too, uncomment below:
      // pushHistory();
      // BUT reset clears everything, so undo might bring back a huge state.
      // It's safer to have no undo for reset.
      if(confirm("Reset all data and start fresh? This clears everything and cannot be undone.")) {
        originalResetData.call(this);
      }
    };

    // 8. Hook into importAll
    const originalImportAll = importAll;
    importAll = function() {
      pushHistory();
      originalImportAll.call(this);
    };

    // 9. Hook into settings changes
    // We need to overwrite the onchange listeners for settings inputs
    const settingMap = [
      ["taxYearSetting", "taxYear"],
      ["incomeStartSetting", "incomeYearStart"],
      ["incomeEndSetting", "incomeYearEnd"],
      ["cascadeSetting", "cascadePolicy"]
    ];
    // We will do this in bindViewEvents override below

    // 10. Hook into transactionSor
    // We will do this in bindViewEvents override below

    // ── OVERRIDE BINDVIEWEVENTS TO ADD UNDO LISTENERS ──
    const originalBindViewEvents = bindViewEvents;
    bindViewEvents = function() {
      originalBindViewEvents.call(this);

      // Add Undo Button to Toolbar
      const toolbar = q('workspaceActionMenu');
      if (toolbar && !q("undoBtn")) {
        const btn = document.createElement('button');
        btn.id = 'undoBtn';
        btn.title = 'Undo (Ctrl+Z)';
        btn.disabled = true;
        btn.textContent = '↩ Undo';
        btn.onclick = undo;
        toolbar.prepend(btn);
        updateUndoButton();
      }

      // Re-bind settings with history push
      const settingMap = [
        ["taxYearSetting", "taxYear"],
        ["cascadeSetting", "cascadePolicy"]
      ];
      settingMap.forEach(([el, key]) => {
        const elem = q(el);
        if (elem) {
          const newElem = elem.cloneNode(true);
          elem.parentNode.replaceChild(newElem, elem);
          newElem.onchange = (e) => {
            state.settings[key] = e.target.value;
            if (key === "taxYear") {
              const dates = taxYearDates(e.target.value);
              state.settings.incomeYearStart = dates.start;
              state.settings.incomeYearEnd = dates.end;
            }
            save();
            render();
          };
        }
      });

      // Transaction Sort with history
      const sortSelect = q("transactionSort");
      if (sortSelect) {
        const newSort = sortSelect.cloneNode(true);
        sortSelect.parentNode.replaceChild(newSort, sortSelect);
        newSort.onchange = (e) => {
          state.settings.transactionSort = e.target.value;
          save();
          render();
        };
      }
      const typeSelect = q("transactionTypeFilter");
      if (typeSelect) {
        const newType = typeSelect.cloneNode(true);
        typeSelect.parentNode.replaceChild(newType, typeSelect);
        newType.onchange = (e) => {
          state.settings.transactionTypeFilter = e.target.value;
          // Reset category filter if it no longer belongs to the selected Type
          const validCats = categoriesForTypeFilter(e.target.value);
          const cur = state.settings.transactionCategoryFilter || "";
          if (cur && !validCats.includes(cur)) state.settings.transactionCategoryFilter = "";
          save();
          render();
        };
      }
      const filterSelect = q("transactionCategoryFilter");
      if (filterSelect) {
        const newFilter = filterSelect.cloneNode(true);
        filterSelect.parentNode.replaceChild(newFilter, filterSelect);
        newFilter.onchange = (e) => {
          state.settings.transactionCategoryFilter = e.target.value;
          save();
          render();
        };
      }
      const periodSelect = q("transactionPeriodFilter");
      if (periodSelect) {
        const newPeriod = periodSelect.cloneNode(true);
        periodSelect.parentNode.replaceChild(newPeriod, periodSelect);
        newPeriod.onchange = (e) => {
          state.settings.transactionPeriodFilter = e.target.value;
          save();
          render();
        };
      }
    };

    // ── INITIAL SETUP ──
    // Ensure UI is ready
    setTimeout(() => {
      // Re-run binding to ensure undo button appears even if already loaded
      // This is safe to run multiple times
      const toolbar = q('workspaceActionMenu');
      if (toolbar && !q("undoBtn")) {
        const btn = document.createElement('button');
        btn.id = 'undoBtn';
        btn.title = 'Undo (Ctrl+Z)';
        btn.disabled = true;
        btn.textContent = '↩ Undo';
        btn.onclick = undo;
        toolbar.prepend(btn);
        updateUndoButton();
      }
    }, 100);
    window.addEventListener("beforeunload", e => {
      if (_dirty) { e.preventDefault(); e.returnValue = "You have unsaved changes. Click Save File to create a portable copy."; }
    });
    updateBrand();

    initializeWorkspace();
