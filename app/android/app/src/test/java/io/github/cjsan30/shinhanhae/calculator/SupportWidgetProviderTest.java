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

    @Test
    public void selectsResponsiveLayoutFromWidgetSize() {
        assertEquals(R.layout.widget_1x1, SupportWidgetProvider.layoutForSize(80, 40));
        assertEquals(R.layout.widget_2x1, SupportWidgetProvider.layoutForSize(140, 40));
        assertEquals(R.layout.widget_4x1, SupportWidgetProvider.layoutForSize(200, 40));
        assertEquals(R.layout.widget_4x1_detail, SupportWidgetProvider.layoutForSize(250, 40));
        assertEquals(R.layout.widget_5x1, SupportWidgetProvider.layoutForSize(310, 40));
        assertEquals(R.layout.widget_4x2, SupportWidgetProvider.layoutForSize(250, 110));
    }
}
