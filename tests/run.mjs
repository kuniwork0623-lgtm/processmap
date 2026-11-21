// ProcessMap regression tests (Playwright, no install needed in Claude Code cloud).
// All Supabase traffic is intercepted by an in-memory mock: tests NEVER touch the production DB.
//   npm test                 -> run against local files (http://127.0.0.1:4173)
//   BASE_URL=https://... npm test -> run against a preview deployment (still mocked Supabase)
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {serve} from './serve.mjs';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/node-tools/node_modules/playwright')}
const {chromium}=playwright;

const SUPA='https://xgeviftkyrxhqbpgpfea.supabase.co';
const USER={id:'00000000-0000-4000-8000-000000000001',email:'mock-user@example.test'};
const OTHER={id:'00000000-0000-4000-8000-000000000002',email:'other@example.test'};
const base=process.env.BASE_URL||'http://127.0.0.1:4173/';
const results=[];let server=null;

function doc(title='サーバーの工程'){return {schemaVersion:7,appearance:{canvas:'#0e131b',task:'#202c3a'},processedKeys:[],stages:[{id:'s1',title,collapsed:false,tasks:[{id:'t1',text:'子A',done:false,collapsed:false,children:[{id:'g1',text:'孫A',done:false,collapsed:false,children:[]}]}]}]}}

// In-memory Supabase mock with per-user rows (models RLS: a user only sees their own row).
function mockSupabase(){
  const db=new Map();const calls=[];let online=true;
  async function handler(route){
    const req=route.request(),url=new URL(req.url());calls.push(req.method()+' '+url.pathname);
    if(!online)return route.abort('internetdisconnected');
    const auth=req.headers()['authorization']||'';const uid=auth.includes('mock-token-')?auth.split('mock-token-')[1]:null;
    if(url.pathname.startsWith('/auth/v1/user'))return route.fulfill({json:{id:uid,email:uid===USER.id?USER.email:OTHER.email,aud:'authenticated',role:'authenticated'}});
    if(url.pathname.startsWith('/auth/v1/logout'))return route.fulfill({status:204,body:''});
    if(url.pathname.startsWith('/auth/v1/'))return route.fulfill({status:400,json:{error:'mock'}});
    if(url.pathname==='/rest/v1/processmap_documents'&&req.method()==='GET'){
      const asked=(url.searchParams.get('user_id')||'').replace('eq.','');
      const row=uid&&asked===uid?db.get(uid):null; // RLS emulation
      const objectAccept=(req.headers()['accept']||'').includes('vnd.pgrst.object');
      if(objectAccept)return row?route.fulfill({json:{document:row.document,revision:row.revision}}):route.fulfill({status:406,json:{code:'PGRST116',details:'The result contains 0 rows',message:'JSON object requested, multiple (or no) rows returned'}});
      return route.fulfill({json:row?[{document:row.document,revision:row.revision}]:[]});
    }
    if(url.pathname==='/rest/v1/rpc/save_processmap_document'){
      if(!uid)return route.fulfill({status:401,json:{message:'not authenticated'}});
      const body=JSON.parse(req.postData()||'{}');const row=db.get(uid)||{revision:0};
      if(body.p_expected_revision!==row.revision)return route.fulfill({status:400,json:{code:'P0001',message:'REVISION_CONFLICT'}});
      db.set(uid,{document:body.p_document,revision:row.revision+1});return route.fulfill({json:[{new_revision:row.revision+1}]});
    }
    return route.fulfill({status:404,json:{message:'mock: unhandled '+url.pathname}});
  }
  return {db,calls,handler,setOnline:v=>{online=v}};
}
function session(user){return JSON.stringify({access_token:'mock-token-'+user.id,refresh_token:'r',token_type:'bearer',expires_in:36000,expires_at:Math.floor(Date.now()/1000)+36000,user:{id:user.id,email:user.email,aud:'authenticated',role:'authenticated'}})}

async function newPage(browser,{mobile=false,mock=mockSupabase(),user=null,storage=null}={}){
  const ctx=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}:{viewport:{width:1440,height:900}});
  await ctx.route(/supabase\.co/,mock.handler); // block every real Supabase request
  await ctx.addInitScript(([key,value,extra])=>{if(sessionStorage.getItem('__seeded'))return;sessionStorage.setItem('__seeded','1');if(value)localStorage.setItem(key,value);for(const [k,v] of extra||[])localStorage.setItem(k,v)},['sb-xgeviftkyrxhqbpgpfea-auth-token',user?session(user):null,storage]);
  const page=await ctx.newPage();page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));
  page.on('dialog',d=>d.accept());
  await page.goto(base);await page.waitForSelector('.stage');
  return {ctx,page,mock};
}
const state=page=>page.evaluate(()=>window.pmApp.get());
// Opens a card's ⋯ menu and runs one action (data-act).
async function menu(page,taskId,act){const card=page.locator(`[data-task-node="${taskId}"] > .task-card`);await card.hover();await card.locator('.more').click();await page.click(`#cardMenu [data-act="${act}"]`)}
async function typeEnd(page,loc,text){await loc.click();await page.keyboard.press('End');await page.keyboard.press('Control+End');await page.keyboard.type(text);await page.locator('.brand').click()}
const status=page=>page.locator('#syncStatus').textContent();
async function waitStatus(page,text,ms=8000){await page.waitForFunction(t=>document.getElementById('syncStatus').textContent.includes(t),text,{timeout:ms})}

async function test(name,fn){
  if(process.env.TEST_FILTER&&!name.includes(process.env.TEST_FILTER))return;
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
  try{await fn(browser);results.push(['PASS',name]);console.log('PASS',name)}
  catch(e){results.push(['FAIL',name,e.message]);console.log('FAIL',name,'\n   ',e.message.split('\n').slice(0,4).join('\n    '))}
  finally{await browser.close()}
}

// ---------- UI / 操作 ----------
await (async()=>{if(!process.env.BASE_URL)server=await serve(4173)})();

for(const mobile of [false,true]){
  const label=mobile?'[SP]':'[PC]';
  await test(label+' 初期表示でJSエラーなし・3階層の表示',async b=>{const {page}=await newPage(b,{mobile});
    assert.equal(await page.locator('.stage').count(),3);assert.ok(await page.locator('.task-children .task-node').count()>=1);assert.deepEqual(page.errors,[]);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,'ページ全体が横にはみ出しています')});

  await test(label+' Tab: メイン→子タスクの入力欄を作り編集開始',async b=>{const {page}=await newPage(b,{mobile});
    const title=page.locator('.stage').nth(1).locator('.stage-title');await title.click();await page.keyboard.press('Tab');
    const draft=page.locator('.stage').nth(1).locator('.draft-input');await draft.waitFor();
    assert.equal(await draft.evaluate(e=>e===document.activeElement),true,'入力欄にフォーカスがありません');
    await page.keyboard.type('Tabで追加した子');await page.keyboard.press('Enter');
    const s=await state(page);assert.equal(s.stages[1].tasks.at(-1).text,'Tabで追加した子')});

  await test(label+' Tab: 子→孫タスク、孫ではTabで4階層目を作らない',async b=>{const {page}=await newPage(b,{mobile});
    const child=page.locator('.stage').nth(1).locator('.task-text').first();await child.click();await page.keyboard.press('Tab');
    const draft=page.locator('.grand-draft .draft-input');await draft.waitFor();await page.keyboard.type('Tabで追加した孫');await page.keyboard.press('Enter');
    let s=await state(page);assert.equal(s.stages[1].tasks[0].children.at(-1).text,'Tabで追加した孫');
    const grand=page.locator('.stage').nth(1).locator('.task-children .task-text').first();await grand.click();await page.keyboard.press('Tab');
    await page.waitForTimeout(150);assert.equal(await page.locator('.draft-row').count(),0,'孫で入力欄が作られました')});

  await test(label+' Tab: IME変換中のTabは追加しない',async b=>{const {page}=await newPage(b,{mobile});
    const title=page.locator('.stage-title').first();await title.click();
    await title.evaluate(e=>e.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true,isComposing:true,keyCode:229})));
    await page.waitForTimeout(100);assert.equal(await page.locator('.draft-row').count(),0)});

  await test(label+' URL: http/httpsは別タブリンク、危険なスキーム・HTMLはリンク化しない',async b=>{const {page,ctx}=await newPage(b,{mobile});
    await page.evaluate(()=>{const s=window.pmApp.get();s.stages[0].tasks[0].text='資料 https://example.com/a?b=1 と javascript:alert(1) <img src=x onerror=alert(2)>';window.pmApp.set(s)});
    const link=page.locator('.task-link').first();assert.equal(await page.locator('.task-link').count(),1);
    assert.equal(await link.getAttribute('href'),'https://example.com/a?b=1');assert.equal(await link.getAttribute('target'),'_blank');assert.equal(await link.getAttribute('rel'),'noopener noreferrer');
    assert.equal(await page.locator('.task-text img').count(),0,'HTMLが挿入されました');
    await ctx.route('https://example.com/**',r=>r.fulfill({body:'ok'}));
    const [popup]=await Promise.all([ctx.waitForEvent('page'),mobile?link.tap():link.click()]);await popup.waitForURL('https://example.com/a?b=1');
    assert.equal(new URL(page.url()).pathname,'/','元のタブが遷移しました');
    const s=await state(page);assert.ok(s.stages[0].tasks[0].text.includes('<img'),'保存本文がテキストのままではありません')});
}

