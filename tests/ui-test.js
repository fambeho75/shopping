// Kör: python3 -m http.server 8971 (i repots rot), sedan node tests/ui-test.js
const PW = process.env.PW || '/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core';
const { chromium } = require(PW);
const URL = process.env.URL || 'http://localhost:8971/';
const SHOTS = process.env.SHOTS || '/workspace/inkopslista-shots';
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForSelector('.item');

  const secs = await p.$$eval('.section', s => s.map(x => x.dataset.name));
  assert(JSON.stringify(secs) === JSON.stringify(['Frukt och grönt','Bröd','Kött','Mejeri','Frys','Skafferi']), 'sex avdelningar i rätt ordning: ' + secs.join(', '));
  const n = await p.$$eval('.item', i => i.length);
  assert(n === 34, '34 varor renderade (' + n + ')');
  for (const name of ['Potatis','Tortillabröd','Bratwurst','Yoghurt','Sej','Havregryn']) {
    assert(await p.locator('.item .name', { hasText: new RegExp('^' + name + '$') }).count() === 1, 'vara finns: ' + name);
  }
  assert((await p.textContent('#title')) === 'Inköpslista · Vecka 47', 'rubrik med vecka');
  assert((await p.textContent('#count')).startsWith('0 av 34'), 'räknare 0 av 34');
  const h = await p.$eval('.item', e => e.getBoundingClientRect().height);
  assert(h >= 56, 'tryckyta ' + h + 'px');
  await p.screenshot({ path: SHOTS + '/list.png' });

  // Middagar
  assert(await p.isHidden('#meals-list'), 'middagar hopfällda från start');
  await p.click('#meals-toggle');
  assert(await p.isVisible('#meals-list'), 'middagar fälls ut');
  assert(await p.$$eval('#meals-list li', l => l.length) === 7, '7 middagar');
  await p.screenshot({ path: SHOTS + '/meals-open.png' });
  await p.click('#meals-toggle');
  assert(await p.isHidden('#meals-list'), 'middagar fälls ihop');

  // Bocka av Potatis (första i Frukt och grönt)
  const sec = p.locator('.section[data-name="Frukt och grönt"]');
  const names = () => sec.locator('.item .name').allTextContents();
  await sec.locator('.item', { hasText: 'Potatis' }).click();
  let order = await names();
  assert(order[order.length - 1] === 'Potatis' && order[0] === 'Gul lök', 'Potatis flyttad sist i sin avdelning');
  const color = await sec.locator('.item', { hasText: 'Potatis' }).locator('.name').evaluate(e => getComputedStyle(e).color + '|' + getComputedStyle(e).textDecorationLine);
  assert(color.startsWith('rgb(156, 163, 175)') && color.includes('line-through'), 'Potatis gråad: ' + color);
  assert(await p.locator('.section[data-name="Bröd"] .item').first().locator('.name').textContent() === 'Limpa', 'andra avdelningar opåverkade');
  await sec.locator('.item', { hasText: 'Bananer' }).click();
  await p.locator('.section[data-name="Mejeri"] .item', { hasText: 'Mjölk' }).click();
  assert((await p.textContent('#count')).startsWith('3 av 34'), 'räknare 3 av 34');
  await p.evaluate(() => { document.scrollingElement.scrollTop = 0; window.scrollTo(0, 0); });
  await p.waitForTimeout(300);
  await p.screenshot({ path: SHOTS + '/checked.png' });

  // Reload -> kvar
  await p.reload(); await p.waitForSelector('.item');
  assert(await sec.locator('.item', { hasText: 'Potatis' }).getAttribute('aria-checked') === 'true', 'bock kvar efter omladdning');
  order = await names();
  assert(order.slice(-2).join() === 'Potatis,Bananer', 'avbockade fortfarande sist: ' + order.slice(-2));

  // Nollställ
  await p.click('#reset');
  assert(await p.locator('.item[aria-checked="true"]').count() === 0, 'Nollställ rensar alla bockar');
  assert((await names())[0] === 'Potatis', 'ursprunglig ordning återställd');
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
  assert(errs.length === 0, 'inga JS-fel ' + errs.join(';'));
  await b.close();
  console.log('ALLA TESTER OK');
})().catch(e => { console.error(e.message); process.exit(1); });
