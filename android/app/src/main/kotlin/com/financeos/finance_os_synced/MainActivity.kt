package com.financeos.finance_os_synced

import android.content.Intent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var pendingTreeResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger

        MethodChannel(messenger, PICK_TREE_CHANNEL).setMethodCallHandler { call, result ->
            if (call.method != "pick") {
                result.notImplemented()
                return@setMethodCallHandler
            }
            pendingTreeResult?.success(null)
            pendingTreeResult = result
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                addFlags(
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or
                        Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                        Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
                )
            }
            @Suppress("DEPRECATION")
            startActivityForResult(intent, PICK_TREE_REQUEST)
        }

        MethodChannel(messenger, SAF_CHANNEL).setMethodCallHandler { call, result ->
            FinanceSafOps.handle(applicationContext, call, result)
        }
    }

    @Deprecated("Deprecated in Android; retained for Flutter activity compatibility")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == PICK_TREE_REQUEST) {
            val result = pendingTreeResult
            pendingTreeResult = null
            val treeUri = data?.data
            if (resultCode == RESULT_OK && treeUri != null) {
                contentResolver.takePersistableUriPermission(
                    treeUri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or
                        Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
                )
                result?.success(treeUri.toString())
            } else {
                result?.success(null)
            }
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    companion object {
        private const val PICK_TREE_CHANNEL = "finance_os/saf_pick_tree"
        private const val SAF_CHANNEL = "finance_os/saf"
        private const val PICK_TREE_REQUEST = 7301
    }
}