await test('[PC] URL: Alt+クリックでURL部分を編集でき、保存はテキストのまま',async b=>{const {page}=await newPage(b);
  await page.evaluate(()=>{const s=window.pmApp.get();s.stages[0].tasks[0].text='https://example.com';window.pmApp.set(s)});
  await page.locator('.task-link').first().click({modifiers:['Alt']});await page.keyboard.type('/x');await page.locator('.brand').click();
  const s=await state(page);assert.equal(s.stages[0].tasks[0].text,'https://example.com/x')});

await test('[PC] 完了の集約: 孫を全部完了→子が完了、子が全部完了→メインが完了',async b=>{const {page}=await newPage(b);
  // stage 1: t1 (leaf done), t2 (tc1 done, tc2 not), t3 leaf
  await page.locator('[data-task-node="tc2"] .task-checkbox').click();let s=await state(page);
  assert.equal(s.stages[0].tasks[1].done,true,'孫が全部完了しても子が完了になりません');assert.equal(s.stages[0].done,false);
  await page.locator('[data-task-node="t3"] .task-checkbox').click();s=await state(page);assert.equal(s.stages[0].done,true,'メインが完了になりません');
  await page.locator('.stage').nth(2).locator('.task-checkbox').first().click();s=await state(page);assert.equal(s.stages[2].done,true,'子のないメインを直接チェックできません')});

await test('[PC] 削除→Ctrl+Zで復元、改行(Alt+Enter)・空欄の保持',async b=>{const {page}=await newPage(b);
  await menu(page,'t3','delete');
  assert.equal((await state(page)).stages[0].tasks.length,2);await page.locator('.brand').click();await page.keyboard.press('Control+z');
  assert.equal((await state(page)).stages[0].tasks.length,3,'Ctrl+Zで戻りません');
  const t=page.locator('[data-task-node="t1"] .task-text');await t.click();await page.keyboard.press('End');await page.keyboard.press('Alt+Enter');await page.keyboard.type('二行目');
  await page.locator('.brand').click();assert.equal((await state(page)).stages[0].tasks[0].text,'参考になるデザインを集める\n二行目');
  await page.locator('[data-task-node="t3"] .task-text').click();await page.keyboard.press('Enter');await page.locator('.brand').click();
  assert.equal((await state(page)).stages[0].tasks[3].text,'','空欄タスクが保持されません')});

await test('[PC] 子タスクにホバーしても下のタスクが動かない',async b=>{const {page}=await newPage(b);
  const below=page.locator('[data-task-node="t3"] .task-card');const y0=(await below.boundingBox()).y;
  await page.locator('[data-task-node="t2"] > .task-card').hover();await page.waitForTimeout(250);
  assert.equal((await below.boundingBox()).y,y0);await page.locator('[data-task-node="tc1"] .task-card').hover();await page.waitForTimeout(250);assert.equal((await below.boundingBox()).y,y0)});

await test('[操作性] ホバー時の操作ボタンが文字に重ならない（長いタスク名）',async b=>{const {page}=await newPage(b);
  await page.evaluate(()=>{const s=window.pmApp.get();s.stages[0].tasks[0].text='参考になるデザインを集めるための資料を整理してまとめる';s.stages[0].tasks[0].width=260;window.pmApp.set(s)});
  const card=page.locator('[data-task-node="t1"] > .task-card');await card.hover();await page.waitForTimeout(250);
  const text=await card.locator('.task-text').boundingBox(),act=await card.locator('.task-actions').boundingBox();
  assert.ok(text.x+text.width<=act.x+1,`文字(右端${Math.round(text.x+text.width)})とボタン(左端${Math.round(act.x)})が重なっています`);
  assert.equal(await card.locator('.task-actions button').count(),1,'ホバーで出るボタンは⋯の1つだけ')});

await test('[操作性][SP] スマホでも操作ボタンが文字に重ならない',async b=>{const {page}=await newPage(b,{mobile:true});
  await page.evaluate(()=>{const s=window.pmApp.get();s.stages[0].tasks[2].text='スマホで長いタスク名を入力したときの折り返しを確認する';window.pmApp.set(s)});
  const card=page.locator('[data-task-node="t3"] > .task-card'),box=await card.boundingBox();await page.touchscreen.tap(box.x+box.width/2,box.y+box.height-3);await page.waitForTimeout(250);
  const text=await card.locator('.task-text').boundingBox(),act=await card.locator('.task-actions').boundingBox();assert.ok(text.x+text.width<=act.x+1,'重なっています')});

await test('[操作性] 右クリック・⋯でメニュー、孫追加・完了・移動・削除ができる',async b=>{const {page}=await newPage(b);
  await page.locator('[data-task-node="t3"] > .task-card').click({button:'right'});await page.waitForSelector('#cardMenu:not([hidden])');
  await page.click('#cardMenu [data-act="done"]');assert.equal((await state(page)).stages[0].tasks[2].done,true);
  await menu(page,'t3','up');assert.equal((await state(page)).stages[0].tasks[1].id,'t3');
  await menu(page,'t3','add');await page.locator('.grand-draft .draft-input').waitFor();await page.keyboard.type('メニューで追加');await page.keyboard.press('Enter');
  assert.equal((await state(page)).stages[0].tasks[1].children[0].text,'メニューで追加');
  await page.keyboard.press('Escape');await page.locator('body').click({position:{x:5,y:5}});
  await page.locator('[data-task-node="tc1"] > .task-card').click({button:'right'});await page.click('#cardMenu [data-act="outdent"]');
  assert.ok((await state(page)).stages[0].tasks.some(t=>t.id==='tc1'),'子タスクに上がりません')});

await test('[操作性] キーボード: Ctrl+Enter完了・↓移動・Shift+Tab・Backspace削除・Esc・Ctrl+Shift+↓',async b=>{const {page}=await newPage(b);
  const t3=page.locator('[data-task-node="t3"] .task-text');await t3.click();await page.keyboard.press('Control+Enter');
  assert.equal((await state(page)).stages[0].tasks[2].done,true,'Ctrl+Enterで完了しません');
  await page.locator('[data-task-node="t1"] .task-text').click();await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement.closest('[data-task-node]')?.dataset.taskNode),'t2','↓で次のタスクへ移動しません');
  await page.locator('[data-task-node="tc2"] .task-text').click();await page.keyboard.press('Shift+Tab');
  let s=await state(page);assert.ok(s.stages[0].tasks.some(t=>t.id==='tc2'),'Shift+Tabで子に上がりません');
  await page.locator('[data-task-node="t3"] .task-text').click();await page.keyboard.press('End');await page.keyboard.press('Enter');
  const n=(await state(page)).stages[0].tasks.length;await page.keyboard.press('Backspace');assert.equal((await state(page)).stages[0].tasks.length,n-1,'空のタスクをBackspaceで消せません');
  await page.locator('[data-task-node="t1"] .task-text').click();await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('task-card')),true,'Escで編集が終わりません');
  await page.keyboard.press('Control+Shift+ArrowDown');assert.equal((await state(page)).stages[0].tasks[1].id,'t1','Ctrl+Shift+↓で下へ移動しません')});

await test('[操作性] 編集していないカードは文字の上からドラッグで移動できる',async b=>{const {page}=await newPage(b);
  const src=await page.locator('[data-task-node="t1"] .task-text').boundingBox(),dst=await page.locator('[data-task-node="t4"] .task-card').boundingBox();
  await page.mouse.move(src.x+30,src.y+src.height/2);await page.mouse.down();await page.mouse.move(src.x+40,src.y+30,{steps:3});
  await page.mouse.move(dst.x+dst.width/2,dst.y+dst.height-3,{steps:8});await page.mouse.up();
  assert.ok((await state(page)).stages[1].tasks.some(t=>t.id==='t1'),'文字の上から掴んで移動できません');
  await page.locator('[data-task-node="t4"] .task-text').click();assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('task-text')),true,'クリックで編集に入れません')});

await test('[PC] サイトのアイコン（ファビコン）が読み込める',async b=>{const {page}=await newPage(b);
  for(const sel of ['link[rel=icon]','link[rel=apple-touch-icon]']){const [status,size]=await page.evaluate(async s=>{const r=await fetch(document.querySelector(s).href,{cache:'no-store'});return [r.status,(await r.arrayBuffer()).byteLength]},sel);assert.equal(status,200,sel+' が読めません');assert.ok(size>200)}});

await test('[PC] ホイールはスクロール、Ctrl+ホイールでズーム',async b=>{const {page}=await newPage(b);
  await page.evaluate(()=>{const s=window.pmApp.get();for(let i=0;i<12;i++)s.stages[0].tasks.push({id:'w'+i,text:'行'+i,children:[]});window.pmApp.set(s)});
  await page.mouse.move(700,500);await page.mouse.wheel(0,400);await page.waitForTimeout(300);
  assert.equal(await page.textContent('#zoomLevel'),'100%','ホイールでズームしてしまいます');assert.ok(await page.evaluate(()=>document.getElementById('canvas').scrollTop)>0,'スクロールしません');
  await page.keyboard.down('Control');await page.mouse.wheel(0,-120);await page.keyboard.up('Control');await page.waitForTimeout(200);assert.equal(await page.textContent('#zoomLevel'),'110%')});

