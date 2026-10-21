// Disposable Vue fixtures: never read device credentials or write a real dorm.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
const root = new URL("../", import.meta.url).pathname,
  front = path.join(root, "frontend"),
  name = `entry-layout-${process.pid}`;
const html = path.join(front, name + ".html"),
  vue = path.join(front, name + ".vue"),
  evidence = path.join(root, "docs/evidence/entry-layout");
const checks = [],
  errors = [];
let server, browser;
const check = (actual, expected, label) => {
  assert.deepEqual(actual, expected, label);
  checks.push(label);
};
try {
  await fs.mkdir(evidence, { recursive: true });
  await fs.writeFile(
    html,
    `<meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">import {createApp} from 'vue';import {Icon} from 'vant';import Root from './${name}.vue';import 'vant/lib/index.css';import './src/style.css';createApp(Root).use(Icon).mount('#app')</script>`,
  );
  await fs.writeFile(
    vue,
    `<script setup lang="ts">
import {ref,computed} from 'vue';import Sheet from './src/components/ElasticSheet.vue';import Round from './src/components/RoundProgress.vue';import Settings from './src/components/ChoreSettings.vue';
const open=ref(false),settings=ref(false);const members=Array.from({length:8},(_,i)=>({user_id:i+1,nickname:'室友'+(i+1),marker_id:i===7?'invalid-mark':'pixel-'+String(i+1).padStart(2,'0')}));
const count=ref(8);(window as any).setCount=(n:number)=>count.value=n;const round=computed(()=>({completed:count.value,total:8,sequence:1,members,completions:members.slice(0,count.value).map((m,i)=>({...m,id:i+1,completed_at:'2026-10-17T01:00:00Z'}))}));
const categories=['floor','toilet','sink','water'].map((key,i)=>({key,name:['地板','厕所','洗手池','抬水'][i],mode:key==='water'?'on_demand':'self_round',content:'清洁',start_date:'2026-10-17',deadline_time:'22:00',weekdays:[1,2,3,4,5,6,7],rotation_days:1,reminder_interval_days:3,rotation_order:members.map(m=>m.user_id),enabled:true}));
</script><template><main><button data-testid="open" @click="open=true">轮次</button><button data-testid="settings" @click="settings=true">设置</button><Sheet v-model="open" title="本轮完成" :content-height="'min(75dvh, 820px, calc(min(224px, 27dvh) + 224px + '+(count*66)+'px + env(safe-area-inset-bottom, 0px)))'" contained fixed-content motion="bottom"><div class="round-members"><Round :round="round" :active="open"/></div></Sheet><Settings v-model="settings" :categories="categories" :members="members" :version="1" token="fixture"/></main></template>`,
  );
  const socket = net.createServer();
  await new Promise((r) => socket.listen(0, "127.0.0.1", r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  server = spawn(
    process.execPath,
    [
      path.join(front, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd: front, stdio: "ignore" },
  );
  const url = `http://127.0.0.1:${port}/${name}.html`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const safari = process.env.DORM_BROWSER === "webkit";
  browser = await (safari ? webkit : chromium).launch({
    headless: true,
    ...(!safari && process.platform === "darwin"
      ? {
          executablePath:
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.route("**/marks/**",route=>route.abort());
  for (const width of [320,390,430]) {
    await page.setViewportSize({width,height:844});
    let lastHeight=0;
    for(const total of [0,1,2]) {
      await page.evaluate(n=>window.setCount(n),total);
      await page.getByTestId("open").click();
      await page.waitForTimeout(350);
      const box=await page.locator('.elastic-sheet').boundingBox();
      check(box.height<600,true,`${width}px ${total} people leaves background visible`);
      if(total===0) {
        check(await page.getByTestId('round-ranking').count(),0,'empty round reserves no roster area');
        const empty=await page.locator('.round-empty').boundingBox();
        check(empty.y+empty.height<=box.y+box.height && box.y+box.height-empty.y-empty.height<65,true,'empty hint is close to bottom without dead space');
        if(width===390) await page.screenshot({path:path.join(evidence,'round-empty.png')});
      } else check(box.height>lastHeight+50,true,'drawer grows with short roster');
      lastHeight=box.height;
      await page.getByRole('button',{name:'关闭详情',exact:true}).click();
      await page.locator('.sheet-layer').waitFor({state:'hidden'});
    }
    await page.evaluate(()=>window.setCount(8));
    await page.getByTestId("open").click();
    await page.waitForTimeout(700);
    const ring=page.getByTestId("round-progress-ring"), list=page.locator(".round-ranking-viewport");
    const before=await ring.boundingBox();
    await list.evaluate(el=>el.scrollTop=el.scrollHeight);
    await page.waitForTimeout(700);
    const after=await ring.boundingBox();
    check(after.width<before.width*.6,true,`${width}px ring contracts while roster gains room`);
    check(await list.evaluate(el=>el.scrollTop>0),true,`${width}px roster has its own usable scroll area`);
    check(await list.locator('svg.member-mark path').count(),8,'every member renders inline including invalid marker fallback');
    check(await list.locator('svg.member-mark path').evaluateAll(paths=>paths.every(p=>!!p.getAttribute('d'))),true,'all marker paths contain drawing data');
    const last=await list.locator('li').last().boundingBox(), bounds=await list.boundingBox();
    check(last.y+last.height<=bounds.y+bounds.height+1,true,'last person is reachable inside list');
    await page.waitForTimeout(280);
    if(width===390) await page.screenshot({path:path.join(evidence,'round-fixed.png')});
    await page.getByRole('button',{name:'关闭详情',exact:true}).click();
    await page.locator('.sheet-layer').waitFor({state:'hidden'});
    await page.getByTestId('settings').click();
    await page.getByTestId('settings-save').waitFor();
    await page.waitForTimeout(300);
    for(const key of ['floor','toilet','sink','water']) {
      await page.getByTestId(`settings-select-${key}`).click();
      const save=await page.getByTestId('settings-save').boundingBox();
      check(save.y>=0&&save.y+save.height<=844,true,`${width}px ${key} settings save visible without scrolling`);
    }
    await page.waitForTimeout(280);
    if(width===390) await page.screenshot({path:path.join(evidence,'settings-compact.png')});
    await page.getByRole('button',{name:'轮换顺序'}).click();
    await page.locator('.sort-person').first().waitFor();
    await page.getByRole('button',{name:'关闭详情',exact:true}).last().click();
    await page.waitForTimeout(300);
    await page.getByTestId('settings-select-floor').click();
    await page.getByTestId('mode-scheduled-floor').click();
    await page.getByRole('button',{name:/排班时间/}).click();
    await page.getByTestId('settings-start-floor').fill('2026-10-18');
    await page.getByRole('button',{name:'关闭详情',exact:true}).last().click();
    await page.waitForTimeout(300);
    await page.getByRole('button',{name:/排班时间/}).click();
    check(await page.getByTestId('settings-start-floor').inputValue(),'2026-10-18','closing schedule detail preserves edits');
    await page.getByRole('button',{name:'关闭详情',exact:true}).last().click();
    await page.waitForTimeout(300);
    await page.getByRole('button',{name:'关闭详情',exact:true}).click();
    await page.locator('.sheet-layer').waitFor({state:'hidden'});
  }
  check(errors,[],"no browser errors");
  console.log(JSON.stringify({status:'passed',browser:safari?'WebKit':'Chromium',checks},null,2));
} finally {
  await browser?.close(); server?.kill('SIGTERM');
  await fs.rm(html,{force:true}); await fs.rm(vue,{force:true});
}
