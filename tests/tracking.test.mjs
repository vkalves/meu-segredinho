import test from 'node:test';
import assert from 'node:assert/strict';
import { trackingEvent } from '../lib/tracking.mjs';
import { handleApi } from '../lib/api-handler.mjs';
const payload = { site: 'juju', eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', visitorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', type: 'view', source:'instagram', campaign:'campaign', referrer:'https://example.com/private?token=not-stored' };
const cookie = 'privame_session=' + Buffer.from(JSON.stringify({ accessToken:'test-session', refreshToken:'test-refresh' })).toString('base64url');

test('coarse location comes from server headers; IP, referrer paths and browser location are excluded', () => {
  const request = new Request('https://privame.test/api/tracking/event', { headers: { 'x-vercel-ip-country':'ES','x-vercel-ip-city':'M%C3%A1laga','x-vercel-ip-country-region':'AN','x-forwarded-for':'192.0.2.1' } });
  const result=trackingEvent(request,{...payload,country:'US',city:'Fake city',latitude:1,source:'a'.repeat(200)});
  assert.equal(result.country,'ES'); assert.equal(result.city,'Málaga'); assert.equal(result.locale,'es');
  assert.equal(result.referrer_host,'example.com'); assert.equal(result.utm_source.length,100);
  assert.ok(!JSON.stringify(result).includes('192.0.2.1')); assert.ok(!JSON.stringify(result).includes('not-stored')); assert.ok(!('latitude' in result));
  assert.equal(trackingEvent(request,{...payload,site:'bianca',locale:'pt-BR'}).site_id,'bianca');
  assert.throws(()=>trackingEvent(request,{...payload,site:'../dashboard'}));
  assert.throws(()=>trackingEvent(request,{...payload,eventId:'invalid'}));
});

test('collection, deduplication and authenticated reports', async () => {
  const originalFetch=globalThis.fetch;
  const originalUrl=process.env.SUPABASE_URL, originalKey=process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL='https://database.test'; process.env.SUPABASE_PUBLISHABLE_KEY='publishable-test';
  let duplicate=false, missingSite=false, sites=[{slug:'juju',name:'Juju',path:'/juju'}], recorded, reportCalls=0;
  globalThis.fetch=async (url,options={})=>{
    if(url.endsWith('/auth/v1/user')) return Response.json({id:'11111111-1111-4111-8111-111111111111',email:'test@example.com'});
    if(url.includes('/tracking_sites?')) { assert.equal(options.headers.get('Authorization'),'Bearer test-session'); return Response.json(sites); }
    if(url.endsWith('/tracking_events')) {
      assert.equal(options.headers.get('Authorization'),null);
      recorded=JSON.parse(options.body);
      if (missingSite) return Response.json({code:'23503',message:'site not installed'},{status:409});
      return duplicate?Response.json({code:'23505',message:'duplicate event'},{status:409}):new Response(null,{status:201});
    }
    if(url.endsWith('/rpc/get_tracking_report')) { reportCalls++; return Response.json({summary:{views:1},countries:[],visitors:[]}); }
    throw new Error('Unexpected request '+url);
  };
  try {
    const send=()=>handleApi(new Request('https://privame.test/api/tracking/event',{method:'POST',headers:{origin:'https://privame.test','content-type':'application/json','x-vercel-ip-country':'SA'},body:JSON.stringify(payload)}));
    assert.equal((await send()).status,202); assert.equal(recorded.locale,'ar');
    duplicate=true; assert.equal((await send()).status,202);
    missingSite=true; assert.equal((await send()).status,409); missingSite=false;
    assert.equal((await handleApi(new Request('https://privame.test/api/tracking/report'))).status,401);
    assert.equal((await handleApi(new Request('https://privame.test/api/tracking/report?site=juju',{headers:{cookie}}))).status,200);
    assert.equal(reportCalls,1);
    sites=[];
    assert.equal((await handleApi(new Request('https://privame.test/api/tracking/report?site=juju',{headers:{cookie}}))).status,404);
    assert.equal(reportCalls,1);
    assert.equal((await handleApi(new Request('https://privame.test/api/tracking/event',{method:'POST',headers:{origin:'https://foreign.test'},body:JSON.stringify(payload)}))).status,403);
  } finally { globalThis.fetch=originalFetch; if(originalUrl===undefined)delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=originalUrl; if(originalKey===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY=originalKey; }
});
