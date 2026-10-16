package cn.lundao.dorm;

import cn.jpush.android.service.JCommonService;
import org.junit.Test;
import static org.junit.Assert.assertTrue;

public class PushIntegrationTest {
    @Test public void customServiceUsesTheSdkEntryPoint() {
        assertTrue(JCommonService.class.isAssignableFrom(DormPushService.class));
    }
}
