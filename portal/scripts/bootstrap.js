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

    // ── Phase 2: process recurring rules on app open ──
    let pendingRecurringPrompt = null;
    {
      const res = processRecurringRules();
      if (res.generated > 0) save();
      if (res.rulesNeedingPrompt.length) pendingRecurringPrompt = res.rulesNeedingPrompt;
    }

    // Restore any previously linked file handle from IndexedDB (browser mode).
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

    /* ── THEME & PRIVACY BLUR TOGGLES ── */
    const THEME_KEY = "financeOS_theme";
    const PRIVACY_KEY = "financeOS_privacy";
    const PIN_KEY = "financeOS_pin";

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

    function applyPrivacyIcon() {
      const priv = isPrivacyMode();
      const btn = q("privacyToggleBtn");
      if (btn) {
        btn.classList.toggle("active", priv);
        btn.innerHTML = priv
          ? '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.7 10.7 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-4 4.9M6.6 6.6C4 8.3 2 12 2 12s3 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/></svg>'
          : '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
        btn.setAttribute("aria-label", priv ? "Reveal currency amounts (Ctrl+B)" : "Mask currency amounts (Ctrl+B)");
        btn.title = btn.getAttribute("aria-label");
      }
    }

    function togglePrivacyMode() {
      const next = !isPrivacyMode();
      if (next) {
        document.documentElement.setAttribute("data-privacy", "1");
        try { localStorage.setItem(PRIVACY_KEY, "1"); } catch (_) {}
      } else {
        document.documentElement.removeAttribute("data-privacy");
        try { localStorage.removeItem(PRIVACY_KEY); } catch (_) {}
      }
      bumpStateRev();
      applyPrivacyIcon();
      render();
      showUndoToast(next ? "Privacy blur enabled (Ctrl+B)" : "Privacy blur off");
    }

    if (q("privacyToggleBtn")) q("privacyToggleBtn").onclick = togglePrivacyMode;
    applyPrivacyIcon();

    q("themeToggleBtn").onclick = () => {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const nextTheme = isDark ? "light" : "dark";
      if (isDark) {
        document.documentElement.removeAttribute("data-theme");
      } else {
        document.documentElement.setAttribute("data-theme", "dark");
      }
      try { localStorage.setItem(THEME_KEY, nextTheme); } catch (_) {}
      applyThemeIcon();
      drawCharts();
      window.financeNativeBridge?.syncTheme?.(nextTheme);
    };
    applyThemeIcon();

    /* ── PIN APP LOCK ENGINE ── */
    function getWorkspacePin() {
      try { return localStorage.getItem(PIN_KEY) || state?.settings?.workspacePin || ""; }
      catch (_) { return state?.settings?.workspacePin || ""; }
    }

    function updateLockMenuButton() {
      const lockBtn = q("lockNowBtn");
      if (lockBtn) lockBtn.hidden = !getWorkspacePin();
    }

    function lockWorkspaceNow() {
      const pin = getWorkspacePin();
      if (!pin) return;
      const overlay = q("pinLockOverlay");
      if (!overlay) return;
      overlay.hidden = false;
      document.querySelector(".app")?.setAttribute("inert", "");
      q("mobileNav")?.setAttribute("inert", "");
      const inp = q("pinUnlockInput");
      const err = q("pinUnlockError");
      if (err) err.hidden = true;
      if (inp) { inp.value = ""; setTimeout(() => inp.focus(), 50); }
    }

    function checkPinLockOnResume() {
      if (getWorkspacePin()) lockWorkspaceNow();
    }

    async function promptConfigurePin() {
      const existing = getWorkspacePin();
      if (existing) {
        const currentTry = await showAppPrompt("Verify current PIN", "Enter your current PIN to change it:", "", "password");
        if (currentTry === null) return;
        if (currentTry.trim() !== existing) {
          showAppNotice("Incorrect PIN", "The current PIN you entered did not match.");
          return;
        }
      }
      const nextPin = await showAppPrompt("Set Workspace PIN", "Enter a 4 to 8 digit PIN to protect Finance OS on startup:", "", "password");
      if (nextPin === null) return;
      const clean = nextPin.trim();
      if (!/^\d{4,8}$/.test(clean)) {
        showAppNotice("Invalid PIN", "Please enter 4 to 8 numeric digits.");
        return;
      }
      try { localStorage.setItem(PIN_KEY, clean); } catch (_) {}
      state.settings.workspacePin = clean;
      persistViewOnly();
      updateLockMenuButton();
      render();
      showUndoToast("PIN lock enabled");
    }

    async function promptRemovePin() {
      const existing = getWorkspacePin();
      if (!existing) return;
      const currentTry = await showAppPrompt("Disable PIN Lock", "Enter your current PIN to disable lock protection:", "", "password");
      if (currentTry === null) return;
      if (currentTry.trim() !== existing) {
        showAppNotice("Incorrect PIN", "The PIN you entered did not match.");
        return;
      }
      try { localStorage.removeItem(PIN_KEY); } catch (_) {}
      delete state.settings.workspacePin;
      persistViewOnly();
      updateLockMenuButton();
      render();
      showUndoToast("PIN lock disabled");
    }

    if (q("pinUnlockForm")) {
      q("pinUnlockForm").onsubmit = (e) => {
        e.preventDefault();
        const pin = getWorkspacePin();
        const entered = (q("pinUnlockInput")?.value || "").trim();
        if (entered === pin) {
          q("pinLockOverlay").hidden = true;
          document.querySelector(".app")?.removeAttribute("inert");
          q("mobileNav")?.removeAttribute("inert");
          q("pinUnlockInput").value = "";
          if (q("pinUnlockError")) q("pinUnlockError").hidden = true;
        } else {
          if (q("pinUnlockError")) q("pinUnlockError").hidden = false;
          q("pinUnlockInput")?.select?.();
        }
      };
    }
    if (q("lockNowBtn")) {
      q("lockNowBtn").onclick = () => {
        if (q("workspaceActions")) q("workspaceActions").open = false;
        lockWorkspaceNow();
      };
    }
    updateLockMenuButton();
    if (getWorkspacePin()) {
      lockWorkspaceNow();
    }

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

    /* ── DEBOUNCED SEARCH & QUICK-ENTRY INPUT ── */
    let _searchDebounceTimer = 0;
    q("globalSearch").oninput = () => {
      clearTimeout(_searchDebounceTimer);
      _searchDebounceTimer = setTimeout(() => {
        render();
      }, 110);
    };
    q("globalSearch").onkeydown = (e) => {
      if (e.key === "Enter") {
        const val = q("globalSearch").value.trim();
        const parsed = typeof parseQuickCommand === "function" ? parseQuickCommand(val) : null;
        if (parsed?.kind === "quickTx") {
          e.preventDefault();
          clearTimeout(_searchDebounceTimer);
          executeQuickLogTx(parsed.tx);
        } else if (parsed?.kind === "commands" && parsed.items.length > 0) {
          e.preventDefault();
          clearTimeout(_searchDebounceTimer);
          executePaletteCommand(parsed.items[0].action);
        }
      }
    };
    q("clearSearch").onclick = clearSearch;

    function clearSearch() {
      clearTimeout(_searchDebounceTimer);
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

    // ── Phase 2: non-blocking catch-up modal for recurring rules that fell behind ──
    if (pendingRecurringPrompt && pendingRecurringPrompt.length) {
      const items = pendingRecurringPrompt;
      pendingRecurringPrompt = null;
      setTimeout(async () => {
        const choice = await showRecurringCatchUpModal(items);
        const mode = choice === "once" ? "once" : choice === "skip" ? "skip" : "all";
        const res = processRecurringRules({ mode });
        if (res.generated > 0) save();
        renderNav();
        render();
      }, 60);
    }

    /* ── UNDO ENGINE ── */
    let historyStack = [];
    const MAX_HISTORY = 30;

    function pushHistory() {
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
      }, 2200);
    }

    document.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    });

    // Hook into saveForm (Add/Edit)
    const originalSaveForm = saveForm;
    saveForm = function(e) {
      pushHistory();
      originalSaveForm.call(this, e);
    };

    // Hook into investment settlement
    const originalSaveInvestmentSettlement = saveInvestmentSettlement;
    saveInvestmentSettlement = function(e) {
      pushHistory();
      originalSaveInvestmentSettlement.call(this, e);
    };

    // Hook into PF entry save
    const originalSaveProvidentFundEntry = saveProvidentFundEntry;
    saveProvidentFundEntry = function(e) {
      pushHistory();
      originalSaveProvidentFundEntry.call(this, e);
    };

    // Ensure Undo button is mounted inside workspaceActionMenu
    function ensureUndoButton() {
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
    }
    ensureUndoButton();

    window.addEventListener("beforeunload", e => {
      const isNative = typeof window !== "undefined" && Boolean(window.flutter_inappwebview);
      if (_dirty && !isNative) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Click Export portable HTML to create a portable copy.";
      }
    });
    updateBrand();

    initializeWorkspace();
