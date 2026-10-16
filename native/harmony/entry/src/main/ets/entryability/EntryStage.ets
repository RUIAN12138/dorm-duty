import { AbilityStage } from '@kit.AbilityKit';
import { BasicPush } from '../BasicPush';

export default class EntryStage extends AbilityStage {
  onCreate(): void { BasicPush.configure(this.context.getApplicationContext()); }
}
