package cn.lundao.dorm;

/** Ignore late callbacks from an older navigation and never hide an error on pageFinished. */
final class WebLoadState {
  private String url;
  private boolean failed;
  private boolean loading;

  WebLoadState(String initialURL) { url=initialURL; }
  String url() { return url; }
  void begin(String nextURL) { url=nextURL;failed=false;loading=true; }
  boolean fail(String requestURL) {
    if(!loading || !url.equals(requestURL))return false;
    failed=true;loading=false;return true;
  }
  boolean finish(String requestURL) {
    if(failed || !url.equals(requestURL))return false;
    loading=false;return true;
  }
}