await test('[PC] 完了チェックの✓が箱の中央に描かれる',async b=>{const {page}=await newPage(b);
  const r=await page.locator('[data-task-node="t1"] .task-checkbox').evaluate(e=>{const a=getComputedStyle(e,'::after');return [a.position,a.content]});
  assert.deepEqual(r,['static','"✓"'])});

await test('[PC] ズーム: ＋／−／100%復帰',async b=>{const {page}=await newPage(b);
  await page.click('#zoomIn');assert.equal(await page.textContent('#zoomLevel'),'110%');await page.click('#zoomOut');await page.click('#zoomOut');assert.equal(await page.textContent('#zoomLevel'),'90%');
  await page.click('#zoomReset');assert.equal(await page.textContent('#zoomLevel'),'100%')});

await test('[PC] ドラッグで子タスクを別のメインへ移動（再所属）',async b=>{const {page}=await newPage(b);
  const src=await page.locator('[data-task-node="t1"] .task-card').boundingBox();const dst=await page.locator('[data-task-node="t4"] .task-card').boundingBox();
  await page.mouse.move(src.x+src.width/2,src.y+4);await page.mouse.down();await page.mouse.move(src.x+src.width/2,src.y+30,{steps:3});
  await page.mouse.move(dst.x+dst.width/2,dst.y+dst.height-3,{steps:8});await page.mouse.up();
  const s=await state(page);assert.equal(s.stages[1].tasks.some(t=>t.id==='t1'),true,'移動していません')});

await test('[PC] 配色の一括変更',async b=>{const {page}=await newPage(b);
  await page.click('#menuTrigger');await page.click('[data-menu="palette"]');await page.locator('#taskSwatches .palette-swatch').nth(2).click();
  assert.equal((await state(page)).appearance.task,'#273d3f')});

// ---------- 新機能 ----------
const PLAN_MD=`# ゲーム制作スケジュール
## 企画 @2026-12-05
- コンセプトを決める @2026-11-30
  - 参考作品を3つ遊ぶ
  - [x] ターゲットを書く
- 企画書を作る（期日：2026/12/5）
## 開発
1. **プロトタイプ** @2026-12-20
   1. 操作感を作る
2. 素材を作る
`;
await test('[新機能] AIの箇条書き(見出し・番号・字下げ・期日・[x])を3階層で読み取る',async b=>{const {page}=await newPage(b);
  const r=await page.evaluate(md=>{document.getElementById('planText').value=md;document.getElementById('planText').dispatchEvent(new Event('input'));return document.getElementById('planPreview').textContent},PLAN_MD);
  assert.ok(r.includes('メインタスク 2件'),r);
  await page.click('#menuTrigger');await page.click('[data-menu="plan"]');await page.fill('#planTheme','ゲーム');await page.fill('#planText',PLAN_MD);await page.click('#planCommit');
  const s=await state(page);assert.equal(s.sheets.length,2);assert.equal(s.activeSheetId,s.sheets[1].id);assert.equal(s.sheets[1].name,'ゲーム');
  const [a,d]=s.stages;assert.equal(a.title,'企画');assert.equal(a.due,'2026-12-05');assert.equal(a.tasks[0].text,'コンセプトを決める');assert.equal(a.tasks[0].due,'2026-11-30');
  assert.equal(a.tasks[0].children.length,2);assert.equal(a.tasks[0].children[1].done,true);assert.equal(a.tasks[1].text,'企画書を作る');assert.equal(a.tasks[1].due,'2026-12-05');
  assert.equal(d.tasks[0].text,'プロトタイプ');assert.equal(d.tasks[0].children[0].text,'操作感を作る');assert.equal(d.tasks[1].text,'素材を作る');
  await page.keyboard.press('Control+z');assert.equal((await state(page)).sheets.length,1,'Ctrl+Zで取り消せません')});

await test('[新機能] 見出しなしの字下げ箇条書き・JSONも読み取る、表示中シートへ追加',async b=>{const {page}=await newPage(b);
  await page.click('#menuTrigger');await page.click('[data-menu="plan"]');
  await page.fill('#planText','- A @2027-01-10\n  - A1\n    - A1a\n      - 深すぎ\n- B');await page.check('input[value="append"]');await page.click('#planCommit');
  let s=await state(page);assert.equal(s.sheets.length,1);const a=s.stages.at(-2);assert.equal(a.title,'A');assert.equal(a.tasks[0].children.map(c=>c.text).join(','),'A1a,深すぎ');assert.equal(s.stages.at(-1).title,'B');
  await page.click('#menuTrigger');await page.click('[data-menu="plan"]');await page.fill('#planText','[{"title":"J","due":"2027-02-01","tasks":[{"text":"J1","children":[{"text":"J1a"}]}]}]');await page.click('#planCommit');
  s=await state(page);assert.equal(s.stages.at(-1).title,'J');assert.equal(s.stages.at(-1).tasks[0].children[0].text,'J1a')});

await test('[新機能] 進捗表示（メインカードの n/m とシートタブの%）',async b=>{const {page}=await newPage(b);
  // sample: stage1 leaves = t1(done), tc1(done), tc2, t3 => 2/4
  assert.equal(await page.locator('.stage').first().locator('.stage-progress .count').textContent(),'2/4');
  assert.equal(await page.locator('.sheet-tab .pct').textContent(),'29%'); // 2/7: a main task without children counts as one leaf
  await page.locator('[data-task-node="tc2"] .task-checkbox').click();assert.equal(await page.locator('.stage').first().locator('.stage-progress .count').textContent(),'3/4')});

await test('[新機能] 期日・メモの設定、期限切れ表示、期日一覧から完了',async b=>{const {page}=await newPage(b);
  await menu(page,'t3','detail');
  await page.fill('#detailDue','2020-01-01');await page.fill('#detailNote','参考 https://example.com/doc');await page.click('#detailForm button[type=submit]');
  let s=await state(page);assert.equal(s.stages[0].tasks[2].due,'2020-01-01');assert.equal(s.stages[0].tasks[2].note,'参考 https://example.com/doc');
  assert.equal(await page.locator('[data-task-node="t3"] .due-chip.overdue').count(),1);assert.equal(await page.locator('[data-task-node="t3"] .note-chip').count(),1);
  await page.click('#menuTrigger');await page.click('[data-menu="due"]');assert.ok((await page.textContent('#dueList')).includes('期限切れ（1）'));
  await page.locator('#dueList .task-checkbox').first().click();s=await state(page);assert.equal(s.stages[0].tasks[2].done,true);
  await page.click('#dueClose');await page.locator('[data-task-node="t3"] .due-chip').click();await page.click('#detailClearDue');await page.click('#detailForm button[type=submit]');
  assert.equal((await state(page)).stages[0].tasks[2].due,null)});

await test('[新機能] 完了したタスクを隠す（再表示も可能）',async b=>{const {page}=await newPage(b);
  await page.click('#menuTrigger');await page.click('[data-menu="hidedone"]');assert.equal(await page.locator('[data-task-node="t1"]').isVisible(),false);
  assert.equal(await page.locator('[data-task-node="t3"]').isVisible(),true);await page.reload();await page.waitForSelector('.stage');assert.equal(await page.locator('[data-task-node="t1"]').isVisible(),false,'設定が保持されません');
  await page.click('#menuTrigger');await page.click('[data-menu="hidedone"]');assert.equal(await page.locator('[data-task-node="t1"]').isVisible(),true)});

await test('[新機能] AI更新のset_due・add_taskのdue、指示文がProcessMap向け',async b=>{const {page,ctx}=await newPage(b);
  await page.click('#menuTrigger');await page.click('[data-menu="ai"]');
  await page.fill('#aiText',JSON.stringify({source_key:'k1',updates:[{action:'set_due',taskId:'t4',due:'2027-03-01'},{action:'add_task',stageId:'s2',text:'新規',due:'2027-03-02'},{action:'set_due',stageId:'s1',due:'2027-03-03'}]}));
  await page.click('#aiPreview');await page.click('#aiCommit');const s=await state(page);
  assert.equal(s.stages[1].tasks[0].due,'2027-03-01');assert.equal(s.stages[1].tasks.at(-1).due,'2027-03-02');assert.equal(s.stages[0].due,'2027-03-03');
  await ctx.grantPermissions(['clipboard-read','clipboard-write']);await page.click('#menuTrigger');await page.click('[data-menu="prompt"]');
  const clip=await page.evaluate(()=>navigator.clipboard.readText());assert.ok(clip.includes('ProcessMap')&&!clip.includes('常夜'),'指示文に常夜の名残があります');assert.ok(clip.includes('期日 2027-03-01'))});

await test('[新機能][SP] スマホで削除×は選択したカードだけに出る',async b=>{const {page}=await newPage(b,{mobile:true});
  const op=n=>page.locator(`[data-task-node="${n}"] > .task-card .task-actions`).evaluate(e=>getComputedStyle(e).opacity);
  assert.equal(await op('t3'),'0');const box=await page.locator('[data-task-node="t3"] .task-card').boundingBox();await page.touchscreen.tap(box.x+box.width/2,box.y+box.height-3);await page.waitForTimeout(250);assert.equal(await op('t3'),'1');assert.equal(await op('t1'),'0')});

