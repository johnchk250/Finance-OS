import 'dart:convert';
import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;

abstract class SyncFolder {
  const SyncFolder(this.root);

  final String root;

  Future<List<String>> listFiles();
  Future<String> readText(String relativePath);
  Future<void> writeText(String relativePath, String contents);

  static Future<String?> pick() async {
    if (Platform.isAndroid) {
      return const MethodChannel(
        'finance_os/saf_pick_tree',
      ).invokeMethod<String>('pick');
    }
    return FilePicker.getDirectoryPath(
      dialogTitle: 'Choose Conduit sync folder',
    );
  }

  static SyncFolder fromRoot(String root) =>
      Platform.isAndroid ? AndroidSafSyncFolder(root) : LocalSyncFolder(root);
}

class LocalSyncFolder extends SyncFolder {
  const LocalSyncFolder(super.root);

  @override
  Future<List<String>> listFiles() async {
    final directory = Directory(root);
    if (!directory.existsSync()) return const [];
    final files = <String>[];
    await for (final entity in directory.list(recursive: true)) {
      if (entity is! File) continue;
      files.add(p.relative(entity.path, from: root).replaceAll('\\', '/'));
    }
    return files;
  }

  @override
  Future<String> readText(String relativePath) =>
      File(p.joinAll([root, ...relativePath.split('/')])).readAsString();

  @override
  Future<void> writeText(String relativePath, String contents) async {
    final target = File(p.joinAll([root, ...relativePath.split('/')]));
    target.parent.createSync(recursive: true);
    final temporary = File('${target.path}.tmp');
    await temporary.writeAsString(contents, flush: true);
    if (target.existsSync()) await target.delete();
    await temporary.rename(target.path);
  }
}

class AndroidSafSyncFolder extends SyncFolder {
  const AndroidSafSyncFolder(super.root);

  static const _channel = MethodChannel('finance_os/saf');

  @override
  Future<List<String>> listFiles() async {
    final result = await _channel.invokeMethod<List<dynamic>>('listFiles', {
      'treeUri': root,
    });
    return (result ?? const []).map((entry) => entry.toString()).toList();
  }

  @override
  Future<String> readText(String relativePath) async {
    final result = await _channel.invokeMethod<Uint8List>('read', {
      'treeUri': root,
      'relPath': _safe(relativePath),
    });
    if (result == null) {
      throw FileSystemException('File not found', relativePath);
    }
    return utf8.decode(result);
  }

  @override
  Future<void> writeText(String relativePath, String contents) async {
    await _channel.invokeMethod<void>('write', {
      'treeUri': root,
      'relPath': _safe(relativePath),
      'data': Uint8List.fromList(utf8.encode(contents)),
    });
  }

  String _safe(String relativePath) {
    final normalized = p.posix.normalize(relativePath.replaceAll('\\', '/'));
    if (normalized == '..' ||
        normalized.startsWith('../') ||
        normalized.startsWith('/')) {
      throw ArgumentError.value(relativePath, 'relativePath', 'Unsafe path');
    }
    return normalized;
  }
}
