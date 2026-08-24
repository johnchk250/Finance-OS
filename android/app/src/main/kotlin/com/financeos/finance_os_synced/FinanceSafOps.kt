package com.financeos.finance_os_synced

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.DocumentsContract
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors

object FinanceSafOps {
    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    fun handle(context: Context, call: MethodCall, result: MethodChannel.Result) {
        executor.execute {
            try {
                val value: Any? = when (call.method) {
                    "listFiles" -> listFiles(context, call.argument<String>("treeUri")!!)
                    "read" -> read(
                        context,
                        call.argument<String>("treeUri")!!,
                        safePath(call.argument<String>("relPath")!!),
                    )
                    "write" -> {
                        write(
                            context,
                            call.argument<String>("treeUri")!!,
                            safePath(call.argument<String>("relPath")!!),
                            call.argument<ByteArray>("data")!!,
                        )
                        null
                    }
                    else -> {
                        mainHandler.post { result.notImplemented() }
                        return@execute
                    }
                }
                mainHandler.post { result.success(value) }
            } catch (error: Throwable) {
                mainHandler.post {
                    result.error("saf_error", error.message ?: error.toString(), null)
                }
            }
        }
    }

    private fun safePath(path: String): String {
        val segments = path.replace('\\', '/').split('/').filter { it.isNotEmpty() }
        require(segments.isNotEmpty() && segments.none { it == "." || it == ".." }) {
            "Unsafe relative path: $path"
        }
        return segments.joinToString("/")
    }

    private fun rootUri(treeUri: String): Uri {
        val tree = Uri.parse(treeUri)
        return DocumentsContract.buildDocumentUriUsingTree(
            tree,
            DocumentsContract.getTreeDocumentId(tree),
        )
    }

    private fun findChildUri(context: Context, parent: Uri, name: String): Uri? {
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(
            parent,
            DocumentsContract.getDocumentId(parent),
        )
        context.contentResolver.query(
            children,
            arrayOf(
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            ),
            null,
            null,
            null,
        )?.use { cursor ->
            while (cursor.moveToNext()) {
                if (cursor.getString(1) == name) {
                    return DocumentsContract.buildDocumentUriUsingTree(
                        parent,
                        cursor.getString(0),
                    )
                }
            }
        }
        return null
    }

    private fun resolve(context: Context, treeUri: String, relativePath: String): Uri? {
        var current = rootUri(treeUri)
        for (segment in safePath(relativePath).split('/')) {
            current = findChildUri(context, current, segment) ?: return null
        }
        return current
    }

    private fun ensureParents(context: Context, treeUri: String, relativePath: String): Uri {
        var current = rootUri(treeUri)
        for (segment in safePath(relativePath).split('/').dropLast(1)) {
            current = findChildUri(context, current, segment)
                ?: DocumentsContract.createDocument(
                    context.contentResolver,
                    current,
                    DocumentsContract.Document.MIME_TYPE_DIR,
                    segment,
                )
                ?: error("Could not create directory: $segment")
        }
        return current
    }

    private fun listFiles(context: Context, treeUri: String): ArrayList<String> {
        val output = ArrayList<String>()
        listRecursive(context, rootUri(treeUri), "", output)
        return output
    }

    private fun listRecursive(
        context: Context,
        directory: Uri,
        prefix: String,
        output: ArrayList<String>,
    ) {
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(
            directory,
            DocumentsContract.getDocumentId(directory),
        )
        context.contentResolver.query(
            children,
            arrayOf(
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE,
            ),
            null,
            null,
            null,
        )?.use { cursor ->
            while (cursor.moveToNext()) {
                val child = DocumentsContract.buildDocumentUriUsingTree(
                    directory,
                    cursor.getString(0),
                )
                val name = cursor.getString(1) ?: continue
                val path = if (prefix.isEmpty()) name else "$prefix/$name"
                if (cursor.getString(2) == DocumentsContract.Document.MIME_TYPE_DIR) {
                    listRecursive(context, child, path, output)
                } else {
                    output.add(path)
                }
            }
        }
    }

    private fun read(context: Context, treeUri: String, relativePath: String): ByteArray {
        val target = resolve(context, treeUri, relativePath)
            ?: error("File not found: $relativePath")
        context.contentResolver.openInputStream(target).use { input ->
            requireNotNull(input) { "Could not open: $relativePath" }
            val output = ByteArrayOutputStream()
            input.copyTo(output)
            return output.toByteArray()
        }
    }

    private fun write(
        context: Context,
        treeUri: String,
        relativePath: String,
        bytes: ByteArray,
    ) {
        val name = relativePath.substringAfterLast('/')
        val parent = ensureParents(context, treeUri, relativePath)
        val target = findChildUri(context, parent, name)
            ?: DocumentsContract.createDocument(
                context.contentResolver,
                parent,
                "application/json",
                name,
            )
            ?: error("Could not create: $relativePath")
        context.contentResolver.openOutputStream(target, "wt").use { output ->
            requireNotNull(output) { "Could not write: $relativePath" }
            output.write(bytes)
            output.flush()
        }
    }
}
