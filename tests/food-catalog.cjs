'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'nutrition/data/uk-foods-2021.json'), 'utf8'));

// An aborted transaction must retain the previous catalogue and version marker.
function fakeIndexedDb() {
  const stores = new Map();
  let failNextWrite = false;
  const database = {
    objectStoreNames: { contains: name => stores.has(name) },
    createObjectStore(name) { stores.set(name, new Map()); return { createIndex() {} }; },
    close() {},
    transaction(names, mode) {
      const selected = Array.isArray(names) ? names : [names];
      const pending = new Map(selected.map(name => [name, new Map(stores.get(name))]));
      const aborted = mode === 'readwrite' && failNextWrite;
      if (aborted) failNextWrite = false;
      const tx = { objectStore(name) {
        const records = pending.get(name);
        return {
          clear() { records.clear(); }, put(record) { records.set(record.id, structuredClone(record)); },
          get(id) { const request = {}; queueMicrotask(() => { request.result = structuredClone(records.get(id)); }); return request; },
          getAll() { const request = {}; queueMicrotask(() => { request.result = [...records.values()].map(record => structuredClone(record)); }); return request; }
        };
      } };
      setImmediate(() => {
        if (aborted) { tx.error = new Error('quota exceeded'); if (tx.onabort) tx.onabort(); return; }
        if (mode === 'readwrite') selected.forEach(name => stores.set(name, pending.get(name)));
        if (tx.oncomplete) tx.oncomplete();
      });
      return tx;
    }
  };
  return { stores, failWrite() { failNextWrite = true; }, open() {
    const request = {};
    queueMicrotask(() => {
      request.result = database;
      if (!stores.size && request.onupgradeneeded) request.onupgradeneeded();
      if (request.onsuccess) request.onsuccess();
    });
    return request;
  } };
}

function harness(indexedDB, failFetch = false) {
  const elements = new Map();
  const requests = [];
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, { value: id.includes('search-source') ? 'database' : id === 'store-select' ? 'all' : id === 'popup-meal-type' ? 'lunch' : '',
        innerHTML: '', textContent: '', innerText: '', style: {}, dataset: {},
        classList: { add(v) { classes.add(v); }, remove(v) { classes.delete(v); }, contains(v) { return classes.has(v); }, toggle(v, on) { if (on) classes.add(v); else classes.delete(v); } },
        addEventListener() {}, focus() {}, scrollIntoView() {} });
    }
    return elements.get(id);
  }
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: { getElementById: element, addEventListener() {} }, navigator: { onLine: true }, indexedDB,
    URL, Blob, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, Map, Set, Math, Date, JSON, Object, Array, String, Number, RegExp,
    prompt: () => '150', fetch: async url => {
      requests.push(url); if (failFetch) throw new Error('offline');
      assert.equal(url, './nutrition/data/uk-foods-2021.json', 'owned search must not call a third-party food API');
      return { ok: true, json: async () => data };
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const prelude = `
    let state = { customFoods: [], barcodeFoods: [], dailyMeals: [], nutritionHistory: [], createdMeals: [], goals: { calories: 2500 }, viewDate: '2026-09-29' };
    let currentFoodItem = null, currentAmountType = 'portion', mealIngredients = [];
    function nutritionNumber(value) { const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : 0; }
    function toFiniteNumber(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
    function isPlainRecord(value) { return value && typeof value === 'object' && !Array.isArray(value); }
    function safeImageUrl(value) { return value || ''; }
    function safeJsonForInline(value) { return JSON.stringify(value).replace(/'/g, '\\\\u0027'); }
    function escapeJsString(value) { return String(value).replace(/'/g, '\\\\u0027'); }
    function refreshIcons() {} function canManageFoodDatabase() { return false; }
    function showToast() {} function saveState() {} function autoSaveNutrition() {}
    function renderNutritionHistory() {} function renderDashboard() {}
  `;
  const source = ['nutrition/food-catalog.js', 'nutrition/meal-planner.js', 'nutrition/scanner.js'].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  vm.createContext(sandbox);
  vm.runInContext(prelude + source + `\n globalThis.test = {
    ensureVfitFoodCatalog, decodeVfitFoodCatalog, openVfitFoodCatalogDatabase, readVfitFoodCatalog, storeVfitFoodCatalog,
    getVfitDatabaseFoods, queryVfitDatabaseFoods, foodNutrientsPer100g, openFoodPopupCustom, setAmountType,
    addFoodItem, editLoggedFood, searchFood, searchIngredient, findCachedBarcodeFood, getRecentFoods, addIngredient,
    getState() { return state; }, getIngredients() { return mealIngredients; }, persistent() { return vfitFoodCatalogPersistent; }
  };`, sandbox);
  return { app: sandbox.test, element, requests, sandbox };
}

