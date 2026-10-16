import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { preferences } from '@kit.ArkData';
import { notificationManager } from '@kit.NotificationKit';
import { JPushInterface } from '@jg/push';
import { BasicPush } from '../BasicPush';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    BasicPush.attach(this.context);
    void this.restorePush().then(() => this.handleClick(want));
  }
  onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void { this.handleClick(want); }
  onForeground(): void { void this.restorePush(); }
  onDestroy(): void { BasicPush.detach(); }
  private async restorePush(): Promise<void> {
    const prefs = preferences.getPreferencesSync(this.context, { name: 'install' });
    if (prefs.getSync('enabled', false) !== true) return;
    try {
      if (await notificationManager.isNotificationEnabled()) await BasicPush.start(this.context);
    } catch (_) { /* Opening the app still works when the push connection fails. */ }
  }
  private async handleClick(want: Want): Promise<void> {
    try {
      const message = await JPushInterface.setClickWant(want, this.context.getApplicationContext());
      BasicPush.openMessage(message);
    } catch (_) { /* Normal app launches have no push payload. */ }
  }
  onWindowStageCreate(stage: window.WindowStage): void { stage.loadContent('pages/Index'); }
}
