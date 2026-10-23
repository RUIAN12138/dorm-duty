## Context and sources
已读 frontend-design、emil-design-eng、动效契约、OpenSpec基线与在途玻璃/聊天范围。知识库索引、awesome-design-md、math-curve-loaders路径缺失；读取本机React Bits TiltedCard和AnimatedContent，只参考触点归一化、清理与回弹，不引入React/GSAP。Vue3/Pointer Events，零新依赖。

| Before | After | Why |
| --- | --- | --- |
| v-tilt闲置，单纯微缩且可叠加通用scale | 现有指令按触点最多1.6度，1.5px下沉，0.992缩放 | 反馈轻微，单一驱动 |
| 列表侧滑与卡片按压各不知晓 | 超过8px意图或scroll/pointercancel立即释放 | 不劫持原有横滑/纵滚 |
| 成员长按仅外层放大，内层无阴影 | 现有held触发内层4px抬升，阴影渐显 | 不新增长按定时器或更改排序 |

## Ownership
原transform完整保留，反馈只拥有临时个体 translate/rotate/scale；如目标已有这些个体属性则不抢占。每次pointerdown最多读一次卡片rect，move用缓存且RAF合帧，不读取样式/布局。指令mounted标识data-card-feedback和data-press-owned，公共按压排除直接标识的宿主，防止scale叠加；默认拒绝嵌套button等独立操作，不触碰完成/催促。
非长按普通卡仅按下跟随，不加hover；移动超过8px交还原控制器，未调用preventDefault/capture/stopPropagation。release可反向，继承现有pressStep弹簧，约200–300ms稳定；reduce/keyboard/hidden/blur直接终态，unmount恢复原样与监听器。
排序内层用{lifted:held, liftOnly:true, disabled:...}，held仍由现有240ms与Reorder控制；内层不再叠加缩放，只translateY(-4px)。放下恢复，取消/权限/active均保留原行为。阴影为局部伪元素opacity，避免逐帧box-shadow。
## Scope and verification
2026-10-23用户新原话「更新到网站 提交 pr」授权当前构建的PR与部署；本轮仅追加ReleaseNotice的v80版本说明，不改变弹窗设计。产品/真机验收仍pending，main不合并。

精确文件见scope.json。ChoreBoard只在两个现有task-title-button增加指令；不是给整个页面/完成按钮祖先倾斜。日历只在calendar-surface空白表面使用，不改日期按钮。ChoreRecordRow只在内部行使用，不改SwipeRecordCell。其他内容、字体、几何、样式不改。
纯测试参数/字面transform保留/释放与清理，真实Vue Chromium/WebKit中间帧、指针取消/纵滚/横滑、重复操作、disabled、减动效、深浅色和尺寸前后对照。回归原完成/侧滑/轮序/日历与全局按压。实体设备未做须明确，不把桌面WebKit称为真机。预览使用合成SQLite；不接触生产数据。

交付阶段仅测试可复现性补充：新clone缺少本机修改前基线时，浏览器脚本显式退化为视口冒烟，不虚构原版几何比较；可传入基线与独立证据目录复现。