(async () => {
  assert.equal(data.foodCount, 2853);
  assert.equal(data.foodCount + data.excludedIncompleteFoods.length, data.sourceFoodCount);
  assert.equal(data.source.license, 'Open Government Licence v3.0');
  const indexedDB = fakeIndexedDb();
  const first = harness(indexedDB);
  const catalog = await first.app.ensureVfitFoodCatalog();
  assert.equal(catalog.length, 2853);
  assert.equal(new Set(catalog.map(food => food.id)).size, catalog.length);
  assert.equal(first.app.persistent(), true);
  assert.equal(catalog.filter(food => food.sourceCode === '13-669').length, 2);
  const watercress = catalog.find(food => food.name === 'Watercress, raw');
  const aubergine = catalog.find(food => food.name === 'Aubergine, flesh and skin, roasted in rapeseed oil');
  assert.notEqual(watercress.id, aubergine.id);
  assert.notEqual(watercress.sodiumMg, aubergine.sodiumMg, 'mineral rows must join by name and code');
  const chicken = catalog.find(food => food.name === 'Chicken, breast, grilled without skin, meat only');
  assert.equal(chicken.calories, 148); assert.equal(chicken.protein, 32); assert.equal(chicken.carbs, 0); assert.equal(chicken.fat, 2.2);
  assert.ok(first.app.queryVfitDatabaseFoods('chicken breast').foods.some(food => food.id === chicken.id));
  assert.ok(first.app.queryVfitDatabaseFoods('rice raw').foods.every(food => /raw/i.test(food.name)));
  const firstPage = first.app.queryVfitDatabaseFoods('', { page: 1, pageSize: 40 });
  const nextPage = first.app.queryVfitDatabaseFoods('', { page: 2, pageSize: 40 });
  assert.equal(firstPage.total, 2853); assert.equal(firstPage.foods.length, 40);
  assert.ok(!firstPage.foods.some(a => nextPage.foods.some(b => a.id === b.id)));
  assert.ok(first.app.queryVfitDatabaseFoods('', { filter: 'high-protein' }).foods.every(food => first.app.foodNutrientsPer100g(food).protein >= 15));
  first.app.openFoodPopupCustom(chicken); first.app.setAmountType('grams');
  first.element('popup-custom-weight').value = '150'; first.app.addFoodItem();
  const logged = first.app.getState().dailyMeals[0];
  assert.equal(logged.calories, 222); assert.equal(logged.protein, 48); assert.ok(Math.abs(logged.fat - 3.3) < 1e-8); assert.equal(logged.catalogId, chicken.id);
  first.app.editLoggedFood(logged.id); assert.equal(first.element('popup-custom-weight').value, 150);
  const wine = catalog.find(food => food.name === 'Wine, white, dry');
  assert.equal(wine.basisUnit, 'ml'); first.app.openFoodPopupCustom(wine); first.app.setAmountType('grams');
  first.element('popup-custom-weight').value = '150'; first.app.addFoodItem();
  const drink = first.app.getState().dailyMeals[1];
  assert.equal(drink.calories, 112.5); assert.equal(drink.basisUnit, 'ml'); assert.equal(first.element('popup-custom-weight-unit').textContent, 'ml');
  assert.equal(first.app.getRecentFoods(10).find(food => food.catalogId === wine.id).basisUnit, 'ml');
  first.app.addIngredient({ name: chicken.name, cal: chicken.calories, protein: chicken.protein, carbs: chicken.carbs, fat: chicken.fat });
  assert.equal(first.app.getIngredients()[0].protein, 48);
  first.app.getState().customFoods.push({ id: 'test-food', name: 'VFIT Test Food', brand: 'Tesco', serving: '50g', servingGrams: 50, calories: 100, protein: 10, carbs: 12, fat: 1, barcode: '5012345678900' });
  assert.equal(first.app.findCachedBarcodeFood('5012345678900').protein, 20);
  assert.equal(first.app.queryVfitDatabaseFoods('vfit test', { store: 'tesco' }).total, 1);
  first.sandbox.navigator.onLine = false;
  await first.app.searchFood('chicken breast', 1); assert.ok(first.element('search-results-list').innerHTML.includes('Chicken'));
  await first.app.searchIngredient('chicken breast'); assert.ok(first.element('meal-search-results').innerHTML.includes('Chicken'));
  assert.equal(first.requests.length, 1, 'subsequent searches use owned records');
  const reopened = harness(indexedDB, true);
  assert.equal((await reopened.app.ensureVfitFoodCatalog()).length, 2853); assert.equal(reopened.requests.length, 0, 'offline reopening must not fetch');
  const database = await first.app.openVfitFoodCatalogDatabase(); indexedDB.failWrite();
  await assert.rejects(first.app.storeVfitFoodCatalog(database, catalog.slice(0, 10)), /quota/);
  const afterAbort = await first.app.readVfitFoodCatalog(database);
  assert.equal(afterAbort.foods.length, 2853); assert.equal(afterAbort.meta.count, 2853);
  const fallback = harness(undefined);
  assert.equal((await fallback.app.ensureVfitFoodCatalog()).length, 2853); assert.equal(fallback.app.persistent(), false);
  const invalid = structuredClone(data); invalid.foods[0][invalid.columns.indexOf('calories')] = null;
  assert.throws(() => first.app.decodeVfitFoodCatalog(invalid), /nutrition is missing/);
  console.log('VFIT food database passed: 2,853 records, offline reopen, diary, portions, ingredients, barcode lookup and atomic import.');
})().catch(error => { console.error(error); process.exitCode = 1; });
