import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const source=file=>process.env.SECURITY_BASELINE?execFileSync('git',['show',process.env.SECURITY_BASELINE+':'+file],{encoding:'utf8'}):fs.readFileSync(file,'utf8');
function worker(fetchImpl=async()=>new Response('public')) {
  const handlers={},writes=[],removed=[],waits=[];
  const scope='https://app.example/dashboard/';
  const cache={put:async(key)=>writes.push(typeof key==='string'?key:key.url),match:async()=>new Response('offline'),delete:async key=>removed.push(typeof key==='string'?key:key.url)};
  const c=vm.createContext({URL,Response,Request,Headers,Set,
    self:{registration:{scope},location:{origin:'https://app.example'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},
    caches:{open:async()=>cache,keys:async()=>['unrelated-app-cache','ai-value-chain-shell-v4'],delete:async name=>removed.push(name),match:cache.match},fetch:fetchImpl,
  });vm.runInContext(source('sw.js'),c);
  async function dispatch(request){let response;handlers.fetch({request,respondWith:r=>response=r,waitUntil:p=>waits.push(p)});if(response)await response;await Promise.all(waits);return response;}
  return {handlers,writes,removed,waits,dispatch};
}
test('APIs, private routes, query variants and authenticated assets bypass worker caches',async()=>{
  const w=worker();
  for(const path of ['/api/quotes','/api/private','/account','/dashboard/private','/dashboard/index.html?token=fixture']){
    assert.equal(await w.dispatch(new Request('https://app.example'+path)),undefined);
  }
  assert.equal(await w.dispatch(new Request('https://app.example/dashboard/styles.css',{headers:{authorization:'Bearer fixture'}})),undefined);
  assert.equal(w.writes.length,0);
});
test('only public shell assets use credential-free requests and can be cached',async()=>{
  let init;const w=worker(async(_request,options)=>{init=options;return new Response('public');});
  await w.dispatch(new Request('https://app.example/dashboard/styles.css'));
  assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(w.writes.length,1);
});
test('private/no-store responses evict stale copies and are never cached',async()=>{
  for(const policy of ['private, max-age=60','no-store']){
    const w=worker(async()=>new Response('private',{headers:{'cache-control':policy}}));
    await w.dispatch(new Request('https://app.example/dashboard/index.html'));
    assert.equal(w.writes.length,0);assert.equal(w.removed.length,1);
  }
});
test('activation preserves unrelated applications cache',async()=>{
  const w=worker();w.handlers.activate({waitUntil:p=>w.waits.push(p)});await Promise.all(w.waits);
  assert.deepEqual(w.removed,['ai-value-chain-shell-v4']);
});
test('offline application shell remains available',async()=>{
  const w=worker(async()=>{throw Error('offline');});
  assert.equal(await (await w.dispatch(new Request('https://app.example/dashboard/index.html'))).text(),'offline');
});
test('quote data and stored custom metrics are validated as untrusted input',()=>{
  const c=vm.createContext({window:{AI_CHAIN_DATA:{companies:[{ticker:'AAPL'}]}},document:{},localStorage:{getItem:()=>'{"bad":true}'},console});
  const code=source('app.js').replaceAll('\r\n','\n');
  const stop=code.lastIndexOf('  try {\n    init();');assert.ok(stop>0);
  vm.runInContext(code.slice(0,stop)+'globalThis.check={validQuotes,validMeta,customSPCXMetrics};})();',c);
  const quotes=c.check.validQuotes([{ticker:'__proto__',price:1,change:0,changePercent:0},{ticker:'AAPL',price:'<img>',change:0,changePercent:0}]);
  assert.deepEqual(Object.keys(quotes),[]);
  assert.equal(c.check.customSPCXMetrics().length,0);
  assert.equal(c.check.validQuotes([{ticker:'AAPL',price:200,change:1,changePercent:0.5}]).AAPL.price,200);
});
