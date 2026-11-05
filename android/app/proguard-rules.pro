# Methods the page calls through window.CocoAndroid must keep their names.
-keepclassmembers class local.cocofrench.app.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
