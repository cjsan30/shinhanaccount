package io.github.cjsan30.shinhanhae.calculator;
import org.junit.Test;
import static org.junit.Assert.*;

public class ExternalAppPluginTest {
    @Test public void onlyApprovedHttpsSourcesCanBeOpened() {
        assertTrue(ExternalAppPlugin.isAllowedWebsite("https://shinchunghae.co.kr/"));
        assertTrue(ExternalAppPlugin.isAllowedWebsite("https://www.shinhanfoundation.or.kr/project/financial/07"));
        for (String url : new String[]{null, "javascript:alert(1)", "http://shinchunghae.co.kr/", "https://shinchunghae.co.kr.evil.test/", "https://evil.test/", "https://shinchunghae.co.kr/?account=1234"}) {
            assertFalse(ExternalAppPlugin.isAllowedWebsite(url));
        }
    }
}