// ---------- 秘書（スケジュール管理の仕組み） ----------
const sec=page=>page.locator('#secText').textContent();
async function setDeadline(page,d){await page.evaluate(d=>{const s=window.pmApp.get();s.sheets.find(x=>x.id===s.activeSheetId).goal={deadline:d,text:''};window.pmApp.set(s)},d)}
const plusDays=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};

await test('[秘書] 状況に応じて次の指示が変わる（締切→見直し→次のタスク）',async b=>{const {page}=await newPage(b);
  assert.ok((await sec(page)).includes('締切が決まっていません'));assert.equal(await page.textContent('#secAction'),'締切を決める');
  await page.click('#secAction');await page.fill('#sheetDeadline',plusDays(60));await page.click('#sheetForm button[type=submit]');
  assert.ok((await sec(page)).includes('見直し'),'締切設定後に見直しを促しません');
  await page.click('#secAction');for(let i=0;i<3;i++)await page.click('#reviewNext');await page.click('#reviewNext');
  const s=await state(page);const sh=s.sheets.find(x=>x.id===s.activeSheetId);assert.ok(sh.lastReview,'見直し日が記録されません');assert.ok(sh.revisions[0].request==='週の見直し');
  assert.ok((await sec(page)).includes('次はこれ'),'見直し後に次のタスクを指示しません：'+await sec(page));
  await page.click('#secAction');await page.waitForTimeout(400);assert.ok(await page.evaluate(()=>document.querySelector('.selected')!==null),'このタスクへ で移動しません')});

await test('[秘書] 思いついた→あとで箱→見直しで仕分け（あったら良い・捨てる）',async b=>{const {page}=await newPage(b);await setDeadline(page,plusDays(60));
  await page.click('#captureOpen');await page.fill('#captureText','BGMを入れる');await page.keyboard.press('Enter');await page.fill('#captureText','やっぱり不要なもの');await page.keyboard.press('Enter');
  assert.equal(await page.textContent('#inboxCount'),'2');await page.click('#captureClose');
  await page.click('#menuTrigger');await page.click('[data-menu="review"]');await page.click('#reviewNext');
  const rows=page.locator('#reviewBody .review-row');await rows.nth(0).locator('select').nth(0).selectOption('s2');await rows.nth(0).locator('select').nth(1).selectOption('nice');await rows.nth(1).locator('select').nth(0).selectOption('drop');
  await page.click('#reviewNext');await page.click('#reviewNext');await page.click('#reviewNext');
  const s=await state(page),sh=s.sheets.find(x=>x.id===s.activeSheetId),added=s.stages[1].tasks.find(t=>t.text==='BGMを入れる');
  assert.ok(added&&added.nice&&added.changes[0].t==='added','あったら良いとして追加されません');assert.equal(sh.inbox.length,0);assert.ok(!JSON.stringify(s.sheets.map(x=>x.stages)).includes('やっぱり不要'),'捨てた項目がタスクになっています');assert.ok(sh.revisions[0].lines.some(l=>l.includes('捨てた：やっぱり不要')));
  assert.equal(await page.locator('[data-task-node="'+added.id+'"] .chg-chip.added').count(),1,'新規のハイライトが出ません');
  await page.locator('[data-task-node="'+added.id+'"] .chg-chip').click();assert.equal((await state(page)).stages[1].tasks.find(t=>t.id===added.id).changes.length,0,'ハイライトを確認済みにできません')});

await test('[秘書] 間に合わない見込みを警告し、あったら良いに回すと解消',async b=>{const {page}=await newPage(b);
  await page.evaluate(d=>{const s=window.pmApp.get();const sh=s.sheets.find(x=>x.id===s.activeSheetId);sh.goal={deadline:d,text:''};sh.lastReview=new Date().toISOString().slice(0,10);
    const ago=new Date();ago.setDate(ago.getDate()-3);s.stages[0].tasks[0].doneAt=ago.toISOString().slice(0,10); // pace: 1 per 14 days
    for(let i=0;i<6;i++)s.stages[1].tasks.push({id:'x'+i,text:'作業'+i,children:[]});window.pmApp.set(s)},plusDays(20));
  assert.ok((await sec(page)).includes('間に合いません'),'遅れ警告が出ません：'+await sec(page));assert.equal(await page.getAttribute('#secretary','data-tone'),'alert');
  await page.click('#secAction');assert.ok((await page.textContent('#reviewStep')).startsWith('3.'));
  for(const cb of await page.locator('#reviewBody .review-row input').all())await cb.check();
  assert.ok((await page.textContent('#reviewBody .forecast')).includes('必須タスクはすべて完了')||(await page.textContent('#reviewBody .forecast')).includes('間に合います'),'調整後の見込みが更新されません');
  await page.click('#reviewNext');await page.click('#reviewNext');const s=await state(page);assert.ok(s.stages[1].tasks.every(t=>t.nice),'あったら良いに回りません')});

await test('[秘書] 完了日を記録（過去の完了は不明扱い）・今週は5個まで',async b=>{const {page}=await newPage(b);
  let s=await state(page);assert.equal(s.stages[0].tasks[0].doneAt,'','既存の完了は不明扱いのはず');
  await page.locator('[data-task-node="t3"] .task-checkbox').click();s=await state(page);assert.equal(s.stages[0].tasks[2].doneAt,new Date().toLocaleDateString('sv-SE'));
  await page.locator('[data-task-node="t3"] .task-checkbox').click();assert.equal((await state(page)).stages[0].tasks[2].doneAt,null);
  await page.evaluate(()=>{const s=window.pmApp.get();for(let i=0;i<8;i++)s.stages[2].tasks.push({id:'w'+i,text:'w'+i,children:[]});window.pmApp.set(s)});
  await page.click('#menuTrigger');await page.click('[data-menu="review"]');for(let i=0;i<3;i++)await page.click('#reviewNext');
  for(const cb of await page.locator('#reviewBody .review-row input').all())await cb.click();
  assert.equal(await page.locator('#reviewBody .review-row input:checked').count(),5,'5個を超えて選べます')});

const AI_REPLY=(ids)=>`1. 状況の整理
- 遅れているので「試して改善する」は後回しにします
- 新しく「仕様書を書く」を追加

${'---工程表---'}
- 画面を作る @2027-01-31 #s1
  - [x] 完了済みの名前をAIが書き換えた @2027-05-05 #t1
  - AIと相談して方向性を決める #t2
    - [x] 候補を整理する #tc1
    - ★ 決定事項を確認する @2026-12-24 #tc2
- 内容を詰める #s2
  - ★ 必要な機能を整理する（名前を変更） #t4
  - 試して改善する（あったら良い） #t5
  - ★ 仕様書を書く @2026-12-20
- デザインを整える #s3
`;
await test('[秘書] AIに相談：相談文にIDと完了印、返答を差分で反映（完了は不変・保持）',async b=>{const {page,ctx}=await newPage(b);await setDeadline(page,plusDays(60));
  await ctx.grantPermissions(['clipboard-read','clipboard-write']);
  await page.click('#menuTrigger');await page.click('[data-menu="consult"]');await page.locator('#consultChips button').first().click();await page.click('#consultCopy');
  const prompt=await page.evaluate(()=>navigator.clipboard.readText());assert.ok(prompt.includes('#t1')&&prompt.includes('[x] 参考になるデザインを集める')&&prompt.includes('---工程表---')&&prompt.includes('締切：'),'相談文に必要な情報がありません');
  await page.fill('#consultReply',AI_REPLY());await page.waitForSelector('#consultPreview .diff-row');
  const pv=await page.textContent('#consultPreview');assert.ok(pv.includes('追加 1')&&pv.includes('削除 1')&&pv.includes('名称変更 1'),'プレビュー：'+pv);
  await page.click('#consultCommit');const s=await state(page);const st0=s.stages[0];
  const t1=st0.tasks.find(t=>t.id==='t1');assert.equal(t1.text,'参考になるデザインを集める','完了済みの名前が変わりました');assert.equal(t1.done,true);
  assert.ok(st0.tasks.some(t=>t.id==='t3')===false,'未完了で外れたt3が残っています');
  assert.equal(st0.due,'2027-01-31');assert.ok(st0.changes.some(c=>c.t==='due'));
  const t4=s.stages[1].tasks.find(t=>t.id==='t4');assert.equal(t4.text,'必要な機能を整理する（名前を変更）');assert.ok(t4.star&&t4.changes.some(c=>c.t==='renamed'));
  assert.ok(s.stages[1].tasks.find(t=>t.id==='t5').nice);const nw=s.stages[1].tasks.find(t=>t.text==='仕様書を書く');assert.ok(nw&&nw.star&&nw.due==='2026-12-20'&&nw.changes[0].t==='added');
  const sh=s.sheets.find(x=>x.id===s.activeSheetId);assert.ok(sh.revisions[0].lines.some(l=>l.includes('[removed]')),'履歴に削除が残りません');
  assert.ok(await page.locator('.task-card.changed').count()>=3,'ハイライトされません');
  await page.click('#menuTrigger');await page.click('[data-menu="history"]');assert.ok((await page.textContent('#historyList')).includes('遅れていて'));await page.click('#historyClose');
  await page.click('#menuTrigger');await page.click('[data-menu="clearmarks"]');assert.equal(await page.locator('.task-card.changed').count(),0)});

