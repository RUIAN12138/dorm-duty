package cn.lundao.dorm;
import android.content.*;
import cn.jpush.android.service.JPushMessageReceiver;
import cn.jpush.android.api.NotificationMessage;
import org.json.JSONObject;
public final class PushReceiver extends JPushMessageReceiver {
 @Override public void onNotifyMessageOpened(Context context,NotificationMessage message){
  String url=MainActivity.BASE;
  try{String route=new JSONObject(message.notificationExtras).optString("url");String candidate=MainActivity.ORIGIN+route;if(MainActivity.trusted(candidate))url=candidate;}catch(Exception ignored){}
  context.startActivity(new Intent(context,MainActivity.class).putExtra("route",url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP));
 }
}
