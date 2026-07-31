package io.github.cjsan30.shinhanhae.calculator;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(SmsBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}