# 本地预览验收记录

独立分支codex/startup-session-optics-preview，基于2be03ba(v81)。未PR、未合并、未部署。

## 证据
- data/startup-review/chromium-startup-result.json、webkit-startup-result.json：真实GuestHome+隔离SQLite/模拟邮箱，各8项通过。
- startup-light、water-before/after截图；before由git archive HEAD中的v81原始源码运行拍摄，不是修后图伪装。
- check-startup-session.mjs：6项缓存恢复/清理/实际API网络与401检查，check-identity-races原竞态通过。
- web:build及vue-tsc通过；Android离线assembleDebug成功，仅编译，不等于实体vivo验收。
- 原前端状态回归21/22组通过：check-screen-gesture-check用7px移动断言横幅拖动，与v81的10px阈值不一致；本轮未改该组件/测试，不修无关代码。
- companion AI隔离模拟上游回归通过，未产生真实费用。
- WebGL独立校准两浏览器可用/空闲零帧/不支持回退CSS；当前仅JS派发耗时，不能作为GPU帧率实证。现有导航已含WebGL，未见明显收益，未默认采用。
- data/startup-review/nav-preview-result.json记录真实ChoreBottomNav独立切换实验，正常入口无实验import。
- adb无设备，xcdevice无可用iPhone；实体iPhone/vivo/HarmonyOS未验收。

## 可运行预览
node scripts/preview-startup/server.mjs -> http://127.0.0.1:8094/
实际原应用，临时SQLite/合成邮箱，不连接生产、真实邮件和AI。
光学实验：http://127.0.0.1:8094/src/experiments/index.html ，保留原导航组件，手动开关实验层。

详见docs/STARTUP_REVIEW.md；图标原资源docs/icon-backup-v81，现有球球形象许可没有扩展。

## 用户指定图标替换
按“图标改成这个”使用所附原图，只缩放导出11个PNG与5个自包含SVG兼容资源。尺寸检查192/512/180通过，已查看512预览，Android重新assembleDebug成功，OpenSpec检查通过。未改应用内球球，未部署。深浅模式保留用户原配色，不自动反色。
