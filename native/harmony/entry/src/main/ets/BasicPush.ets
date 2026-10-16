import { common } from '@kit.AbilityKit';
import { JPushInterface, CallBackMsg, JMessage } from '@jg/push';
import { JPUSH_APP_KEY, WEB_ORIGIN } from './PushConfig';

class BasicPushEvents extends CallBackMsg {
  onClickMessage(message: JMessage): void { BasicPush.openMessage(message); }
}

// Configure the SDK once before initialization. No SDK connection is started
// until the user enables notifications (or restores their previous opt-in).
export class BasicPush {
  private static configured: boolean = false;
  private static preparation: Promise<void> | undefined;
  private static starting: Promise<void> | undefined;
  private static context: common.UIAbilityContext | undefined;
  private static lastOpenedId: string = '';

  static configure(context: common.ApplicationContext): void {
    if (BasicPush.configured) return;
    BasicPush.configured = true;
    JPushInterface.setContext(context);
    JPushInterface.setAppKey(JPUSH_APP_KEY);
    JPushInterface.setDebug(false);
    JPushInterface.setChannel('dorm-direct');
    JPushInterface.setUserRequestNotificationPermission(context, true);
    JPushInterface.setBackgroundEnable(true);
    JPushInterface.setSmartPushEnable(context, false);
    BasicPush.preparation = JPushInterface.setDataInsightsEnable(context, false);
    // An unsuccessful preparation is reported by start(); never leak SDK data.
    BasicPush.preparation.catch(() => {});
    JPushInterface.setCallBackMsg(new BasicPushEvents());
  }

  static attach(context: common.UIAbilityContext): void {
    BasicPush.context = context;
    BasicPush.configure(context.getApplicationContext());
  }

  static detach(): void { BasicPush.context = undefined; }

  static async start(context: common.UIAbilityContext): Promise<void> {
    BasicPush.attach(context);
    if (!BasicPush.starting) {
      BasicPush.starting = BasicPush.initialize(context).finally(() => { BasicPush.starting = undefined; });
    }
    await BasicPush.starting;
  }

  private static async initialize(context: common.UIAbilityContext): Promise<void> {
    await BasicPush.preparation;
    await JPushInterface.init(context);
    JPushInterface.resumePush();
  }

  static async registration(context: common.UIAbilityContext): Promise<string> {
    await BasicPush.start(context);
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const registration = await JPushInterface.getRegistrationId();
      if (registration) return registration;
      await new Promise<void>((resolve) => { setTimeout(resolve, 200); });
    }
    throw new Error('推送设备注册超时，请检查网络后重试');
  }

  static openMessage(message: JMessage | undefined): void {
    const route = message?.extras?.['url'];
    if (typeof route !== 'string' || !/^\/dorm-duty\/(?:water|calendar)?$/.test(route)) return;
    if (message?.msgId && message.msgId === BasicPush.lastOpenedId) return;
    BasicPush.lastOpenedId = message?.msgId || '';
    AppStorage.setOrCreate('launchURL', WEB_ORIGIN + route);
    BasicPush.context?.eventHub.emit('notification-route', WEB_ORIGIN + route);
  }
}
