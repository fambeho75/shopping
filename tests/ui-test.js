// Kör: python3 -m http.server 8971 (i repots rot), sedan node tests/ui-test.js
const PW = process.env.PW || '/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core';
const { chromium } = require(PW);
const URL = process.env.URL || 'http://localhost:8971/';
const SHOTS = process.env.SHOTS || '/workspace/inkopslista-shots';
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };

const FULL_RECIPE = {
  time: '30 min',
  servings: 2,
  ingredients: ['300 g kycklingfilé', '2 dl jasminris', '<b>broccoli</b>'],
  steps: ['Koka riset.', 'Skär kycklingen.', 'Woka allt.'],
};
const PARTIAL_RECIPE = { time: '15 min' };
const ING_ONLY = { ingredients: ['1 kg potatis', '  ', ''] };

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForSelector('.item');

  const secs = await p.$$eval('.section', s => s.map(x => x.dataset.name));
  assert(JSON.stringify(secs) === JSON.stringify(['Frukt och grönt','Bröd','Kött','Mejeri','Frys','Skafferi']), 'sex avdelningar i rätt ordning: ' + secs.join(', '));
  const n = await p.$$eval('.item', i => i.length);
  assert(n === 36, '36 varor renderade (' + n + ')');
  for (const name of ['Potatis mjölig klass 1','Jubileumsbröd, Östras','Köttbullar, Garant','Yoggi smaksatt yoghurt (ej laktosfri)','Kaptenens favoriter, Kapten','Havregryn, Garant']) {
    assert(await p.locator('.item .name', { hasText: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).count() === 1, 'vara finns: ' + name);
  }
  assert((await p.textContent('#title')) === 'Inköpslista · Vecka 48', 'rubrik med vecka');
  assert((await p.textContent('#count')).startsWith('0 av 36'), 'räknare 0 av 36');
  const h = await p.$eval('.item', e => e.getBoundingClientRect().height);
  assert(h >= 56, 'tryckyta ' + h + 'px');
  await p.screenshot({ path: SHOTS + '/list.png' });

  // Middagar utan recept: samma utseende och beteende som tidigare
  assert(await p.isHidden('#meals-list'), 'middagar hopfällda från start');
  await p.click('#meals-toggle');
  assert(await p.isVisible('#meals-list'), 'middagar fälls ut');
  assert(await p.$$eval('#meals-list > li', l => l.length) === 7, '7 middagar');
  assert(await p.$$eval('#meals-list > li', l => l.every(li => !li.classList.contains('has-recipe') && !li.querySelector('.meal-toggle') && !li.querySelector('.recipe'))), 'inga receptkontroller när recipe saknas');
  const mealH = await p.$eval('#meals-list > li', e => e.getBoundingClientRect().height);
  assert(mealH > 0, 'måltidsrad synlig ' + mealH + 'px');
  await p.screenshot({ path: SHOTS + '/meals-open.png' });
  await p.click('#meals-toggle');
  assert(await p.isHidden('#meals-list'), 'middagar fälls ihop');

  // Bocka av Potatis (första i Frukt och grönt)
  const sec = p.locator('.section[data-name="Frukt och grönt"]');
  const names = () => sec.locator('.item .name').allTextContents();
  await sec.locator('.item', { hasText: 'Potatis' }).click();
  let order = await names();
  assert(order[order.length - 1].includes('Potatis') && order[0].includes('Gul lök'), 'Potatis flyttad sist i sin avdelning');
  const color = await sec.locator('.item', { hasText: 'Potatis' }).locator('.name').evaluate(e => getComputedStyle(e).color + '|' + getComputedStyle(e).textDecorationLine);
  assert(color.startsWith('rgb(156, 163, 175)') && color.includes('line-through'), 'Potatis gråad: ' + color);
  assert((await p.locator('.section[data-name="Bröd"] .item').first().locator('.name').textContent()).includes('Jubileumsbröd'), 'andra avdelningar opåverkade');
  await sec.locator('.item', { hasText: 'Avokado' }).click();
  await p.locator('.section[data-name="Mejeri"] .item', { hasText: 'Mellanmjölk' }).click();
  assert((await p.textContent('#count')).startsWith('3 av 36'), 'räknare 3 av 36');
  await p.evaluate(() => { document.scrollingElement.scrollTop = 0; window.scrollTo(0, 0); });
  await p.waitForTimeout(300);
  await p.screenshot({ path: SHOTS + '/checked.png' });

  // Reload -> kvar
  await p.reload(); await p.waitForSelector('.item');
  assert(await sec.locator('.item', { hasText: 'Potatis' }).getAttribute('aria-checked') === 'true', 'bock kvar efter omladdning');
  order = await names();
  assert(order.slice(-2).join().includes('Potatis') && order.slice(-2).join().includes('Avokado'), 'avbockade fortfarande sist: ' + order.slice(-2));

  // Nollställ
  await p.click('#reset');
  assert(await p.locator('.item[aria-checked="true"]').count() === 0, 'Nollställ rensar alla bockar');
  assert((await names())[0].includes('Potatis'), 'ursprunglig ordning återställd');
  await p.reload(); await p.waitForSelector('.item');
  assert(await p.locator('.item[aria-checked="true"]').count() === 0, 'rensat även efter omladdning');

  // Ny lista -> bockar nollställs (samma vecka, ändrat innehåll)
  await sec.locator('.item', { hasText: 'Gurka' }).click();
  await p.route('**/list.json*', async r => {
    const res = await r.fetch(); const j = await res.json();
    j.sections[0].items.push({ name: 'Citron', qty: '1 st' });
    j.sections.push({ name: 'Hushåll', items: [{ name: 'Diskmedel' }] });
    r.fulfill({ response: res, json: j });
  });
  await p.reload(); await p.waitForSelector('.item');
  assert(await p.locator('.item[aria-checked="true"]').count() === 0, 'ändrad lista nollställer bockar');
  const secs2 = await p.$$eval('.section', s => s.map(x => x.dataset.name));
  assert(secs2[secs2.length - 1] === 'Hushåll', 'okänd avdelning visas sist');

  // --- Recept ---
  await p.unroute('**/list.json*');
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForSelector('.item');
  await sec.locator('.item', { hasText: 'Potatis' }).click();
  assert(await sec.locator('.item', { hasText: 'Potatis' }).getAttribute('aria-checked') === 'true', 'Potatis avbockad före recept-mock');
  const snapBefore = await p.evaluate(() => {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('inkopslista:')) o[k] = localStorage.getItem(k);
    }
    return o;
  });
  assert(Object.keys(snapBefore).length === 1, 'en lagringsnyckel före recept: ' + Object.keys(snapBefore).join());

  await p.route('**/list.json*', async r => {
    const res = await r.fetch(); const j = await res.json();
    j.meals[0].recipe = FULL_RECIPE;
    j.meals[1].recipe = PARTIAL_RECIPE;
    j.meals[2].recipe = ING_ONLY;
    j.meals[3].recipe = {};
    j.meals[4].recipe = { ingredients: [], steps: [], time: '  ' };
    j.meals[5].recipe = null;
    // meals[6] utan recipe-fält
    r.fulfill({ response: res, json: j });
  });
  await p.reload(); await p.waitForSelector('.item');

  assert(await sec.locator('.item', { hasText: 'Potatis' }).getAttribute('aria-checked') === 'true', 'bock kvar när recept lagts till');
  assert((await p.textContent('#count')).startsWith('1 av 36'), 'räknare oförändrad efter recept i listan');
  const snapAfter = await p.evaluate(() => {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('inkopslista:')) o[k] = localStorage.getItem(k);
    }
    return o;
  });
  assert(JSON.stringify(snapAfter) === JSON.stringify(snapBefore), 'samma localStorage-nyckel och värde när bara recept ändrats');

  await p.click('#meals-toggle');
  assert(await p.isVisible('#meals-list'), 'middagar fälls ut med recept');
  const flags = await p.$$eval('#meals-list > li', lis => lis.map(li => ({
    name: (li.querySelector('.meal') || {}).textContent,
    hasToggle: !!li.querySelector('.meal-toggle'),
    hasBody: !!li.querySelector('.recipe'),
  })));
  assert(flags[0].hasToggle && flags[1].hasToggle && flags[2].hasToggle, 'middagar med innehållsrikt recept är expanderbara');
  assert(!flags[3].hasToggle && !flags[4].hasToggle && !flags[5].hasToggle && !flags[6].hasToggle, 'tomt/ogiltigt/saknat recept är inte klickbart: ' + JSON.stringify(flags.slice(3)));
  assert(flags[3].name && flags[6].name, 'middagar utan recept visar fortfarande namn');

  const fullBtn = p.locator('#meals-list > li.has-recipe', { hasText: 'Kycklingwok' }).locator('.meal-toggle');
  const fullBody = p.locator('#recipe-0');
  const btnH = await fullBtn.evaluate(e => e.getBoundingClientRect().height);
  assert(btnH >= 48, 'receptets tryckyta ' + btnH + 'px');
  assert(await fullBody.isHidden(), 'fullt recept hopfällt från start');
  await fullBtn.click();
  assert(await fullBody.isVisible(), 'fullt recept fälls ut');
  assert(await fullBtn.getAttribute('aria-expanded') === 'true', 'aria-expanded true när recept är öppet');
  const fullText = await fullBody.textContent();
  assert(fullText.includes('Tid') && fullText.includes('30 min'), 'visar tid');
  assert(fullText.includes('2 portioner'), 'visar portioner');
  assert(fullText.includes('Ingredienser') && fullText.includes('300 g kycklingfilé') && fullText.includes('2 dl jasminris'), 'visar ingredienser');
  assert(fullText.includes('Gör så här') && fullText.includes('Koka riset.') && fullText.includes('Woka allt.'), 'visar steg');
  assert(await fullBody.locator('ol.recipe-steps > li').count() === 3, 'steg är numrerade i ol');
  // HTML i JSON ska visas som text, inte som markup
  assert(await fullBody.locator('b').count() === 0, 'ingen injicerad markup i receptet');
  assert(fullText.includes('<b>broccoli</b>'), 'HTML-tecken visas som text');
  await p.screenshot({ path: SHOTS + '/recipe-full.png' });

  // Fäll ihop igen
  await fullBtn.click();
  assert(await fullBody.isHidden(), 'fullt recept fälls ihop vid andra trycket');
  assert(await fullBtn.getAttribute('aria-expanded') === 'false', 'aria-expanded false när recept är stängt');

  // Partiellt recept: bara tid, inga övriga rubriker
  const partBtn = p.locator('#meals-list > li.has-recipe', { hasText: 'Pasta med fläskfärssås' }).locator('.meal-toggle');
  const partBody = p.locator('#recipe-1');
  await partBtn.click();
  assert(await partBody.isVisible(), 'partiellt recept fälls ut');
  const partText = await partBody.textContent();
  assert(partText.includes('Tid') && partText.includes('15 min'), 'partiellt recept visar tid');
  assert(!partText.includes('portioner') && !partText.includes('Ingredienser') && !partText.includes('Gör så här'), 'partiellt recept utelämnar saknade fält: ' + partText);
  await p.screenshot({ path: SHOTS + '/recipe-partial.png' });

  // Accordion: öppna ingrediens-only, partiellt ska stängas
  const ingBtn = p.locator('#meals-list > li.has-recipe', { hasText: 'Ugnsbakad fisk' }).locator('.meal-toggle');
  const ingBody = p.locator('#recipe-2');
  await ingBtn.click();
  assert(await ingBody.isVisible(), 'recept med bara ingredienser fälls ut');
  assert(await partBody.isHidden(), 'föregående recept stängs (dragspel)');
  const ingText = await ingBody.textContent();
  assert(ingText.includes('Ingredienser') && ingText.includes('1 kg potatis'), 'visar enda ingrediensen');
  assert(!ingText.includes('Tid') && !ingText.includes('portioner') && !ingText.includes('Gör så här'), 'utelämnar saknade fält i ingrediens-recept');

  // Bockar opåverkade av att öppna recept
  assert(await sec.locator('.item', { hasText: 'Potatis' }).getAttribute('aria-checked') === 'true', 'bock kvar efter att recept fällts ut');
  assert((await p.textContent('#count')).startsWith('1 av 36'), 'räknare oförändrad efter receptklick');

  // Panelens egen hopfällning fungerar fortfarande med öppet recept
  await p.click('#meals-toggle');
  assert(await p.isHidden('#meals-list'), 'middagar fälls ihop även med öppet recept');
  await p.click('#meals-toggle');
  assert(await p.isVisible('#meals-list'), 'middagar fälls ut igen');
  assert(await ingBody.isVisible(), 'öppet recept är kvar när panelen öppnas igen');

  assert(errs.length === 0, 'inga JS-fel ' + errs.join(';'));
  await b.close();
  console.log('ALLA TESTER OK');
})().catch(e => { console.error(e.message); process.exit(1); });
