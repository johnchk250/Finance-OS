import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// No browser or third-party packages required. Run after --demo build.
const page = fs.readFileSync('build/portal-preview/index.html', 'utf8');
const scripts = [...page.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !m[1].includes('application/json'));
for (const script of scripts) new vm.Script(script[2]);
const application = scripts.find(m => m[2].includes('const defaultData ='))[2];
const model = application.slice(0, application.indexOf('/* ── BOOTSTRAP INITIALIZATION'));
const demo = JSON.parse(fs.readFileSync('portal/demo_state.json', 'utf8'));
function evaluate(seed, expression, source = model) {
  const context = {
    console, Intl, structuredClone, Date,
    setTimeout() {}, clearTimeout() {},
    document: { addEventListener() {}, getElementById() { return null; } },
    window: { addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
  };
  return JSON.parse(vm.runInNewContext(`${source}\nlet state = mergeDefaults(${JSON.stringify(seed)}); let activeView = 'home'; JSON.stringify(${expression});`, context));
}
const totals = evaluate(demo, 'derive()');
assert.equal(totals.netWorth, 464500);
assert.equal(totals.txIncome, 127000);
assert.equal(totals.txExpense, 24500);
assert.equal(totals.taxDue, 0);
assert.equal(evaluate({}, 'derive()').netWorth, 0);
const transferSeed = structuredClone(demo);
transferSeed.transactions.push({id:'transfer', type:'transfer', amount:10000, fromAccountId:'demo-bank', accountId:'demo-cash', date:'2026-06-12'});
assert.equal(evaluate(transferSeed, 'derive()').netWorth, totals.netWorth);
assert.equal(evaluate(transferSeed, "accountCurrentBalance('demo-cash')"), 15500);
const disabled = structuredClone(demo);
disabled.settings.activeModules = {home:false, settings:false, transactions:false};
const enabledIds = evaluate(disabled, 'activeModules().map(([id]) => id)');
assert(enabledIds.includes('home') && enabledIds.includes('settings'));
assert(!enabledIds.includes('transactions'));
const button = evaluate(demo, "navigationButton('home', 'Overview')");
assert(button.includes('aria-current="page"'));
assert(button.includes('aria-hidden="true"'));

// Optional one-time comparison with an original local export. No private data
// is read from the export; only its calculation code is evaluated with fixtures.
const baselinePath = process.argv[2];
if (baselinePath) {
  const original = fs.readFileSync(baselinePath, 'utf8');
  const script = [...original.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
    .find(m => m[2].includes('const defaultData ='))[2];
  const originalModel = script.slice(0, script.indexOf('/* ── BOOTSTRAP INITIALIZATION'));
  for (const seed of [demo, {}, transferSeed]) {
    assert.deepEqual(evaluate(seed, 'derive()'), evaluate(seed, 'derive()', originalModel));
  }
  console.log('Original/refactored calculation parity: 3 fixtures passed.');
}
console.log('Portal checks passed: syntax, balances, transfer conservation, empty state, navigation.');
