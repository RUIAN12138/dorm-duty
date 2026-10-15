# 交互基础升级

2026-10-15。v20 引入统一底栏、分段、抽屉和排序；随后可用性改进继续调整标题、菜单、抽屉姿态与撤销反馈。保留 Vue 3、黑白视觉、大字任务和三项导航。详见 [可用性改进](USABILITY_POLISH.md)。

## 组成

- Motion for Vue `2.7.0`：Motion Values、弹簧和 Reorder；Reka UI `2.11.0`：无样式 Dialog / Tabs。两包采用 MIT 许可，版本精确锁定。
- `frontend/src/interaction/motion.ts` 集中运动参数；选中背景直接更新 Motion Value，不逐帧更新 Vue 状态。
- 导航仍为 RouterLink；日历 / 列表使用同页 Tabs。共享运动参数不改变导航语义。
- 抽屉采用稳定 Dialog 基础，未采用仍处于 Alpha 的 Reka Drawer。一个属性由一个系统控制；旧 CSS Transition 类不再挂到抽屉上。
- 抽屉由一个完整 transform 驱动元素动画；拖动更新同一姿态，中途反向先采样当前呈现位置，避免多个值分帧合成。普通抽屉默认模态，抬水只读详情为非模态；不再缩放底层整页。
- `confirmInSheet` 将既有 Vant 确认框挂入当前 Dialog 的焦点范围；关闭、遮罩、Esc、输入、嵌套与原生返回栈保留。
- Motion Reorder 管理行位置、邻居让位及边缘滚动；长按 240ms 后接管，提前移动继续滚动。预览保存在组件内部，松手才更新设置草稿，显式保存后才写服务器；取消、关闭、保存禁用和卸载不会提交拖动预览。

## 参数

| 对象            | 参数                                     |
| --------------- | ---------------------------------------- |
| 底栏 / 分段     | spring 620 / 42 / 0.8，横向形变最多 3.5% |
| 抽屉进入 / 退出 | 240ms / 180ms，无退出回弹                |
| 拖拽取消回位    | spring 540 / 42 / 0.8                    |
| 排序布局        | spring 540 / 40 / 0.8，拿起 1.02 倍      |

减少动态效果与键盘操作避免播放这些过渡；导航与抽屉进入后台时直接收敛到目标。这里的 spring 参数顺序为刚度 / 阻尼 / 质量。

## 可重复验收

```sh
npm ci --prefix frontend
npm ci --prefix site
cd frontend && npx playwright install chromium && cd ..
node scripts/check-interaction-foundation.mjs
npm run build --prefix frontend
(cd site && node scripts/embed-frontend.mjs)
node scripts/verify-chores.mjs
```

macOS 默认使用本机 Google Chrome；可用 `BROWSER_EXECUTABLE` 指定，Linux 默认使用 Playwright Chromium。浏览器检查临时启动本机 Vite，临时页面和组件结束时删除。业务验收使用两个独立浏览器身份、临时 SQLite 和独立端口，结束时清理，不访问正式宿舍数据。旧 `check-water-order.mjs` / `check-navigation-motion.mjs` 命令保留为新浏览器检查入口，CI 只运行一次。

本轮已通过 41 项真实 DOM / 指针 / CDP 触摸检查，包含 20 次连点、拖动未松手不切页、取消回位、键盘、底边贴合、中途关闭再打开、输入保留、嵌套 Vant 确认、焦点恢复、原生返回、减少动态效果、长按姓名排序、普通滚动、24 人边缘停留滚动、系统取消、关闭与卸载清理。完整业务回归覆盖创建 / 加入、身份保持、三类值日和两次抬水、提醒、日历 / 列表、轮序保存与服务重启；慢响应期间禁止重复提交，409 冲突保留内容与轮序草稿。320 / 390 / 430px 未发现横向溢出，浏览器异常为 0。

本地证据（被 Git 忽略）：`docs/evidence/interaction-foundation/report.json`、`rest.png`；完整页面截图与业务报告在 `docs/evidence/ui-focus/regression/`。GitHub CI 安装 Chromium 并运行同一组件检查。

## 验收边界

- 浏览器触摸模拟不等于实体 iPhone Safari、Android WebView、HarmonyOS ArkWeb 的手感或 60 / 120Hz 帧率验收；这三项仍需实际设备记录。
- 本轮没有修改推送协议、原生 SDK 或平台密钥；已有原生通知配置和真机分发待办仍见 `native/README.md`。
- 新依赖增加下载体积。生产构建的 PWA 预缓存约 683 KiB（未压缩资源总量），应在移动网络实际观察首次下载；不能把该数值称作 gzip 体积或帧率。
- 本地构建通过不代表已发布；正式版本与发布核验结果以 `PROGRESS.md` / `SERVER_DEPLOYMENT.md` 为准。

官方 API 参考：[Motion Values](https://motion.dev/docs/vue-motion-value)、[Reorder](https://motion.dev/docs/vue-reorder)、[Reka Dialog](https://www.reka-ui.com/docs/components/dialog)、[Reka Tabs](https://www.reka-ui.com/docs/components/tabs)。

当前正式版本为 `20261015-usability-v21`。28 个公网资源与构建一致，386 项独立宿舍 API 检查通过，48 条既有完成记录保留。v20 为交互基础首次升级；当前发布详情见 `SERVER_DEPLOYMENT.md`。
