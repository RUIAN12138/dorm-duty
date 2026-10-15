import { webview } from '@kit.ArkWeb';
import { common } from '@kit.AbilityKit';
import { http } from '@kit.NetworkKit';
import { preferences } from '@kit.ArkData';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { notificationManager } from '@kit.NotificationKit';
import { JPushInterface } from '@jg/push';
import { JPUSH_APP_KEY, WEB_ORIGIN, WEB_BASE } from '../PushConfig';
import { PageLoadState } from '../PageLoadState';
interface BridgeRequest { id: string; command: string; token?: string; }
interface BridgeResult { id: string; ok: boolean; enabled: boolean; configured: boolean; message: string; platform: string; }
interface DeviceBody { platform: string; device_id: string; device_secret: string; registration_id?: string; }
@Entry
@Component
struct Index {
  controller: webview.WebviewController = new webview.WebviewController();
  ports: webview.WebMessagePort[] = [];
  context: common.UIAbilityContext = this.getUIContext().getHostContext() as common.UIAbilityContext;
  pending: boolean = false;
  @State initialURL: string = AppStorage.get<string>('launchURL') || WEB_BASE;
  @State connectionFailed: boolean = false;
  private page: PageLoadState = new PageLoadState(WEB_BASE);
  private loadTimer: number = -1;
  private handlingBack: boolean = false;
  private alive: boolean = false;
  onBackPress(): boolean {
    if (this.handlingBack) return true;
    this.handlingBack = true;
    let url: string = '';
    try {
      url = this.controller.getUrl();
      if (!this.validURL(url)) { this.navigateBack(); this.handlingBack = false; return true; }
      this.controller.runJavaScript("typeof window.DormNativeBack === 'function' && window.DormNativeBack()")
        .then((handled: string) => {
          if (this.alive && this.controller.getUrl() === url && handled !== 'true') this.navigateBack();
        }).catch(() => { if (this.alive) this.navigateBack(); })
        .finally(() => { this.handlingBack = false; });
    } catch (_) { this.handlingBack = false; this.navigateBack(); }
    return true;
  }
  private navigateBack(): void {
    try {
      if (this.controller.accessBackward()) { this.controller.backward(); return; }
    } catch (_) { /* A failed first navigation has no Web history. */ }
    this.context.terminateSelf().catch(() => {});
  }
  private validURL(url: string): boolean { return /^https:\/\/8\.148\.190\.114\/dorm-duty\//.test(url); }
  aboutToAppear(): void {
    this.alive = true;
    this.context.eventHub.on('notification-route', (url: string) => {
      if (this.validURL(url)) {
        try { this.controller.loadUrl(url); } catch (_) { this.initialURL = url; }
      }
    });
  }
  aboutToDisappear(): void {
    this.alive = false;
    clearTimeout(this.loadTimer);
    this.context.eventHub.off('notification-route');
    this.ports.forEach((port: webview.WebMessagePort) => port.close());
  }
  private beginLoad(url: string): void {
    if (!this.validURL(url)) return;
    this.page.begin(url); this.connectionFailed = false;
    clearTimeout(this.loadTimer);
    this.loadTimer = setTimeout(() => {
      if (this.alive && this.page.fail(url)) {
        this.connectionFailed = true;
        try { this.controller.stop(); } catch (_) { /* Retry remains available. */ }
      }
    }, 20000);
  }
  private failLoad(url: string): void {
    if (this.page.fail(url)) { clearTimeout(this.loadTimer); this.connectionFailed = true; }
  }
  private retryLoad(): void {
    this.beginLoad(this.page.url);
    try { this.controller.loadUrl(this.page.url); } catch (_) { this.failLoad(this.page.url); }
  }
  private value(key: string): string {
    const prefs = preferences.getPreferencesSync(this.context, { name: 'install' });
    let value = prefs.getSync(key, '') as string;
    if (!value) {
      const bytes = cryptoFramework.createRandom().generateRandomSync(32).data;
      value = Array.from(bytes).map((byte: number) => byte.toString(16).padStart(2, '0')).join('');
      prefs.putSync(key, value); void prefs.flush();
    }
    return value;
  }
  private async api(op: string, token: string, body: DeviceBody): Promise<void> {
    const request = http.createHttp();
    try {
      const response = await request.request(WEB_BASE + 'chores/native/' + op, {
        method: http.RequestMethod.POST, header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        extraData: JSON.stringify(body), connectTimeout: 8000, readTimeout: 10000
      });
      if (response.responseCode < 200 || response.responseCode >= 300)
        throw new Error(response.responseCode === 503 ? '服务器尚未配置安装版推送' : response.responseCode === 429 ? '等一分钟再试' : '设备绑定失败，请重试');
    } finally { request.destroy(); }
  }
  private async handle(raw: string, port: webview.WebMessagePort): Promise<void> {
    if (raw.length > 8192 || !this.validURL(this.controller.getUrl())) return;
    let request: BridgeRequest;
    try { request = JSON.parse(raw) as BridgeRequest; } catch (_) { return; }
    const prefs = preferences.getPreferencesSync(this.context, { name: 'install' });
    const result: BridgeResult = { id: request.id, ok: false, enabled: false, configured: JPUSH_APP_KEY.length === 24, message: '', platform: 'harmony' };
    if (this.pending) { result.message = '请等待当前通知操作完成'; this.respond(port, result); return; }
    this.pending = true;
    try {
      if (request.command === 'status') {
        result.enabled = prefs.getSync('enabled', false) === true && await notificationManager.isNotificationEnabled();
        result.ok = true;
      } else if (request.command === 'sync' && prefs.getSync('enabled', false) !== true) {
        result.ok = true;
      } else {
        if (!result.configured) throw new Error('安装版尚未配置推送应用');
        if (!request.token || request.token.length > 4096) throw new Error('请先选择正式宿舍中的自己');
        const body: DeviceBody = { platform: 'harmony', device_id: this.value('device_id'), device_secret: this.value('device_secret') };
        let op: string;
        if (request.command === 'enable' || request.command === 'sync') {
          if (request.command === 'enable') await notificationManager.requestEnableNotification(this.context);
          if (!(await notificationManager.isNotificationEnabled())) throw new Error('请在系统设置中允许轮到的通知');
          JPushInterface.setSmartPushEnable(this.context.getApplicationContext(), false);
          await JPushInterface.setDataInsightsEnable(this.context.getApplicationContext(), false);
          JPushInterface.setAppKey(JPUSH_APP_KEY); JPushInterface.setDebug(false);
          await JPushInterface.init(this.context);
          JPushInterface.resumePush();
          body.registration_id = await JPushInterface.getRegistrationId();
          if (!body.registration_id) throw new Error('推送设备还未注册，请稍后重试');
          op = 'subscribe';
        } else if (request.command === 'disable') op = 'unsubscribe';
        else if (request.command === 'test') op = 'test';
        else throw new Error('操作无效');
        await this.api(op, request.token, body);
        result.enabled = request.command !== 'disable'; result.ok = true;
        prefs.putSync('enabled', result.enabled);void prefs.flush();
        if (!result.enabled) JPushInterface.stopPush();
      }
    } catch (error) { result.message = (error as Error).message || '通知操作失败，请重试'; }
    finally { this.pending = false; this.respond(port, result); }
  }
  private respond(port: webview.WebMessagePort, result: BridgeResult): void {
    try { port.postMessageEvent(JSON.stringify(result)); } catch (_) { /* The initiating document may already be closed. */ }
  }
  private connect(): void {
    if (!this.validURL(this.controller.getUrl())) return;
    this.ports.forEach((port: webview.WebMessagePort) => port.close());
    this.ports = this.controller.createWebMessagePorts();
    const nativePort = this.ports[0];
    nativePort.onMessageEvent((message: webview.WebMessage) => {
      if (typeof message === 'string') this.handle(message, nativePort);
    });
    // Transfer one private port to this top-level document, never an unrestricted JS proxy.
    this.controller.runJavaScript(`window.addEventListener('message', function(e) { if(e.data==='lundao-native-port' && e.ports.length===1 && !window.DormNativePush) { window.DormNativePush=e.ports[0]; window.DormNativePush.start(); window.dispatchEvent(new Event('dorm-native-ready')); } });`)
      .then(() => this.controller.postMessage('lundao-native-port', [this.ports[1]], WEB_ORIGIN)).catch(() => {});
  }
  build() {
    Stack() {
    Web({ src: this.initialURL, controller: this.controller })
      .javaScriptAccess(true).domStorageAccess(true).fileAccess(false)
      .mixedMode(MixedMode.None)
      .onLoadIntercept((event) => event ? event.data.isMainFrame() && !this.validURL(event.data.getRequestUrl()) : false)
      .onPageBegin((event) => { if (event) this.beginLoad(event.url); })
      .onPageEnd((event) => {
        if (event && this.page.finish(event.url)) {
          clearTimeout(this.loadTimer); this.connectionFailed = false; this.connect();
        }
      })
      .onErrorReceive((event) => { if (event?.request.isMainFrame()) this.failLoad(event.request.getRequestUrl()); })
      .onHttpErrorReceive((event) => { if (event?.request.isMainFrame()) this.failLoad(event.request.getRequestUrl()); })
      .onSslErrorEventReceive((event) => event?.handler.handleCancel())
      .width('100%').height('100%')
    if (this.connectionFailed) {
      Column({ space: 28 }) {
        Text('暂时连接不上').fontSize(28).fontWeight(FontWeight.Bold).fontColor('#111111')
        Button('重新连接').width('100%').height(56).fontSize(18).fontColor('#FFFFFF')
          .backgroundColor('#111111').onClick(() => this.retryLoad())
      }.padding(28).justifyContent(FlexAlign.Center).width('100%').height('100%').backgroundColor('#FFFFFF')
    }
    }.width('100%').height('100%')
  }
}
