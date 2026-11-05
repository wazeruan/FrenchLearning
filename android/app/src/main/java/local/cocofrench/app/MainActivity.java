// Coco · French for Android: a WebView around the offline course.
// The course files live in the APK (assets/web) and are served to the page from
// https://appassets.androidplatform.net/assets/ — a secure origin, so the microphone, workers and
// WebAssembly work as on the Mac. Progress is kept in the WebView's local storage for that origin.
package local.cocofrench.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import androidx.webkit.WebViewFeature;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/assets/index.html";
    private static final int REQ_MIC = 1, REQ_OPEN = 2, REQ_SAVE = 3;

    // The page needs exact types: module workers and WebAssembly are refused as text/plain.
    private static final Map<String, String> TYPES = new HashMap<>();
    static {
        TYPES.put("html", "text/html");
        TYPES.put("css", "text/css");
        TYPES.put("js", "text/javascript");
        TYPES.put("mjs", "text/javascript");
        TYPES.put("json", "application/json");
        TYPES.put("svg", "image/svg+xml");
        TYPES.put("png", "image/png");
        TYPES.put("m4a", "audio/mp4");
        TYPES.put("wasm", "application/wasm");
        TYPES.put("onnx", "application/octet-stream");
    }

    private WebView web;
    private PermissionRequest pendingMic;
    private ValueCallback<Uri[]> pendingOpen;
    private String pendingSave;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); // a lesson shouldn't dim mid-word

        // Debug builds only: inspect the page from chrome://inspect on the computer.
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);
        web = new WebView(this);
        web.setBackgroundColor(getColor(R.color.bg));
        // Keep the page's renderer at foreground priority while visible; let Android reclaim it in the background.
        web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
        // Keep the page clear of the status bar, navigation bar, camera cutout and keyboard. A WebView ignores
        // its own padding, so it sits in a frame that is padded instead.
        FrameLayout root = new FrameLayout(this);
        root.addView(web);
        setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // pronunciation plays automatically
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        // Follow the system font size a little (One UI defaults are often above 100%), but cap it so
        // the phone layout still fits a Fold cover screen.
        float scale = getResources().getConfiguration().fontScale;
        s.setTextZoom(Math.round(100 * Math.max(1f, Math.min(scale, 1.15f))));
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(s, false); // the page's own dark theme is used
        }

        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", this::serveAsset)
                .build();
        web.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (HOST.equals(url.getHost())) return false;
                // Never browse the web inside the app.
                try { startActivity(new Intent(Intent.ACTION_VIEW, url)); } catch (ActivityNotFoundException ignored) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                // Only our own page may use the microphone, and only for audio.
                boolean ours = HOST.equals(request.getOrigin().getHost());
                boolean audioOnly = request.getResources().length == 1
                        && PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(request.getResources()[0]);
                if (!ours || !audioOnly) { request.deny(); return; }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(request.getResources());
                } else {
                    if (pendingMic != null) pendingMic.deny(); // only the newest request waits for the answer
                    pendingMic = request;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                // Import backup: pick a .json file.
                if (pendingOpen != null) pendingOpen.onReceiveValue(null);
                pendingOpen = callback;
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                        .putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
                try { startActivityForResult(pick, REQ_OPEN); } catch (ActivityNotFoundException e) { pendingOpen = null; return false; }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "CocoAndroid");

        if (saved != null) web.restoreState(saved);
        else web.loadUrl(START);
    }

    private WebResourceResponse serveAsset(String path) {
        try {
            InputStream in = getAssets().open("web/" + path);
            String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
            String type = TYPES.containsKey(ext) ? TYPES.get(ext) : "application/octet-stream";
            String enc = type.startsWith("text/") || type.endsWith("json") || type.endsWith("xml") ? "utf-8" : null;
            WebResourceResponse r = new WebResourceResponse(type, enc, in);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            r.setResponseHeaders(headers);
            return r;
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
        }
    }

    /** Exposed to the page as window.CocoAndroid. */
    private final class Bridge {
        // Export backup: the WebView can't download blob: links, so the page hands the text over here.
        @JavascriptInterface
        public void saveFile(String name, String text) {
            runOnUiThread(() -> {
                pendingSave = text;
                Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("application/json").putExtra(Intent.EXTRA_TITLE, name);
                try { startActivityForResult(save, REQ_SAVE); }
                catch (ActivityNotFoundException e) { pendingSave = null; toast("No app can save files on this device."); }
            });
        }

        // Light/dark chosen in Settings: color the strips behind the status and navigation bars to match.
        @JavascriptInterface
        public void setTheme(String theme) {
            runOnUiThread(() -> applyBars(theme));
        }
    }

    private void applyBars(String theme) {
        boolean systemDark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        boolean dark = "dark".equals(theme) || (!"light".equals(theme) && systemDark);
        int bg = dark ? 0xFF15171F : 0xFFFBF7F0; // --bg in css/styles.css
        web.setBackgroundColor(bg);
        getWindow().getDecorView().setBackgroundColor(bg);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(!dark);
        bars.setAppearanceLightNavigationBars(!dark);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        if (code != REQ_MIC || pendingMic == null) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) pendingMic.grant(pendingMic.getResources());
        else pendingMic.deny();
        pendingMic = null;
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
        if (code == REQ_OPEN && pendingOpen != null) {
            pendingOpen.onReceiveValue(uri != null ? new Uri[]{uri} : null);
            pendingOpen = null;
        } else if (code == REQ_SAVE && pendingSave != null) {
            if (uri != null) {
                try (OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                    out.write(pendingSave.getBytes(StandardCharsets.UTF_8));
                    toast("Backup saved");
                } catch (IOException | NullPointerException e) {
                    new AlertDialog.Builder(this).setMessage("The backup couldn't be saved.\n\n" + e.getMessage())
                            .setPositiveButton(android.R.string.ok, null).show();
                }
            }
            pendingSave = null;
        }
    }

    private void toast(String msg) { Toast.makeText(this, msg, Toast.LENGTH_SHORT).show(); }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // Back goes to the previous screen of the course; at the start, leave the app.
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause(); // releases the microphone and stops audio in the background
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
