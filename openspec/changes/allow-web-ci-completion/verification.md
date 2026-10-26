# Verification
本条为用户授权后的事前登记。只改变Web job timeout-minutes 15→25；后续记录实际规范检查、远端CI和发布结果。旧b19ed0f产品代码不变；实体iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb未测。

`npm run spec:check`通过；本次workflow真实diff仅一行15→25。新SHA CI尚未执行，发布尚未进行。
