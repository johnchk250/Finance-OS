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

    function refreshFromNative(nextState) {
      if (!nextState || typeof nextState !== "object") return;
      const normalized = mergeDefaults(nextState);
      const key = stateKey(normalized);
      // Loading the bridge and announcing readiness can send the same state
      // twice. Neither a duplicate nor an acknowledgement should replace DOM.
      if (key === stateKey(state)) return;
      const scrollTop = q('view').scrollTop;
      state = normalized;
      try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch (_) {}
      renderNav();
      render();
      q('view').scrollTop = scrollTop;
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
        syncStatus(status) {
          document.documentElement.dataset.financeSyncStatus = status || "";
        }
      };

      await callNative("bridgeReady");
    }

    window.addEventListener("flutterInAppWebViewPlatformReady", startBridge);
    if (window.flutter_inappwebview) startBridge();
  })();
