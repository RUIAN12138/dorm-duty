# Design
常规手机可视高度内预算头部、60px进度命中区、正文、固定操作栏。保留大字与足够触摸区；模板四项分页，编辑与选择互斥，定时与规则选择互斥，双列任务各三项分页。小屏/键盘/放大字体保留安全滚动。
创建轨道32px，节点同直径白色圆。玻璃在首次按压位置展开，拖动用单一位置驱动，松开先吸附后收缩；取消/丢失捕获可中断。旧工作台creationMode=false走原视觉/手势。
参考现有Motion tokens、React Bits ElasticSlider的轻量形变原理，不复制React实现；缺失本地awesome-design-md、math-curve-loaders不虚构使用。
