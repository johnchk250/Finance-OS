// Navigation owns module identity and responsive destinations. Financial state
// remains in the legacy model; navigating must never save or mutate records.
const moduleDefinitions = [
  { id: 'home', label: 'Overview', description: 'Your finances, at a glance', group: 'Workspace', icon: 'M3 10 12 3l9 7v10H3Z M9 20v-7h6v7' },
  { id: 'transactions', label: 'Transactions', description: 'Income, expenses, and transfers', group: 'Workspace', icon: 'M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4' },
  { id: 'salary', label: 'Salary', description: 'Earnings and payslip history', group: 'Workspace', icon: 'M4 7h16v13H4ZM8 7V3h8v4M4 12h16M10 12v3h4v-3' },
  { id: 'budgets', label: 'Budgets', description: 'Monthly spending, with intention', group: 'Workspace', icon: 'M12 3v9h9A9 9 0 0 0 12 3ZM8 4a9 9 0 1 0 12 12' },
  { id: 'assets', label: 'Assets', description: 'Accounts, property, and balances', group: 'Portfolio', icon: 'M3 9h18L12 3ZM5 10v9m7-9v9m7-9v9M3 21h18' },
  { id: 'investments', label: 'Investments', description: 'Savings and long-term growth', group: 'Portfolio', icon: 'M3 17 9 11l4 4 8-11M15 4h6v6' },
  { id: 'liabilities', label: 'Liabilities', description: 'Loans, cards, and obligations', group: 'Portfolio', icon: 'M3 5h18v14H3ZM3 10h18M6 15h4' },
  { id: 'tax', label: 'Tax', description: 'Your Bangladesh assessment year', group: 'Plan & review', icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2ZM9 7h6M9 11h6M9 15h3' },
  { id: 'planning', label: 'Planning', description: 'Goals, runway, and what comes next', group: 'Plan & review', icon: 'M4 21V3m0 1h15l-3 5 3 5H4' },
  { id: 'reports', label: 'Reports', description: 'Trends, breakdowns, and reconciliation', group: 'Plan & review', icon: 'M4 3v18h17M8 17v-5m5 5V7m5 10V4' },
  { id: 'settings', label: 'Settings', description: 'Preferences, categories, and backups', group: 'Manage', icon: 'M4 7h16M4 17h16M8 4v6m8 4v6' },
];
// Tuple adapter preserves existing settings and lookup callers.
const modules = moduleDefinitions.map(m => [m.id, m.label, m.description]);

function activeModules() {
  return modules.filter(([id]) => id === 'home' || id === 'settings' || state?.settings?.activeModules?.[id]);
}

function moduleIcon(id) {
  const path = moduleDefinitions.find(m => m.id === id)?.icon || 'M4 6h16M4 12h16M4 18h16';
  return `<svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
}

function navigationButton(id, label, compact = false) {
  const count = compact ? '' : countFor(id);
  return `<button type="button" data-view="${id}" class="${activeView === id ? 'active' : ''}" ${activeView === id ? 'aria-current="page"' : ''}>${moduleIcon(id)}<span class="nav-label">${label}</span>${compact ? '' : `<span class="nav-count" ${count ? '' : 'hidden'}>${count}</span>`}</button>`;
}

let navigationModulesKey = '';
function renderNav() {
  const enabled = activeModules();
  const modulesKey = enabled.map(([id]) => id).join('|');
  const shortcuts = enabled.filter(([id]) => ['home', 'transactions', 'budgets', 'reports'].includes(id));
  if (modulesKey !== navigationModulesKey) {
  navigationModulesKey = modulesKey;
  const groups = [...new Set(moduleDefinitions.map(m => m.group))];
  q('nav').innerHTML = groups.map(group => {
    const entries = enabled.filter(([id]) => moduleDefinitions.find(m => m.id === id).group === group);
    return entries.length ? `<div class="nav-group"><div class="nav-group-label">${group}</div>${entries.map(([id, label]) => navigationButton(id, label)).join('')}</div>` : '';
  }).join('');
  q('mobileNav').innerHTML = shortcuts.map(([id, label]) => navigationButton(id, label, true)).join('') +
    `<button id="moreNavBtn" type="button" aria-haspopup="dialog" class="${shortcuts.some(([id]) => id === activeView) ? '' : 'active'}">${moduleIcon('more')}<span class="nav-label">More</span></button>`;
  q('moduleMenuItems').innerHTML = enabled.map(([id, label]) => navigationButton(id, label)).join('');
  document.querySelectorAll('[data-view]').forEach(button => {
    button.onclick = () => setView(button.dataset.view, true);
  });
  q('moreNavBtn').onclick = () => q('moduleMenu').showModal();
  }
  // Retain focused/pressed buttons and their compositor layers on navigation.
  const counts = new Map(enabled.map(([id]) => [id, countFor(id)]));
  document.querySelectorAll('#nav [data-view], #mobileNav [data-view], #moduleMenuItems [data-view]').forEach(button => {
    const active = button.dataset.view === activeView;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
    const badge = button.querySelector('.nav-count');
    if (badge) {
      const count = counts.get(button.dataset.view) || '';
      if (badge.textContent !== count) badge.textContent = count;
      badge.hidden = !count;
    }
  });
  q('moreNavBtn').classList.toggle('active', !shortcuts.some(([id]) => id === activeView));
}

function setView(view, focus = false) {
  const destination = activeModules().some(([id]) => id === view) ? view : 'home';
  if (focus && q('view').dataset.module === destination && !q('globalSearch').value.trim()) {
    q('moduleMenu').close();
    q('workspaceActions').open = false;
    if (focus) q('view').focus({ preventScroll: true });
    return;
  }
  activeView = destination;
  const mod = moduleDefinitions.find(m => m.id === activeView);
  q('globalSearch').value = '';
  q('viewTitle').textContent = mod.label;
  q('viewSubtitle').textContent = mod.description;
  q('view').setAttribute('aria-label', mod.label);
  q('view').dataset.module = activeView;
  q('periodBadgeLabel').textContent = 'AY ' + (state?.settings?.taxYear || currentTaxYear());
  q('periodBadge').onclick = e => {
    e.stopPropagation();
    const isOpen = q('taxYearMenu').classList.toggle('open');
    q('periodBadge').setAttribute('aria-expanded', String(isOpen));
    if (isOpen) renderTaxYearMenu();
  };
  q('moduleMenu').close();
  q('workspaceActions').open = false;
  renderTaxYearMenuActive();
  renderNav();
  render();
  q('view').scrollTop = 0;
  if (focus) q('view').focus({ preventScroll: true });
}

function initializeWorkspace() {
  q('closeModuleMenu').onclick = () => q('moduleMenu').close();
  q('moduleMenu').addEventListener('click', e => {
    if (e.target === q('moduleMenu')) q('moduleMenu').close();
  });
  document.addEventListener('click', e => {
    if (!q('workspaceActions').contains(e.target)) q('workspaceActions').open = false;
  });
  new MutationObserver(() => {
    q('periodBadge').setAttribute('aria-expanded', String(q('taxYearMenu').classList.contains('open')));
  }).observe(q('taxYearMenu'), { attributes: true, attributeFilter: ['class'] });

  let formTrigger = null;
  const drawer = q('drawer');
  const focusable = () => [...drawer.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')]
    .filter(el => !el.disabled && el.getClientRects().length);
  new MutationObserver(() => {
    const open = drawer.classList.contains('open');
    document.querySelector('.app').inert = open;
    q('mobileNav').inert = open;
    if (open) {
      formTrigger = document.activeElement;
      (focusable()[0] || drawer.querySelector('.drawer-panel')).focus();
    } else if (formTrigger?.isConnected) {
      formTrigger.focus();
      formTrigger = null;
    }
  }).observe(drawer, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !drawer.classList.contains('open') && !q('moduleMenu').open) {
      e.preventDefault(); q('globalSearch').focus();
    }
    if (e.key === 'Escape') {
      if (drawer.classList.contains('open')) closeDrawer();
      q('workspaceActions').open = false;
    }
    if (e.key === 'Tab' && drawer.classList.contains('open')) {
      const items = focusable(), first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  });
}
