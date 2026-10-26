    /* ── CONTROLLERS & RENDERING ── */
    function render() {
      const view = q("view");
      const search = q("globalSearch").value.trim().toLowerCase();
      q("clearSearch")?.classList.toggle("show", Boolean(search));
      if (search) {
        view.innerHTML = globalSearchView(search);
        wrapBareTables();
        bindViewEvents();
        return;
      }
      const renderers = {
        home: homeView, transactions: () => tableView("transactions", search),
        salary: () => salaryView(search), expenses: () => expensesView(search),
        assets: () => assetsView(search), liabilities: () => liabilitiesView(search),
        investments: () => investmentsView(search), tax: taxView,
        planning: () => planningView(search), reports: reportsView,
        budgets: budgetsView, settings: settingsView
      };
      view.innerHTML = (renderers[activeView] || homeView)();
      wrapBareTables();
      bindViewEvents();
      drawCharts();
    }

    // Wrap every <table> that sits directly in the view (or a panel-body) and
    // isn't already inside a scroll container, so wide tables (salary,
    // transactions, tax, liabilities, assets) scroll horizontally on mobile
    // instead of stretching the viewport. Idempotent: skips already-wrapped
    // tables and tables that already live inside an overflow-auto ancestor.
    function wrapBareTables() {
      const view = q("view");
      if (!view) return;
      view.querySelectorAll("table").forEach(table => {
        if (table.dataset.scrollWrapped === "1") return;
        const parent = table.parentElement;
        if (!parent) return;
        const parentStyle = getComputedStyle(parent);
        const alreadyScrolls = parentStyle.overflowX === "auto" || parentStyle.overflowX === "scroll";
        if (alreadyScrolls) { table.dataset.scrollWrapped = "1"; return; }
        const wrapper = document.createElement("div");
        wrapper.className = "table-scroll";
        // min-width keeps columns legible; set to the table's natural width.
        wrapper.style.cssText = "overflow-x:auto; -webkit-overflow-scrolling:touch;";
        parent.insertBefore(wrapper, table);
        wrapper.appendChild(table);
        table.dataset.scrollWrapped = "1";
      });
    }
