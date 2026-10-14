package cn.lundao.dorm;

import android.Manifest;
import android.app.*;
import android.os.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.webkit.*;
import androidx.webkit.*;
import cn.jpush.android.api.JPushInterface;
import org.json.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
  public static final String ORIGIN="https://8.148.190.114", BASE=ORIGIN+"/dorm-duty/";
  private WebView web;
  private SharedPreferences prefs;
  private final ExecutorService io=Executors.newSingleThreadExecutor();
  private JSONObject pendingPermission;
  private JavaScriptReplyProxy pendingReply;
  private boolean handlingBack;
  static boolean trusted(String value) {
    Uri uri=Uri.parse(value==null?"":value);
    return "https".equals(uri.getScheme()) && "8.148.190.114".equals(uri.getHost()) && (uri.getPort()==-1||uri.getPort()==443) && uri.getUserInfo()==null && uri.getPath()!=null && uri.getPath().startsWith("/dorm-duty/");
  }
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    prefs=getSharedPreferences("install",MODE_PRIVATE);
    if(Build.VERSION.SDK_INT>=26) getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel("dorm-reminders","室友提醒",NotificationManager.IMPORTANCE_HIGH));
    web=new WebView(this);
    WebSettings settings=web.getSettings();
    settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    web.setWebViewClient(new WebViewClient(){
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) { return request.isForMainFrame() && !trusted(request.getUrl().toString()); }
      @Override public void onReceivedSslError(WebView view,android.webkit.SslErrorHandler handler,android.net.http.SslError error){handler.cancel();}
    });
    if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
      WebViewCompat.addWebMessageListener(web,"DormNativePush",Collections.singleton(ORIGIN),(view,message,origin,mainFrame,reply)->{
        if(!mainFrame || !trusted(view.getUrl()) || !ORIGIN.equals(origin.toString())) return;
        try {
          String raw=message.getData();if(raw==null||raw.length()>8192) return;
          JSONObject request=new JSONObject(raw);
          if("enable".equals(request.optString("command")) && Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) {
            if(pendingPermission!=null){respond(reply,request,false,"请先完成通知授权",false);return;}
            pendingPermission=request;pendingReply=reply;requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},31);
          } else io.execute(()->handle(request,reply));
        } catch(Exception ignored){ /* Never log credentials or provider data. */ }
      });
    }
    setContentView(web);
    String route=getIntent().getStringExtra("route");
    if(state!=null) web.restoreState(state);else web.loadUrl(trusted(route)?route:BASE);
  }
  @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] grants) {
    super.onRequestPermissionsResult(requestCode,permissions,grants);
    if(requestCode==31 && pendingPermission!=null){JSONObject request=pendingPermission;JavaScriptReplyProxy reply=pendingReply;pendingPermission=null;pendingReply=null;
      if(grants.length>0 && grants[0]==PackageManager.PERMISSION_GRANTED) io.execute(()->handle(request,reply));
      else respond(reply,request,false,"请在系统设置中允许轮到的通知",false);
    }
  }
  private String installValue(String key) {
    String value=prefs.getString(key,"");
    if(value.isEmpty()){byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);StringBuilder s=new StringBuilder();for(byte b:bytes)s.append(String.format(Locale.ROOT,"%02x",b&255));value=s.toString();prefs.edit().putString(key,value).commit();}
    return value;
  }
  private boolean granted(){return (Build.VERSION.SDK_INT<24||getSystemService(NotificationManager.class).areNotificationsEnabled()) && (Build.VERSION.SDK_INT<33||checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED);}
  private void handle(JSONObject request,JavaScriptReplyProxy reply) {
    try {
      String command=request.getString("command");boolean configured=BuildConfig.JPUSH_APPKEY.matches("[a-fA-F0-9]{24}");
      if(command.equals("status")){respond(reply,request,true,configured?"":"安装版尚未配置推送应用",prefs.getBoolean("enabled",false)&&granted());return;}
      if(!Arrays.asList("enable","sync","disable","test").contains(command))throw new Exception("操作无效");
      if(command.equals("sync") && (!prefs.getBoolean("enabled",false)||!granted())){respond(reply,request,true,"",false);return;}
      if(!configured)throw new Exception("安装版尚未配置推送应用");
      String token=request.optString("token");if(token.isEmpty()||token.length()>4096)throw new Exception("请先选择正式宿舍中的自己");
      JSONObject body=new JSONObject().put("platform","android").put("device_id",installValue("device_id")).put("device_secret",installValue("device_secret"));
      String op;
      if(command.equals("enable")||command.equals("sync")) {
        if(!granted())throw new Exception("请在系统设置中允许通知");
        JPushInterface.setDebugMode(false);JPushInterface.init(getApplicationContext());JPushInterface.resumePush(getApplicationContext());
        String registration="";for(int i=0;i<100 && registration.isEmpty();i++){registration=JPushInterface.getRegistrationID(getApplicationContext());if(registration==null)registration="";if(registration.isEmpty())Thread.sleep(200);}
        if(registration.isEmpty())throw new Exception("推送设备注册超时，请检查网络后重试");
        body.put("registration_id",registration);op="subscribe";
      } else op=command.equals("test")?"test":"unsubscribe";
      api(op,token,body);
      boolean enabled=!command.equals("disable");prefs.edit().putBoolean("enabled",enabled).apply();
      if(!enabled)JPushInterface.stopPush(getApplicationContext());
      respond(reply,request,true,"",enabled);
    }catch(Exception error){respond(reply,request,false,error.getMessage()==null?"通知操作失败，请重试":error.getMessage(),false);}
  }
  private void api(String op,String token,JSONObject body)throws Exception {
    HttpURLConnection connection=(HttpURLConnection)new URL(BASE+"chores/native/"+op).openConnection();
    try{
      connection.setRequestMethod("POST");connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(8000);connection.setReadTimeout(10000);connection.setDoOutput(true);
      connection.setRequestProperty("Authorization","Bearer "+token);connection.setRequestProperty("Content-Type","application/json");
      try(java.io.OutputStream out=connection.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}
      int status=connection.getResponseCode();if(status<200||status>=300)throw new Exception(status==503?"服务器尚未配置安装版推送":status==429?"刚刚已发送测试，等一分钟再试":status==401?"身份已失效，请重新选择自己":"通知设备绑定失败，请重试");
    }finally{connection.disconnect();}
  }
  private void respond(JavaScriptReplyProxy reply,JSONObject request,boolean ok,String message,boolean enabled){
    try {String value=new JSONObject().put("id",request.optString("id")).put("ok",ok).put("message",message).put("enabled",enabled).put("platform","android").put("configured",BuildConfig.JPUSH_APPKEY.matches("[a-fA-F0-9]{24}")).toString();runOnUiThread(()->{if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))reply.postMessage(value);});}catch(JSONException ignored){}
  }
  @Override protected void onSaveInstanceState(Bundle out){web.saveState(out);super.onSaveInstanceState(out);}
  @Override public void onBackPressed(){
    if(handlingBack || web==null)return;
    if(!trusted(web.getUrl())){navigateBack();return;}
    handlingBack=true;
    String page=web.getUrl();
    web.evaluateJavascript("typeof window.DormNativeBack === 'function' && window.DormNativeBack()",result->{
      handlingBack=false;
      if(isFinishing()||isDestroyed()||!Objects.equals(page,web.getUrl()))return;
      if(!"true".equals(result))navigateBack();
    });
  }
  private void navigateBack(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
  @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);String url=intent.getStringExtra("route");if(trusted(url))web.loadUrl(url);}
  @Override protected void onDestroy(){io.shutdownNow();web.destroy();super.onDestroy();}
}
