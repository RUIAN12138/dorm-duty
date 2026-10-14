import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { preferences } from '@kit.ArkData';
import { JPushInterface } from '@jg/push';
import { JPUSH_APP_KEY, WEB_ORIGIN, WEB_BASE } from '../PushConfig';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    const prefs = preferences.getPreferencesSync(this.context, { name: 'install' });
    if (JPUSH_APP_KEY.length === 24 && prefs.getSync('enabled', false) === true) {
      JPushInterface.setAppKey(JPUSH_APP_KEY);
      JPushInterface.setDebug(false);
      JPushInterface.init(this.context).then(() => this.handleClick(want)).catch(() => {});
    }
  }
  onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void { this.handleClick(want); }
  private async handleClick(want: Want): Promise<void> {
    try {
      const message = await JPushInterface.setClickWant(want, this.context.getApplicationContext());
      const route = message?.extras?.['url'];
      if (typeof route === 'string' && /^\/dorm-duty\/(?:water|calendar)?$/.test(route)) {
        AppStorage.setOrCreate('launchURL', WEB_ORIGIN + route);
        this.context.eventHub.emit('notification-route', WEB_ORIGIN + route);
      }
    } catch (_) { /* Normal app launches have no push payload. */ }
  }
  onWindowStageCreate(stage: window.WindowStage): void { stage.loadContent('pages/Index'); }
}
