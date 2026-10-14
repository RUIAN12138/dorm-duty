# 成员像素标记

2026-10-12。本项目新增 100 个原创静态像素标记，ID 从 `pixel-01` 至 `pixel-100`。首批 12 个为像素猫、小兔、星星、月牙、水滴、蘑菇、小狐狸、叶子、爱心、幽灵、小皇冠和晶石；额外图案保留这些轮廓并附加不同的像素组合。图形不只靠颜色区分。

## 来源与渲染

视觉参考来自本地 Agent Notch 项目的硬边像素语言：检查了 `vibe-notch/ClaudeIsland/Resources/DenseVibePet/dense-00-idle-green-f1.png`、同目录 `DENSE_VIBE_PET_PROVENANCE.md` 和 `PixelLoaderIcon.swift` 的渲染方式。没有复制该项目的图片或动画帧；本项目的新图案由 `scripts/generate-member-marks.mjs` 的原创整数网格生成。

SVG 使用 12 × 12 固定透明画布和整数坐标的正方形像素，`shape-rendering="crispEdges"`，无内置背景、模糊、滤镜或外部请求。Vue 显示层使用 `image-rendering: pixelated`，轻微荧光来自显示层阴影，前景图案本身保持硬边。它们是静态身份标记，不循环播放动画。

## 文件与生成

- `frontend/public/marks/`：100 个 SVG，稳定路径用于日历和选择器。
- `frontend/src/data/member-marks.json`：ID、中文名称和颜色。
- `site/shared/member-marks.mjs`：后端允许的稳定 ID 列表。
- `scripts/generate-member-marks.mjs`：可重复生成，验证画布及所有轮廓组合不重复。

在项目根目录执行：

```bash
node scripts/generate-member-marks.mjs
```

已有历史记录保存打卡时的成员姓名和标记快照。修改个人标记不改写历史；维护时不得重新定义已发布 ID 对应的图案。