await test('[秘書] AIの案から完了済みが消えても残す・「未完了も残す」指定',async b=>{const {page}=await newPage(b);
  await page.click('#menuTrigger');await page.click('[data-menu="consult"]');
  await page.fill('#consultReply','---工程表---\n- 内容を詰める #s2\n  - 必要な機能を整理する #t4\n');await page.waitForSelector('#consultPreview .diff-row');
  await page.check('#consultKeepOpen');await page.waitForTimeout(100);await page.click('#consultCommit');let s=await state(page);
  assert.ok(s.stages.some(x=>x.id==='s1')&&s.stages.find(x=>x.id==='s1').tasks.some(t=>t.id==='t3'),'未完了も残す指定が効きません');
  await page.keyboard.press('Control+z');await page.click('#menuTrigger');await page.click('[data-menu="consult"]');
  await page.fill('#consultReply','---工程表---\n- 内容を詰める #s2\n');await page.waitForSelector('#consultPreview .diff-row');await page.click('#consultCommit');s=await state(page);
  const s1=s.stages.find(x=>x.id==='s1');assert.ok(s1,'完了を含むメインが消えました');assert.ok(s1.tasks.some(t=>t.id==='t1'&&t.done),'完了済みタスクが消えました');
  assert.ok(s1.tasks.find(t=>t.id==='t2').children.some(c=>c.id==='tc1'&&c.done),'完了済みの孫が消えました');assert.ok(!s1.tasks.some(t=>t.id==='t3'),'未完了が残っています');
  assert.ok(!s.stages.some(x=>x.id==='s3'),'空の未完了メインが残っています')});

await test('[秘書] このチャットから段取りを作る指示文・締切つき登録',async b=>{const {page,ctx}=await newPage(b);await ctx.grantPermissions(['clipboard-read','clipboard-write']);
  await page.click('#menuTrigger');await page.click('[data-menu="plan"]');assert.ok((await page.textContent('#planSteps')).includes('いつも使っているAIチャット'));
  await page.fill('#planTheme','ゲーム');await page.fill('#planDeadline','2027-03-31');await page.click('#planCopy');const p=await page.evaluate(()=>navigator.clipboard.readText());
  assert.ok(p.includes('このチャットでこれまで話した内容')&&p.includes('締切：2027-03-31')&&p.includes('（あったら良い）')&&p.includes('★'));
  await page.fill('#planText','- 企画 @2027-01-10\n  - ★ 企画書（あったら良い）\n  - [x] アイデア出し\n  - 仕様を決める');await page.click('#planCommit');
  const s=await state(page),sh=s.sheets.find(x=>x.id===s.activeSheetId);assert.equal(sh.goal.deadline,'2027-03-31');const t=s.stages[0].tasks;
  assert.ok(t[0].star&&t[0].nice&&t[0].text==='企画書');assert.ok(t[1].done&&t[1].doneAt==='');assert.ok((await sec(page)).includes('見直し'),'登録後の指示：'+await sec(page))});

await test('[秘書][SP] スマホで秘書バー・困ったとき・思いついたボタンが使える',async b=>{const {page}=await newPage(b,{mobile:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'横にはみ出しています');
  await page.locator('#secToggle').tap();await page.locator('.help-item summary').first().tap();await page.locator('.help-item[open] button').first().tap();
  assert.ok(await page.locator('#captureDialog[open]').count()===1,'困ったとき→あとで箱が開きません');await page.fill('#captureText','スマホで思いついた');await page.locator('#captureForm button[type=submit]').tap();
  assert.equal(await page.textContent('#inboxCount'),'1')});

// ---------- 認証・同期（モック） ----------
await test('[同期] ログイン済みでサーバーの工程表を読み込み、編集をrevision付きで保存',async b=>{
  const mock=mockSupabase();mock.db.set(USER.id,{document:doc(),revision:5});const {page}=await newPage(b,{mock,user:USER});
  await waitStatus(page,'保存済み');assert.equal((await state(page)).stages[0].title,'サーバーの工程');
  await typeEnd(page,page.locator('.stage-title').first(),'X');
  await waitStatus(page,'保存済み');await page.waitForFunction(()=>true);
  await page.waitForTimeout(1200);assert.equal(mock.db.get(USER.id).revision,6);assert.equal(mock.db.get(USER.id).document.stages[0].title,'サーバーの工程X')});

await test('[同期] 2端末の双方向同期（同一ユーザー）',async b=>{
  const mock=mockSupabase();mock.db.set(USER.id,{document:doc(),revision:1});
  const A=await newPage(b,{mock,user:USER});const B=await newPage(b,{mock,user:USER});await waitStatus(A.page,'保存済み');await waitStatus(B.page,'保存済み');
  await typeEnd(A.page,A.page.locator('.stage-title').first(),'A');
  await B.page.waitForFunction(()=>window.pmApp.get().stages[0].title.endsWith('A'),null,{timeout:10000});
  await typeEnd(B.page,B.page.locator('.stage-title').first(),'B');
  await A.page.waitForFunction(()=>window.pmApp.get().stages[0].title.endsWith('AB'),null,{timeout:10000})});

await test('[同期] 同時更新は黙って上書きせず競合ダイアログを出す',async b=>{
  const mock=mockSupabase();mock.db.set(USER.id,{document:doc(),revision:1});const {page}=await newPage(b,{mock,user:USER});await waitStatus(page,'保存済み');
  mock.setOnline(false);await typeEnd(page,page.locator('.stage-title').first(),'L');
  await page.waitForTimeout(1500);mock.db.set(USER.id,{document:doc('他端末の変更'),revision:2});mock.setOnline(true);
  await page.waitForSelector('#conflictDialog[open]',{timeout:8000});assert.equal(mock.db.get(USER.id).document.stages[0].title,'他端末の変更','サーバーが上書きされました')});

await test('[同期] 通信断で「未同期」表示、復旧後に内容を失わず保存',async b=>{
  const mock=mockSupabase();mock.db.set(USER.id,{document:doc(),revision:1});const {page}=await newPage(b,{mock,user:USER});await waitStatus(page,'保存済み');
  mock.setOnline(false);await typeEnd(page,page.locator('.stage-title').first(),'オフライン編集');
  await waitStatus(page,'未同期');mock.setOnline(true);await waitStatus(page,'保存済み',10000);
  assert.ok(mock.db.get(USER.id).document.stages[0].title.endsWith('オフライン編集'))});

await test('[同期] 別ユーザーの行は取得されない（RLS相当のモック）',async b=>{
  const mock=mockSupabase();mock.db.set(OTHER.id,{document:doc('他人の工程'),revision:3});mock.db.set(USER.id,{document:doc('自分の工程'),revision:1});
  const {page}=await newPage(b,{mock,user:USER});await waitStatus(page,'保存済み');assert.equal((await state(page)).stages[0].title,'自分の工程');
  const q=mock.calls.filter(c=>c.includes('processmap_documents'));assert.ok(q.length>0)});

await test('[同期] 期日・メモがサーバーに保存され別端末で読める／接続不可でメニューに目印',async b=>{
  const mock=mockSupabase();mock.db.set(USER.id,{document:doc(),revision:1});const A=await newPage(b,{mock,user:USER});await waitStatus(A.page,'保存済み');
  await menu(A.page,'t1','detail');await A.page.fill('#detailDue','2027-01-05');await A.page.fill('#detailNote','メモ');await A.page.click('#detailForm button[type=submit]');
  await waitStatus(A.page,'保存済み');await A.page.waitForTimeout(1200);const B=await newPage(b,{mock,user:USER});await waitStatus(B.page,'保存済み');
  const t=(await state(B.page)).stages[0].tasks[0];assert.equal(t.due,'2027-01-05');assert.equal(t.note,'メモ');
  mock.setOnline(false);await typeEnd(B.page,B.page.locator('.stage-title').first(),'z');await waitStatus(B.page,'接続できません',10000);
  assert.equal(await B.page.locator('#menuTrigger[data-alert]').count(),1,'同期異常の目印が出ません');mock.setOnline(true);await waitStatus(B.page,'保存済み',10000);assert.equal(await B.page.locator('#menuTrigger[data-alert]').count(),0)});

await test('[同期] あとで箱・締切・今週★が別端末に同期される',async b=>{
  const mock=mockSupabase();mock.db.set(USER.id,{document:doc(),revision:1});const A=await newPage(b,{mock,user:USER});await waitStatus(A.page,'保存済み');
  await A.page.click('#captureOpen');await A.page.fill('#captureText','同期テスト');await A.page.keyboard.press('Enter');await A.page.click('#captureClose');
  await A.page.click('#sheetOptions');await A.page.fill('#sheetDeadline','2027-02-01');await A.page.click('#sheetForm button[type=submit]');
  await menu(A.page,'t1','star');await waitStatus(A.page,'保存済み');await A.page.waitForTimeout(1500);
  const B=await newPage(b,{mock,user:USER});await waitStatus(B.page,'保存済み');const s=await state(B.page),sh=s.sheets.find(x=>x.id===s.activeSheetId);
  assert.equal(sh.inbox[0].text,'同期テスト');assert.equal(sh.goal.deadline,'2027-02-01');assert.equal(s.stages[0].tasks[0].star,true)});

await test('[同期] 再読み込みを繰り返しても端末保存(localStorage)が増え続けない',async b=>{
  const mock=mockSupabase();mock.db.set(USER.id,{document:doc(),revision:1});const {page}=await newPage(b,{mock,user:USER});await waitStatus(page,'保存済み');
  for(let i=0;i<5;i++){await page.reload();await waitStatus(page,'保存済み')}
  const n=await page.evaluate(id=>Object.keys(localStorage).filter(k=>k.startsWith('processmap_user_'+id)&&!k.endsWith('_meta')).length,USER.id);
  assert.ok(n<=1,'工程表のコピーが '+n+' 個に増えています')});

await test('[同期] 掃除しても未同期(dirty)の端末コピーは消さない',async b=>{
  const mock=mockSupabase();mock.db.set(USER.id,{document:doc(),revision:1});
  const k='processmap_user_'+USER.id+'_orphan-dirty',c='processmap_user_'+USER.id+'_orphan-clean';
  const {page}=await newPage(b,{mock,user:USER,storage:[[k,JSON.stringify(doc('未同期の別タブ'))],[k+'_meta','{"revision":1,"dirty":true}'],[c,JSON.stringify(doc('同期済み'))],[c+'_meta','{"revision":1,"dirty":false}']]});
  await waitStatus(page,'保存済み');
  const left=await page.evaluate(([k,c])=>[localStorage.getItem(k)!==null,localStorage.getItem(c)!==null],[k,c]);
  assert.deepEqual(left,[true,false],'dirtyコピーが消えた、または同期済みコピーが残った')});

await test('[同期] 端末の保存容量が満杯でもサーバー同期は止まらない',async b=>{
  const mock=mockSupabase();mock.db.set(USER.id,{document:doc(),revision:1});const {page}=await newPage(b,{mock,user:USER});await waitStatus(page,'保存済み');
  // Simulate a full device storage (QuotaExceededError) for the app's document keys.
  await page.evaluate(()=>{const orig=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(String(k).startsWith('processmap_'))throw new DOMException('full','QuotaExceededError');return orig.call(this,k,v)}});
  await typeEnd(page,page.locator('.stage-title').first(),'容量');await page.waitForTimeout(2500);
  assert.ok(mock.db.get(USER.id).document.stages[0].title.endsWith('容量'),'端末保存の失敗でサーバー同期も止まりました')});

