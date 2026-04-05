package com.skylite.app;

import android.content.Intent;
import android.os.Bundle;
import org.json.JSONObject;
import java.util.Collections;
import java.util.Set;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final Set<String> ALLOWED_WIDGET_ROUTES =
            Collections.singleton("/mealPlanner");

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleWidgetIntent();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleWidgetIntent();
    }

    private void handleWidgetIntent() {
        Intent intent = getIntent();
        if (intent != null && intent.hasExtra("route")) {
            String route = intent.getStringExtra("route");
            if (route != null && !route.isEmpty()) {
                if (!ALLOWED_WIDGET_ROUTES.contains(route)) {
                    return;
                }
                String js = "window.location.hash = " + JSONObject.quote(route) + ";";
                getBridge().evalOnLoadUrl(js);
                intent.removeExtra("route");
            }
        }
    }
}
