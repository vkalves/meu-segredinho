import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.TRACKING_TEST_URL||'http://127.0.0.1:3101';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();const events=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
  if(url.pathname==='/ajuju'||url.pathname==='/dashboard')return route.fulfill({contentType:'text/html',body:await readFile('dist/app-shell.html','utf8')});
  if(url.pathname==='/api/public/ajuju')return route.fulfill({json:{page:{slug:'ajuju',model:'profile',profileName:'Juju',title:'Test page',buttonLabel:'Open',avatarUrl:'',showOnline:false}}});
  if(url.pathname==='/api/session')return route.fulfill({json:{user:{id:'test',name:'Owner'}}});
  if(url.pathname==='/api/pages')return route.fulfill({json:{pages:[]}});
  if(url.pathname==='/api/tracking/event'){events.push(route.request().postDataJSON());return route.fulfill({status:202,json:{ok:true}});}
  return route.continue();
 });
 for(const [path,site] of [['/bianca/index.html','bianca'],['/juju/es.html','juju'],['/privame/index.html','privame'],['/ajuju','ajuju']]){
  const before=events.length;await page.goto(base+path,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.PrivameTracking);
  await page.waitForTimeout(100);
  assert.equal(events.length,before+1,`exactly one view at ${path}`);assert.equal(events.at(-1).site,site);
  if(site==='ajuju'){
   await page.locator('#telegramBtn').click({force:true,noWaitAfter:true});await page.waitForTimeout(100);
   assert.equal(events.at(-1).type,'click');assert.equal(events.at(-1).site,'ajuju');
  }
 }
 assert.equal(new Set(events.map(e=>e.visitorId)).size,1,'same visitor across sites');
 const before=events.length;await page.goto(base+'/dashboard',{waitUntil:'domcontentloaded'});await page.waitForTimeout(100);assert.equal(events.length,before,'private dashboard is not tracked');
 assert.equal(errors.length,0,JSON.stringify(errors));
 console.log('Passed: legacy pages, Juju Spanish, institutional page, dynamic profile, outbound click, shared visitor, private exclusion.');
}finally{await browser.close();}