// ---------- マインドマップ ----------
async function addMindSheet(page){
  await page.locator('#addSheet').click();
  await page.locator('#addMindSheet').click();
  await page.locator('.mind-node.root .mind-title').waitFor();
}

const mindTitle=(page,title)=>page.getByRole('group',{name:title,exact:true}).locator('.mind-title');
const mindRoot=page=>page.getByRole('textbox',{name:'中心テーマ',exact:true});
const activeMindTitle=page=>page.locator('.mind-title:focus');
const mindStoragePrefix='__processmap_mindmaps_v1__:';
const readMindMaps=doc=>{
  const entry=doc.processedKeys.find(key=>key.startsWith(mindStoragePrefix));
  return entry?JSON.parse(entry.slice(mindStoragePrefix.length)).maps:[];
};

const sampleMindXml=`<?xml version="1.0" encoding="UTF-8"?>
<map version="1.0.1">
  <node ID="ID_ROOT" TEXT="展示の計画 &amp; メモ">
    <node ID="ID_RIGHT" TEXT="準備 " POSITION="right" STYLE="bubble">
      <node ID="ID_CHILD" TEXT="会場&amp;機材" STYLE="fork" LINK="https://example.test/check">
        <richcontent TYPE="NOTE"><html><body><p>確認事項</p><p>備品<br/>持ち物</p><script>window.importScriptRan=true</script></body></html></richcontent>
        <node ID="ID_FOLDED" TEXT="見積もり" FOLDED="true">
          <node ID="ID_EMPTY" TEXT="" STYLE="fork" LINK="javascript:window.importScriptRan=true"/>
        </node>
      </node>
    </node>
    <node ID="ID_LEFT" POSITION="left" STYLE="bubble">
      <richcontent TYPE="NODE"><html><body><p>公開日</p></body></html></richcontent>
    </node>
  </node>
</map>`;
async function openMindImport(page){
  await page.locator('#addSheet').click();
  await page.locator('#importMindSheet').click();
}
function chooseMindFile(page,buffer){
  return page.locator('#mindImportFile').setInputFiles({name:'sample.mm',mimeType:'application/x-freemind',buffer:Buffer.from(buffer)});
}

await test('[マインドマップ][.mm][同期] 階層・順番・折りたたみ・メモ・左右・外観を引き継ぐ',async browser=>{
  const mock=mockSupabase();mock.db.set(USER.id,{document:doc(),revision:1});
  const {page:a}=await newPage(browser,{mock,user:USER});
  const {page:b}=await newPage(browser,{mobile:true,mock,user:USER});
  await waitStatus(a,'保存済み');await waitStatus(b,'保存済み');
  const original=(await state(a)).sheets;
  await openMindImport(a);
  await chooseMindFile(a,sampleMindXml);
  await a.getByText('展示の計画 & メモ（6トピック・5階層）',{exact:true}).waitFor();
  assert.deepEqual((await state(a)).sheets,original);
  assert.equal(await a.locator('#mindImportNotice').isVisible(),true);
  await a.locator('#mindImportCommit').click();
  await waitStatus(a,'保存済み');
  const imported=await state(a), [{root}]=readMindMaps(imported);
  assert.deepEqual(imported.sheets,original);
  assert.equal(root.id,'ID_ROOT');
  assert.deepEqual(root.children.map(({id,text,side,shape})=>({id,text,side,shape})),[
    {id:'ID_RIGHT',text:'準備 ',side:'right',shape:'bubble'},
    {id:'ID_LEFT',text:'公開日',side:'left',shape:'bubble'},
  ]);
  const child=root.children[0].children[0];
  assert.equal(child.text,'会場&機材');
  assert.equal(child.shape,'fork');
  assert.equal(child.note,'確認事項\n備品\n持ち物');
  assert.equal(child.children[0].folded,true);
  assert.equal(child.children[0].children[0].text,'');
  assert.equal(await a.locator('[data-mind-id="ID_EMPTY"]').count(),0);
  const childCard=a.locator('[data-mind-id="ID_CHILD"]');
  assert.equal(await childCard.getAttribute('data-shape'),'fork');
  await childCard.locator('.mind-note-chip').click();
  assert.equal(await a.locator('#mindNoteLink a').getAttribute('href'),'https://example.test/check');
  assert.equal(await a.locator('#mindNoteInput').inputValue(),child.note);
  await a.locator('#mindNoteCancel').click();
  await a.locator('[data-mind-id="ID_FOLDED"] .mind-fold').click();
  await a.locator('[data-mind-id="ID_EMPTY"] .mind-note-chip').click();
  assert.equal(await a.locator('#mindNoteLink a').count(),0);
  assert.equal(await a.locator('#mindNoteLink').textContent(),'javascript:window.importScriptRan=true');
  assert.equal(await a.evaluate(()=>window.importScriptRan),undefined);
  await a.locator('#mindNoteCancel').click();
  await waitStatus(a,'保存済み');
  const saved=readMindMaps(await state(a));
  await a.reload();
  await mindRoot(a).waitFor();
  assert.deepEqual(readMindMaps(await state(a)),saved);
  await b.getByRole('tab',{name:/展示の計画/}).tap();
  assert.deepEqual(readMindMaps(await state(b)),saved);
  assert.equal(await b.locator('[data-mind-id="ID_LEFT"]').getAttribute('data-left'),'');
  assert.equal(await b.locator('[data-mind-id="ID_RIGHT"]').getAttribute('data-left'),null);
  // Earlier clients rewrite the node tree without the three new optional fields.
  const olderDocument=await state(a);
  const index=olderDocument.processedKeys.findIndex(key=>key.startsWith(mindStoragePrefix));
  const written=JSON.parse(olderDocument.processedKeys[index].slice(mindStoragePrefix.length));
  const pending=written.maps.map(map=>map.root);
  while(pending.length){
    const node=pending.pop();
    delete node.side;
    delete node.shape;
    delete node.link;
    pending.push(...node.children);
  }
  olderDocument.processedKeys[index]=mindStoragePrefix+JSON.stringify(written);
  await a.evaluate(document=>pmApp.set(document),olderDocument);
  assert.deepEqual(readMindMaps(await state(a)),saved);
  assert.deepEqual([...a.errors,...b.errors],[]);
});

