# Liquid Glass v76 验证

## 范围与来源
本轮在独立预览工作区 `codex/liquid-glass-optics` 实现，前置键盘/单双击修复单列提交 `0d1e29b`，玻璃代码未改写它们。线上基线v75。没有改后端、原生壳、依赖、主题布局、业务接口或数据库。`ReleaseNotice.vue`只补本轮已有更新提示的文案。

按八部分CLAUDE_TASK交本地Claude实现，Codex独立审查、修正及浏览器复测；没有子代理。参考 `rdev/liquid-glass-react` 快照 `ac48eab18d1f7f444ae30002d240cae29c863a21` 的边缘SDF/位移/RGB微偏移/高光原理，没有复制React实现；完整MIT公有文件与原LICENSE逐字节一致。

## 实际效果与限制
- 底部导航显式optical启用原WebGL透镜精修版，微调边缘曲率/约1px亮边，红蓝通道分离不超过1.44px；采样的是本导航标签纹理，不能声称实时采样整页DOM。原压力/位置/回弹、上下超出边界与放大保持。AppearanceSettings共用调用未传optical，原shader逐字保留。
- 输入填充42%→27%，固定7px局部blur，双层细阴影；尺寸58px、圆角、输入/IME/键盘几何不变。消息由实底改62%+固定7pxblur；60px外占位、椭圆、消息时序/手势/收起不变。日历仅scrub模式用34%透明滑块，原selection单一驱动不变。
- 装饰高光仅transform/opacity，背景渐变不随指针重新栅格；被动监听，pointerdown缓存尺寸，rAF合帧，没有idle写入循环，后台取消/减动效静态。暗色亮边降强度，减透明度实底；CSS支持仅语法，不冒称像素折射支持。没有启用未证明可靠的SVG背景滤镜。

## 受控截图与性能
使用真实Vue四个组件、固定390×844视口及相同隔离文字背景，保存优化前源码快照；前后各场景串行运行，不在性能采样内截图。没有调用生产接口。截图路径：`data/liquid-glass/{before,after}-{chromium,webkit}/{light,dark,held,reduced}.png`；after另有no-webgl.png、Chromium reduced-transparency.png。可复跑 `DORM_GLASS_BASELINE=1 node scripts/check-liquid-glass-optics.mjs`（本机已保存baseline），最终源码测试不要求该基线副本。

| 场景 | 前/后样本数 | P95帧间隔 | 最大帧间隔 | >32ms帧数 前/后 |
| --- | --- | --- | --- | --- |
| chromium | 373 / 374 | 9.2 → 8.6ms | 9.4 → 9.3ms | 0 / 0 |
| webkit | 182 / 183 | 18.0 → 18.0ms | 18.0 → 22.0ms | 0 / 0 |
| chromium-cpu4 | 378 / 384 | 9.2 → 9.2ms | 17.3 → 10.1ms | 0 / 0 |

全部最终采样未观察到Long Task（WebKit若无该观察器不等于不存在）。P95差异处于环境噪声范围，不声称提升百分比；WebKit最大帧间隔18→22ms仍原样记录。CPU×4只限速桌面JS，不代表低端安卓GPU、输入法或真实设备表现。

## 自动回归
- 新光学检查：Chromium 20项、WebKit17项；Chromium CPU×4同样20项。检查真实58/60px几何、GL放大/越界、可逆日历scrub、输入、明暗、可合成高光中间位移、pointer-events、减动效、idle无写、禁WebGL实际导航回退；Chrome另实际模拟减透明度并验证实底/无blur。
- 原键盘回归：Chromium 98、WebKit 98项通过（模拟VisualViewport，不是真实软键盘）。
- 原日历分段回归：Chromium 18、WebKit 16项通过。
- 原玻璃/输入/加载回归：两个引擎各26项，真实WebGL uniforms确认原按住放大超过导航高度，释放/取消恢复、快速导航、主题及输入占位等保持。
- 消息队列单元、648组玻璃几何及其他原交互单元通过。具体日志在 `data/liquid-glass/`，检查不替代视觉验收。

