package io.github.cjsan30.shinhanhae.calculator;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class SupportWidgetProviderTest {
    @Test
    public void roundsUsageToOneDecimalPlaceLikeTheApp() {
        int progress = SupportWidgetProvider.progress(23_700, 200_000);

        assertEquals(119, progress);
        assertEquals("11.9%", SupportWidgetProvider.percent(progress));
    }

    @Test
    public void clampsInvalidAndOverLimitProgress() {
        assertEquals(0, SupportWidgetProvider.progress(1_000, 0));
        assertEquals(0, SupportWidgetProvider.progress(-1, 100));
        assertEquals(1_000, SupportWidgetProvider.progress(120, 100));
    }
}