await test('[マインドマップ][.mm][SP] 読み込めない形式と上限を案内し、確定までは追加しない',async browser=>{
  const {page}=await newPage(browser,{mobile:true});
  const original=await state(page);
  await openMindImport(page);
  const invalidFiles=[
    {xml:'<map><node TEXT="未終了">',message:'中心トピックが1つある'},
    {xml:'<map><node/><node/></map>',message:'中心トピックが1つある'},
    {xml:'<!DOCTYPE map SYSTEM "https://example.test/sample.dtd"><map><node/></map>',message:'外部定義'},
    {xml:'<map>'+('<node>'.repeat(34))+('</node>'.repeat(34))+'</map>',message:'33階層まで'},
    {xml:'<map><node>'+('<node/>'.repeat(500))+'</node></map>',message:'500件まで'},
  ];
  for(const {xml,message} of invalidFiles){
    await chooseMindFile(page,xml);
    await page.locator('#mindImportStatus[data-error]').filter({hasText:message}).waitFor();
    assert.equal(await page.locator('#mindImportCommit').isDisabled(),true);
    assert.deepEqual(await state(page),original);
  }
  const utf16=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('<map><node TEXT="スマホで取り込む"/></map>','utf16le')]);
  await chooseMindFile(page,utf16);
  await page.getByText('スマホで取り込む（1トピック・1階層）',{exact:true}).waitFor();
  await page.locator('#mindImportCancel').tap();
  assert.deepEqual(await state(page),original);
  await openMindImport(page);
  assert.equal(await page.locator('#mindImportCommit').isDisabled(),true);
  await chooseMindFile(page,utf16);
  await page.getByText('スマホで取り込む（1トピック・1階層）',{exact:true}).waitFor();
  await page.locator('#mindImportCommit').tap();
  assert.equal(await mindRoot(page).inputValue(),'スマホで取り込む');
  assert.deepEqual(page.errors,[]);
});

await test('[マインドマップ][PC] Tab/Enter・IME・深い枝・折りたたみからメモ検索',async browser=>{
  const {page}=await newPage(browser);
  const original=(await state(page)).stages;
  await addMindSheet(page);
  assert.equal(await page.locator('#secretary').isVisible(),false);
  assert.equal(await mindRoot(page).evaluate(input=>input===document.activeElement),true);
  await mindRoot(page).fill('次回の展示');
  await page.keyboard.press('Tab');
  await activeMindTitle(page).fill('会場');
  await page.keyboard.press('Enter');
  await activeMindTitle(page).fill('告知');
  for(const text of ['写真','撮影の候補','雨天時','代替案']){
    await page.keyboard.press('Tab');
    await activeMindTitle(page).fill(text);
  }
  const count=await page.locator('.mind-node').count();
  await activeMindTitle(page).evaluate(input=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true,isComposing:true})));
  assert.equal(await page.locator('.mind-node').count(),count);
  await page.locator('#mindNoteOpen').click();
  await page.locator('#mindNoteInput').fill('ホールの屋内許可を確認\n見学できる日も聞く');
  await page.locator('#mindNoteForm button[type=submit]').click();
  const text=readMindMaps(await state(page))[0].root;
  assert.equal(text.children[0].text,'会場');
  assert.equal(text.children[1].children[0].children[0].children[0].children[0].text,'代替案');
  const branch=page.getByRole('group',{name:'告知',exact:true});
  await branch.locator('.mind-fold').click();
  assert.equal(await mindTitle(page,'代替案').count(),0);
  await page.locator('#mindReviewOpen').click();
  await page.locator('#mindSearch').fill('屋内許可');
  const result=page.getByRole('button',{name:'代替案を表示',exact:true});
  assert.match(await result.innerText(),/ホールの屋内許可/);
  await result.click();
  const selected=page.locator('.mind-node[data-selected]');
  assert.equal(await selected.locator('.mind-title').inputValue(),'代替案');
  await selected.getByRole('button',{name:'このトピックのメモを開く'}).click();
  assert.equal(await page.locator('#mindNoteInput').inputValue(),'ホールの屋内許可を確認\n見学できる日も聞く');
  await page.locator('#mindNoteCancel').click();
  await page.reload();
  assert.equal(await mindRoot(page).inputValue(),'次回の展示');
  await page.getByRole('tab',{name:/シート1/}).click();
  assert.deepEqual((await state(page)).stages,original);
  assert.equal(await page.locator('#secretary').isVisible(),true);
  assert.deepEqual(page.errors,[]);
});

await test('[マインドマップ][SP] タップで枝・同列を追加し、枝を移動して全体を表示',async browser=>{
  const {page}=await newPage(browser,{mobile:true});
  await addMindSheet(page);
  await mindRoot(page).fill('週末に作りたいもの');
  await page.locator('#mindAdd').tap();await activeMindTitle(page).fill('準備');
  await page.locator('#mindSibling').tap();await activeMindTitle(page).fill('参考');
  await page.locator('#mindMore').tap();
  await page.locator('#mindMoveTo').selectOption({label:'週末に作りたいもの › 準備'});
  await page.locator('#mindMove').tap();
  assert.equal(readMindMaps(await state(page))[0].root.children[0].children[0].text,'参考');
  await page.locator('#mindFit').tap();
  const fits=await page.locator('.mind-board').evaluate(board=>{
    const map=document.querySelector('#canvas').getBoundingClientRect(),rect=board.getBoundingClientRect();
    return rect.left>=map.left-1&&rect.right<=map.right+1&&rect.top>=map.top-1&&rect.bottom<=map.bottom+1;
  });
  assert.equal(fits,true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#mindMore').tap();await page.locator('#mindDelete').tap();
  assert.equal(await mindTitle(page,'参考').count(),0);
  await page.locator('#toastUndo').tap();
  assert.equal(await mindTitle(page,'参考').count(),1);
  assert.deepEqual(page.errors,[]);
});

await test('[マインドマップ][同期] PCとスマホで枝の配置とメモを同期し、各端末の表示を保持',async browser=>{
  const mock=mockSupabase();mock.db.set(USER.id,{document:doc(),revision:1});
  const {page:a}=await newPage(browser,{mock,user:USER});
  const {page:b}=await newPage(browser,{mobile:true,mock,user:USER});
  await waitStatus(a,'保存済み');await waitStatus(b,'保存済み');
  await addMindSheet(a);await mindRoot(a).fill('制作アイデア');
  await a.keyboard.press('Tab');await activeMindTitle(a).fill('PCからの枝');
  await a.locator('.brand').click();await waitStatus(a,'保存済み');
  await beginMouseMindDrag(a,mindCardFor(a,'PCからの枝').locator('.mind-grip'),-83,119);
  await a.mouse.up();await waitStatus(a,'保存済み');
  const placed=readMindMaps(await state(a))[0].root.children[0].position;
  assert.ok(placed);
  const tab=b.getByRole('tab',{name:/マインドマップ/});
  await tab.waitFor();assert.equal(await b.locator('.stage-title').first().textContent(),'サーバーの工程');
  await tab.tap();assert.equal(await mindRoot(b).inputValue(),'制作アイデア');
  await b.waitForFunction(placed=>{const key=pmApp.get().processedKeys.find(key=>key.startsWith('__processmap_mindmaps_v1__:'));const p=JSON.parse(key.split('__processmap_mindmaps_v1__:')[1]).maps[0].root.children[0].position;return p?.x===placed.x&&p?.y===placed.y},placed);
  await mindTitle(b,'PCからの枝').tap();await b.locator('#mindNoteOpen').tap();
  await b.locator('#mindNoteInput').fill('スマホから補足');
  await b.locator('#mindNoteForm button[type=submit]').tap();await waitStatus(b,'保存済み');
  await a.getByRole('button',{name:'このトピックのメモを開く'}).waitFor();
  const saved=mock.db.get(USER.id).document;
  assert.equal(saved.stages[0].title,'サーバーの工程');
  assert.equal(readMindMaps(saved)[0].root.children[0].note,'スマホから補足');
  assert.deepEqual([...a.errors,...b.errors],[]);
});

await test('[マインドマップ] 旧版形式の再読込と、マインドマップだけのブックを保持',async browser=>{
  const {page}=await newPage(browser);
  await addMindSheet(page);await mindRoot(page).fill('保存する発想');await page.locator('.brand').click();
  const legacy=await state(page);
  delete legacy.sheets;delete legacy.activeSheetId;
  legacy.stages[0].title='旧版から更新した工程';
  await page.evaluate(doc=>window.pmApp.set(doc),legacy);
  assert.equal(await mindRoot(page).inputValue(),'保存する発想');
  await page.getByRole('tab',{name:/シート1/}).click();
  assert.equal(await page.locator('.stage-title').first().textContent(),'旧版から更新した工程');
  await page.locator('#sheetOptions').click();await page.locator('#sheetDelete').click();
  assert.equal(await page.getByRole('tab').count(),1);
  await page.reload();
  assert.equal(await page.getByRole('tab').count(),1);
  assert.equal(await mindRoot(page).inputValue(),'保存する発想');
  assert.equal(readMindMaps(await state(page)).length,1);
  await page.locator('#addSheet').click();await page.locator('#addProcessSheet').click();
  assert.equal(await page.getByRole('tab').count(),2);
  assert.equal(await page.locator('.add-stage').isVisible(),true);
  assert.deepEqual(page.errors,[]);
});

function mindCardFor(page,name){return page.getByRole('group',{name,exact:true})}
async function pointOf(locator){
  const box=await locator.boundingBox();
  assert.ok(box,'対象のカードが見つかりません');
  return {x:box.x+box.width/2,y:box.y+box.height/2};
}
function movement(before,after){return {x:after.x-before.x,y:after.y-before.y}}
async function beginMouseMindDrag(page,card,dx,dy){
  await card.scrollIntoViewIfNeeded();
  const start=await pointOf(card);
  await page.mouse.move(start.x,start.y);
  await page.mouse.down();
  await page.mouse.move(start.x+dx,start.y+dy,{steps:10});
}

await test('[マインドマップ][PC] 空の枝・選択した下位カード・検索結果からEnterで同列に追加',async browser=>{
  const {page}=await newPage(browser);
  await addMindSheet(page);await mindRoot(page).fill('中心テーマ');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  assert.equal(readMindMaps(await state(page))[0].root.children.length,2);
  await activeMindTitle(page).fill('親の枝');
  await page.keyboard.press('Tab');await activeMindTitle(page).fill('下にある枝');
  await mindCardFor(page,'下にある枝').click({position:{x:78,y:3}});
  await page.keyboard.press('Enter');await activeMindTitle(page).fill('クリック後に追加');
  await page.locator('#mindReviewOpen').click();
  await page.locator('#mindSearch').fill('下にある枝');
  await page.getByRole('button',{name:'下にある枝を表示',exact:true}).click();
  await page.keyboard.press('Enter');await activeMindTitle(page).fill('検索から追加');
  await activeMindTitle(page).evaluate(input=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,isComposing:true})));
  const root=readMindMaps(await state(page))[0].root;
  assert.equal(root.children.length,2);
  assert.deepEqual(root.children[1].children.map(node=>node.text),['下にある枝','検索から追加','クリック後に追加']);
  assert.deepEqual(page.errors,[]);
});