## 失败与修正记录
首轮fixture被Vite SPA fallback接走，已改为前置中间件；一次新旧消息交错退出命中两个元素，改用非退出项，保留真实transition。自动过期使后段材质断言失去banner，固定测试宿主不隐藏而未改生产自动过期逻辑。
并行别名fixture与应用共用Vite优化缓存触发重新优化，键盘首阶段视口未更新；现在每个对比场景独立cacheDir，串行复测98项均通过。失败文件 `keyboard-concurrent-failure.json` 保留。初次采样含开发重载/并发长帧，未当最终性能结论；稳定源码和独立缓存最终串行采样见表。

## 实机与授权
本轮没有iPhone或低性能Android实体设备验收，Android WebView、HarmonyOS ArkWeb不冒称本轮通过。前轮安卓原生壳未报告IME高度、鸿蒙模拟器不弹软键盘的限制仍在，不因此越界修改壳。
用户最后明确原话“完成后提交 pr   更新网站”授权本批次创建review PR及代码发布查看，记录对应最终摘要；acceptance继续pending，不合并main，不追认实体设备或产品验收。

## 构建与范围检查
最终typecheck/build、限定10个源/测试路径Prettier、OpenSpec strict及18个范围门禁单测、git diff --check通过。前端预缓存1310.10KiB；没有新增运行时依赖。隔离预览已重启到最终源码。下一步PR/部署仍须分别运行摘要门禁。

## 正式发布与记录保全（北京时间2026-10-23 08:07）

PR #82： https://github.com/RUIAN12138/dorm-duty/pull/82 ，base为 `codex/fix-companion-tap-arbitration`，未合并main。运行源码提交 `de7b20c9e7c95814c384c3f2910a8de87041d125`，版本 `20261023-liquid-glass-v76`。后续测试/文档提交不改变运行代码。

- 在线备份 `/opt/dorm-duty/backups/dorm-20261023T000700Z.sqlite` 通过完整性及外键检查；私有历史快照留在服务器。67条原完成记录发布后逐条哈希一致，数据库标识不变，没有覆盖数据库。
- 52项代码发布包无数据库、配置密钥或环境文件；SHA256 `5c2af1b2672c18629c042d6542fea3cbe19fa21b321c21e2ba9d25b8f8c2f2bf` 本地/远端一致，MIT公有文件已嵌入。
- 原子切换 `/opt/dorm-duty/current` 后Node服务健康；143个公网资源与本地包逐字节一致，值日/抬水/日历三个路由、Manifest/SW与许可证资源正常。
- 新无登录浏览器通过v76一次性版本提示、确认后刷新不重复、无运行异常/5xx且无生产写请求。没有发送正式聊天、打卡或留言。证据 `data/liquid-glass/{deployment.json,history-after.json,public-verification.json,public-browser.json,public-page.png}`。
- 旧release `/opt/dorm-duty/releases/20261022-companion-entry-v75` 保留；如回退只原子切代码并重启，禁止用旧数据库覆盖新记录。

## GitHub CI时序修正

首次CI的moving double测试实际first pointerup1065.4ms、second pointerdown1359.8ms，间隔294.4ms，超出既有280ms窗口；失败证据 `data/liquid-glass/ci-motion-evidence/tap-arbitration/`。未延长产品窗口或改变球球。只把该测试的首段等待85→25ms，保留移动坐标采样后65ms延迟，并新增真实触摸时间间隔<=280ms断言。精确脚本路径已列入范围；不将超时输入包装成有效双击。这是CI验收修正，不需要重新部署运行代码。最终本地两引擎与CI状态另在PR记录，不沿用首次失败结论。

另一项CI旧断言要求键盘出现把球球缩到60px以下，已与先前用户明确要求“顶部稳定、不因键盘缩放”冲突。实际记录ball88px、可视root410/top44、composer距视口底10px正常。仅更新check-companion-chat-browser.mjs验收：测量键盘前球体宽/相对顶边，键盘后保持0.75px容差，确认10px外缘间距与410px真实可视高度；不改产品代码，原IME/草稿/消息/回程检查保留。原始失败日志ci-web-failure.log保留。双击时窗修正后本地两引擎各52项通过。

更新旧键盘断言后，完整原聊天浏览器回归通过（chromium: 60, webkit: 58项），包含输入法确认不误发、消息/草稿、键盘回程、多行输入与减动效。新双击回归两引擎各52项通过。仅验证文件和记录变化，生产仍为已核对的de7b20c运行代码。
