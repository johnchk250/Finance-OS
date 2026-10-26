import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('portal/scripts/native-bridge.js', 'utf8');
const timers = new Map();
let timerId = 0;
let saveAttempts = 0;
let rejectSave = false;
const nativeState = { settings: { currency: 'BDT' }, transactions: [{ id: 't1', amount: 100 }] };
const scrollView = { scrollTop: 230 };
const metrics = { renders: 0, charts: 0, nav: 0 };
const context = vm.createContext({
  state: structuredClone(nativeState),
  storeKey: 'test', historyStack: [],
  console: { error() {} },
  localStorage: { setItem() {} },
  q: () => scrollView,
  mergeDefaults: value => structuredClone(value),
  renderNav: () => metrics.nav++,
  render: () => { metrics.renders++; metrics.charts++; scrollView.scrollTop = 0; },
  drawCharts: () => metrics.charts++,
  updateBrand() {}, updateUndoButton() {}, getCleanPortableHtml: () => '<html/>',
  save() {}, downloadPortableHtml() {}, exportAll() {},
  document: { documentElement: { dataset: {} } },
  setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
  clearTimeout(id) { timers.delete(id); },
  window: {
    addEventListener() {},
    flutter_inappwebview: {
      async callHandler(name) {
        if (name === 'loadFinanceState') return JSON.stringify(nativeState);
        if (name === 'saveFinanceState') { saveAttempts++; return !rejectSave; }
        return true;
      },
    },
  },
});
vm.runInContext(source, context);
for (let n = 0; n < 10; n++) await Promise.resolve();
assert(context.window.financeNativeBridge);
assert.equal(metrics.renders, 0, 'Loading unchanged native data must not redraw');
context.window.financeNativeBridge.applyState({ transactions: nativeState.transactions, settings: nativeState.settings });
assert.equal(metrics.renders, 0, 'Reordered map keys must not cause redraw');
const changed = structuredClone(nativeState);
changed.transactions[0].amount = 200;
context.window.financeNativeBridge.applyState(changed);
assert.equal(metrics.renders, 1, 'A genuine incoming change renders once');
assert.equal(metrics.charts, 1, 'The bridge must not draw charts a second time');
assert.equal(scrollView.scrollTop, 230, 'Incoming refresh preserves scroll');
context.window.financeNativeBridge.applyState(changed);
assert.equal(metrics.renders, 1, 'Repeated incoming state must be a no-op');
context.window.financeNativeBridge.applyState(nativeState);
assert.equal(metrics.renders, 2, 'Restoring an earlier state must still apply');

async function nextTimer() {
  const [id, callback] = timers.entries().next().value;
  timers.delete(id);
  await callback();
}
context.state.transactions[0].amount = 300;
rejectSave = true;
context.save();
await nextTimer();
assert.equal(saveAttempts, 1);
assert.equal(timers.size, 1, 'A rejected save must remain pending');
rejectSave = false;
await nextTimer();
assert.equal(saveAttempts, 2);
assert.equal(timers.size, 0, 'An acknowledged save must not retry forever');
assert.equal(context.state.transactions[0].amount, 300);
assert.equal(metrics.renders, 2, 'Local persistence must not redraw the UI');
console.log('Native bridge passed: duplicate suppression, real updates/restores, single chart pass, scroll retention, failed-save retry.');