await test('[マインドマップ][PC] 枝を自由配置し、子の位置・リンク・取り消しを確認',async browser=>{
  const {page}=await newPage(browser);
  await addMindSheet(page);await mindRoot(page).fill('中心');
  await page.keyboard.press('Tab');await activeMindTitle(page).fill('動かす枝');
  await page.keyboard.press('Tab');await activeMindTitle(page).fill('枝の下');
  await mindRoot(page).focus();await page.keyboard.press('Tab');await activeMindTitle(page).fill('別の枝');
  await page.locator('#mindFit').click();
  const branch=mindCardFor(page,'動かす枝'),child=mindCardFor(page,'枝の下'),root=mindCardFor(page,'中心');
  const before=await pointOf(branch),childBefore=await pointOf(child),rootBefore=await pointOf(root);
  const zoom=await page.locator('#zoomLevel').textContent();
  await beginMouseMindDrag(page,branch.locator('.mind-grip'),-115,124);
  await page.mouse.up();
  const shift=movement(before,await pointOf(branch));
  const childShift=movement(childBefore,await pointOf(child));
  assert.ok(Math.abs(shift.x+115)<2&&Math.abs(shift.y-124)<2);
  assert.ok(Math.abs(childShift.x-shift.x)<1&&Math.abs(childShift.y-shift.y)<1);
  const rootShift=movement(rootBefore,await pointOf(root));
  assert.ok(Math.hypot(rootShift.x,rootShift.y)<2);
  assert.equal(await page.locator('.mind-lines path').count(),3);
  assert.equal(await page.locator('#zoomLevel').textContent(),zoom);
  const stored=readMindMaps(await state(page))[0].root;
  assert.equal(stored.children[0].children[0].text,'枝の下');
  assert.ok(stored.children[0].position.y>80);
  await page.keyboard.press('Control+z');
  assert.equal(readMindMaps(await state(page))[0].root.children[0].position,undefined);
  await page.keyboard.press('Control+Shift+z');
  assert.deepEqual(readMindMaps(await state(page))[0].root,stored);
  await page.reload();
  assert.deepEqual(readMindMaps(await state(page))[0].root,stored);
  await page.locator('#mindFit').click();
  // A title that is not being edited can also be used to pick up the branch on PC.
  await beginMouseMindDrag(page,branch.locator('.mind-title'),36,44);
  assert.equal(await page.locator('#canvas[data-mind-dragging]').count(),1);
  await page.keyboard.press('Escape');await page.mouse.up();
  assert.deepEqual(readMindMaps(await state(page))[0].root,stored);
  await page.locator('#sheetOptions').click();await page.locator('#mindResetLayout').click();
  const reset=readMindMaps(await state(page))[0].root;
  assert.equal(reset.children[0].position,undefined);
  assert.equal(reset.children[0].children[0].text,'枝の下');
  await page.locator('#toastUndo').click();
  assert.deepEqual(readMindMaps(await state(page))[0].root,stored);
  assert.deepEqual(page.errors,[]);
});

await test('[マインドマップ][SP] タッチで枝をドラッグし、全体表示から文字を編集',async browser=>{
  const {ctx,page}=await newPage(browser,{mobile:true});
  await addMindSheet(page);await mindRoot(page).fill('中心');
  await page.locator('#mindAdd').tap();await activeMindTitle(page).fill('動かす枝');
  await page.locator('#mindAdd').tap();await activeMindTitle(page).fill('子の枝');
  const branch=mindCardFor(page,'動かす枝'),child=mindCardFor(page,'子の枝');
  await branch.tap({position:{x:35,y:3}});
  await page.locator('#mindFit').tap();
  const start=await pointOf(branch.locator('.mind-grip')),before=await pointOf(child);
  const cdp=await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
  for(let i=1;i<=12;i++){
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x-39*i/12,y:start.y+105*i/12}]});
  }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await cdp.detach();
  const delta=movement(before,await pointOf(child));
  assert.ok(Math.abs(delta.x+39)<2&&Math.abs(delta.y-105)<2,JSON.stringify(delta));
  assert.ok(readMindMaps(await state(page))[0].root.children[0].position.y>90);
  await page.locator('#mindFit').tap();
  const fits=await page.locator('#canvas').evaluate(canvas=>{
    const box=canvas.getBoundingClientRect();
    return [...canvas.querySelectorAll('.mind-node,.mind-fold')].every(node=>{
      const r=node.getBoundingClientRect();
      return r.left>=box.left&&r.right<=box.right&&r.top>=box.top&&r.bottom<=box.bottom;
    });
  });
  assert.equal(fits,true);
  await mindTitle(page,'動かす枝').tap();
  assert.equal(await page.locator('#zoomLevel').textContent(),'100%');
  await activeMindTitle(page).fill('移動後も編集できる');
  assert.ok(readMindMaps(await state(page))[0].root.children[0].position);
  assert.deepEqual(page.errors,[]);
});

await test('[マインドマップ] つまみはPCでホバー時、スマホで選択中だけ表示',async browser=>{
  const gripState=grip=>grip.evaluate(button=>{
    const style=getComputedStyle(button);
    return [style.opacity,style.pointerEvents];
  });
  for(const mobile of [false,true]){
    const {page}=await newPage(browser,{mobile});
    await addMindSheet(page);await mindRoot(page).fill('中心');
    await page.locator('#mindAdd').click();await activeMindTitle(page).fill('枝A');
    await page.locator('#mindSibling').click();await activeMindTitle(page).fill('枝B');
    await page.locator('#mindFit').click();
    const a=mindCardFor(page,'枝A'),b=mindCardFor(page,'枝B');
    const aGrip=a.locator('.mind-grip'),bGrip=b.locator('.mind-grip');
    assert.deepEqual(await gripState(aGrip),['0','none']);
    if(mobile){
      assert.deepEqual(await gripState(bGrip),['1','auto']);
      await a.tap({position:{x:36,y:3}});
      assert.deepEqual(await gripState(aGrip),['1','auto']);
      assert.deepEqual(await gripState(bGrip),['0','none']);
    }else{
      assert.deepEqual(await gripState(bGrip),['0','none']);
      await a.hover();
      assert.deepEqual(await gripState(aGrip),['1','auto']);
      assert.deepEqual(await gripState(bGrip),['0','none']);
      await page.locator('.brand').hover();
      assert.deepEqual(await gripState(aGrip),['0','none']);
    }
    assert.deepEqual(page.errors,[]);
  }
});

await test('[マインドマップ][同期] ドラッグ中に届いた更新は描画を中断せず、確定後に競合を知らせる',async browser=>{
  const mock=mockSupabase();mock.db.set(USER.id,{document:doc(),revision:1});
  const {page}=await newPage(browser,{mock,user:USER});
  await waitStatus(page,'保存済み');
  await addMindSheet(page);await mindRoot(page).fill('中心');
  await page.keyboard.press('Tab');await activeMindTitle(page).fill('動かす枝');
  await page.locator('.brand').click();await waitStatus(page,'保存済み');
  const branch=mindCardFor(page,'動かす枝');
  await beginMouseMindDrag(page,branch.locator('.mind-grip'),-58,110);
  await page.locator('#canvas[data-mind-dragging]').waitFor();
  const {document:remote,revision}=structuredClone(mock.db.get(USER.id));
  remote.stages[0].title='別端末の工程';
  mock.db.set(USER.id,{document:remote,revision:revision+1});
  await page.waitForResponse(res=>res.url().includes('/rest/v1/processmap_documents')&&res.request().method()==='GET');
  assert.equal(await page.locator('#canvas[data-mind-dragging]').count(),1);
  assert.equal(await page.locator('#conflictDialog').isVisible(),false);
  await page.mouse.up();
  await page.locator('#conflictDialog[open]').waitFor();
  assert.equal(mock.db.get(USER.id).document.stages[0].title,'別端末の工程');
  assert.ok(readMindMaps(await state(page))[0].root.children[0].position);
  assert.deepEqual(page.errors,[]);
});

server?.close();
const failed=results.filter(r=>r[0]==='FAIL');
console.log(`\n${results.length-failed.length}/${results.length} passed`);
if(failed.length){for(const f of failed)console.log('FAIL:',f[1]);process.exitCode=1}
