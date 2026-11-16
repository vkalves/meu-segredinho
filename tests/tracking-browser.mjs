// Run with the local server started on TRACKING_TEST_URL (default port 3100).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import assert from 'node:assert/strict';
const base=process.env.TRACKING_TEST_URL || 'http://localhost:3100';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage({viewport:{width:1280,height:850}});
  await page.route("https://**", route => route.abort());
  const recorded=[];
  let failReport=false;
  const report={summary:{views:3,clicks:1,visitors:2,clickedVisitors:1},countries:[{country:'ES',visitors:2,views:3,clicks:1}],visitors:[{visitor_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',country:'ES',city:'Madrid',region:'MD',locale:'es',utm_source:'instagram',utm_campaign:'campaign <script>alert(1)</script>',last_seen:'2026-11-16T12:00:00Z',views:2,clicks:1}]};
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/session')return route.fulfill({json:{user:{id:'test',name:'Privame',email:'test@example.com'}}});
    if(url.pathname==='/api/tracking/sites')return route.fulfill({json:{sites:[{slug:'juju',name:'Juju',path:'/juju'}]}});
    if(url.pathname==='/api/tracking/report')return route.fulfill(failReport?{status:503,json:{error:'Unavailable'}}:{json:{report}});
    if(url.pathname==='/api/tracking/event'){recorded.push(route.request().postDataJSON());return route.fulfill({status:202,json:{ok:true}});}
    return route.fulfill({json:{pages:[]}});
  });
  await page.goto(base+'/dashboard#tracking');
  await page.getByRole('heading',{name:'Visitantes recentes',exact:true}).waitFor();
  assert.equal(await page.locator('.tracking-table tbody tr').count(),1);
  assert.ok((await page.locator('.tracking-table').innerText()).includes('Madrid'));
  assert.ok((await page.locator('.tracking-table').innerText()).includes('campaign <script>'));
  assert.equal(await page.locator('.tracking-table script').count(),0);
  await page.locator('select[name="days"]').selectOption('30');
  const request=page.waitForRequest(r=>r.url().includes('/api/tracking/report?')&&r.url().includes('days=30'));
  await page.getByRole('button',{name:'Atualizar',exact:true}).click(); await request;
  await page.getByRole('heading',{name:'Visitantes recentes',exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.locator('.tracking-table-wrap').evaluate(el=>el.scrollWidth>el.clientWidth));
  failReport=true;
  await page.getByRole('button',{name:'Atualizar',exact:true}).click();
  await page.getByRole('heading',{name:'Não foi possível carregar o rastreamento',exact:true}).waitFor();
  failReport=false;
  await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
  await page.getByRole('heading',{name:'Visitantes recentes',exact:true}).waitFor();
  await page.goto(base+'/juju/?utm_source=instagram&utm_campaign=test');
  await page.waitForFunction(()=>!!localStorage.getItem('privame-juju-visitor'));
  const click=page.waitForRequest(r=>r.url().endsWith('/api/tracking/event')&&r.postDataJSON()?.type==='click');
  await page.locator('#telegramBtn').click({ force:true }); await click;
  assert.equal(recorded.filter(e=>e.type==='view').length,1);
  assert.equal(recorded.filter(e=>e.type==='click').length,1);
  assert.equal(recorded[0].visitorId,recorded[1].visitorId);
  assert.equal(recorded[0].source,'instagram');
  console.log('Passed: private dashboard rendering, hostile campaign escaping, filters, mobile table, failure/retry, visit and click collection.');
} finally { await browser.close(); }
