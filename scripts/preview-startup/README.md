# 仅本地启动预览
在本项目根目录运行 `node scripts/preview-startup/server.mjs`，打开 http://127.0.0.1:8094/ 。这是完整原应用入口，合成邮箱身份与内存SQLite，不连接生产或AI。
浏览器断网可测试恢复失败；恢复网络后点重试。模拟未登录可打开 http://127.0.0.1:8096/__preview/logout 后刷新；恢复则访问 http://127.0.0.1:8096/__preview/login 。关闭进程即丢弃合成数据库。
WebGL只是独立实验，无任何正式入口导入，不在该预览默认开启。
