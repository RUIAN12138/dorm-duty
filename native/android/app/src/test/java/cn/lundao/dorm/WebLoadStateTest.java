package cn.lundao.dorm;

import org.junit.Test;
import static org.junit.Assert.*;

public final class WebLoadStateTest {
  private final String home="https://8.148.190.114/dorm-duty/";
  private final String water=home+"water";

  @Test public void errorIsNotClearedByPageFinished() {
    WebLoadState state=new WebLoadState(home);state.begin(home);
    assertTrue(state.fail(home));assertFalse(state.finish(home));
    assertFalse(state.fail(home));assertEquals(home,state.url());
  }
  @Test public void retryKeepsTheSamePageAndCanFinish() {
    WebLoadState state=new WebLoadState(home);state.begin(water);
    assertTrue(state.fail(water));state.begin(state.url());
    assertEquals(water,state.url());assertTrue(state.finish(water));
    assertFalse(state.fail(water));
  }
  @Test public void staleNavigationAndSubresourceErrorsAreIgnored() {
    WebLoadState state=new WebLoadState(home);state.begin(home);state.begin(water);
    assertFalse(state.fail(home));assertFalse(state.finish(home));
    assertFalse(state.fail(home+"assets/index.js"));assertTrue(state.finish(water));
  }
  @Test public void committedPageDoesNotBecomeAnErrorWhenItsTimeoutArrivesLate() {
    WebLoadState state=new WebLoadState(home);state.begin(water);
    assertTrue(state.finish(water));assertFalse(state.fail(water));
  }
}
