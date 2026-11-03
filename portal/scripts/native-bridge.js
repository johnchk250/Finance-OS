(() => {
    let bridgeReady = false;
    let saveTimer = null;
    let lastSent = "";
    let saving = false;

    // Native maps may have a different property order from the page's maps.
    function stateKey(value) {
      return JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
    }

    async function callNative(name, ...args) {
      const bridge = window.flutter_inappwebview;
      if (!bridge || typeof bridge.callHandler !== "function") return null;
      return bridge.callHandler(name, ...args);
    }

    function updateNativeSyncUi(phase, details) {
      if (typeof document === "undefined") return;
      if (document.documentElement?.dataset) {
        document.documentElement.dataset.financeSyncStatus = phase || "";
        document.documentElement.dataset.financeNativeHost = "1";
      }
      if (typeof document.getElementById !== "function") return;
      const wrap = document.getElementById("nativeSyncWrap");
      if (wrap) wrap.hidden = false;
      const labelEl = document.getElementById("nativeSyncLabel");
      const btnEl = document.getElementById("nativeSyncBtn");
      const labels = {
        disabled: "Sync off · Connect folder",
        idle: "Synced",
        syncing: "Syncing…",
        blocked: "Sync blocked · Review",
        error: "Sync error · Retry"
      };
      if (labelEl) labelEl.textContent = labels[phase] || "Sync off";
      if (btnEl) {
        btnEl.dataset.phase = phase || "disabled";
        if (details && details.message) {
          btnEl.title = details.message;
        }
      }
      if (typeof document.querySelectorAll === "function") {
        document.querySelectorAll(".native-only-item").forEach(el => { el.hidden = false; });
        document.querySelectorAll(".browser-only-item").forEach(el => { el.hidden = true; });
      }
    }

    function refreshFromNative(nextState) {
      if (!nextState || typeof nextState !== "object") return;
      const normalized = mergeDefaults(nextState);
      const key = stateKey(normalized);
      // Loading the bridge and announcing readiness can send the same state
      // twice. Neither a duplicate nor an acknowledgement should replace DOM.
      if (key === stateKey(state)) return;
      const viewEl = q('view');
      const scrollTop = viewEl ? viewEl.scrollTop : 0;
      state = normalized;
      if (typeof bumpStateRev === "function") bumpStateRev();
      try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch (_) {}
      renderNav();
      render();
      if (viewEl) viewEl.scrollTop = scrollTop;
      updateBrand();
    }

    function queueStateSave() {
      if (!bridgeReady) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flushStateSave, 250);
    }

    async function flushStateSave() {
      if (saving) return;
      const serialized = JSON.stringify(state);
      if (serialized === lastSent) return;
      saving = true;
      try {
        const saved = await callNative("saveFinanceState", serialized);
        if (saved !== true) throw new Error('Native save was not acknowledged');
        lastSent = serialized;
        if (typeof markClean === "function") markClean();
      } catch (error) {
        console.error('Native save failed; retaining pending changes for retry.', error);
      } finally {
        saving = false;
        if (JSON.stringify(state) !== lastSent) {
          clearTimeout(saveTimer);
          saveTimer = setTimeout(flushStateSave, 1000);
        }
      }
    }

    async function startBridge() {
      if (bridgeReady) return;
      bridgeReady = true;

      const nativeState = await callNative("loadFinanceState");
      if (nativeState) {
        const parsed = typeof nativeState === "string"
          ? JSON.parse(nativeState)
          : nativeState;
        refreshFromNative(parsed);
        lastSent = JSON.stringify(state);
      }
      if (typeof ensureWorkspacePinLock === "function") ensureWorkspacePinLock();

      const browserSave = save;
      save = function(...args) {
        const result = browserSave.apply(this, args);
        queueStateSave();
        return result;
      };

      downloadPortableHtml = async function() {
        await callNative("exportPortable", getCleanPortableHtml());
        historyStack = [];
        updateUndoButton();
      };

      exportAll = async function() {
        await callNative("exportJson", JSON.stringify(state, null, 2));
      };

      window.financeNativeBridge = {
        applyState(nextState) {
          const parsed = typeof nextState === "string"
            ? JSON.parse(nextState)
            : nextState;
          refreshFromNative(parsed);
          lastSent = JSON.stringify(state);
        },
        syncStatus(status, details) {
          updateNativeSyncUi(status || "", details || null);
        },
        chooseSyncFolder() {
          return callNative("chooseSyncFolder");
        },
        syncNow() {
          return callNative("syncNow");
        },
        openSafetyCenter() {
          return callNative("openSafetyCenter");
        },
        syncTheme(theme) {
          return callNative("syncTheme", theme);
        },
        requestPinUnlock() {
          return callNative("requestPinUnlock");
        }
      };

      updateNativeSyncUi("disabled", null);

      if (typeof document !== "undefined" && typeof document.getElementById === "function") {
        const syncBtn = document.getElementById("nativeSyncBtn");
        if (syncBtn) syncBtn.onclick = () => callNative("syncNow");
        const safetyBtn = document.getElementById("nativeSafetyBtn");
        if (safetyBtn) safetyBtn.onclick = () => callNative("openSafetyCenter");
        const menuSync = document.getElementById("menuSyncNowBtn");
        if (menuSync) menuSync.onclick = () => { const wa = document.getElementById("workspaceActions"); if (wa) wa.open = false; callNative("syncNow"); };
        const menuFolder = document.getElementById("menuChooseFolderBtn");
        if (menuFolder) menuFolder.onclick = () => { const wa = document.getElementById("workspaceActions"); if (wa) wa.open = false; callNative("chooseSyncFolder"); };
        const menuSafety = document.getElementById("menuSafetyVaultBtn");
        if (menuSafety) menuSafety.onclick = () => { const wa = document.getElementById("workspaceActions"); if (wa) wa.open = false; callNative("openSafetyCenter"); };
      }

      await callNative("bridgeReady");
      if (typeof isWorkspaceLocked === "function" && isWorkspaceLocked()) {
        await callNative("requestPinUnlock");
      }

      try {
        if (typeof document !== "undefined" && document.documentElement?.getAttribute) {
          const isDark = document.documentElement.getAttribute("data-theme") === "dark";
          callNative("syncTheme", isDark ? "dark" : "light");
        }
      } catch (_) {}
    }

    window.addEventListener("flutterInAppWebViewPlatformReady", startBridge);
    if (window.flutter_inappwebview) startBridge();
  })();
