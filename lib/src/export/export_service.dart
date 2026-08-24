import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';

class ExportService {
  static Future<Uri?> savePortableHtml(String html) => FilePicker.saveFile(
    dialogTitle: 'Export portable Finance OS',
    fileName: _timestampedName('finance-os-portable', 'html'),
    bytes: Uint8List.fromList(utf8.encode(html)),
    mimeType: 'text/html',
  );

  static Future<Uri?> saveJson(String json) => FilePicker.saveFile(
    dialogTitle: 'Export Finance OS JSON backup',
    fileName: _timestampedName('finance-os-backup', 'json'),
    bytes: Uint8List.fromList(utf8.encode(json)),
    mimeType: 'application/json',
  );

  static String _timestampedName(String prefix, String extension) {
    final now = DateTime.now();
    String two(int value) => value.toString().padLeft(2, '0');
    final stamp =
        '${now.year}${two(now.month)}${two(now.day)}-'
        '${two(now.hour)}${two(now.minute)}${two(now.second)}';
    return '$prefix-$stamp.$extension';
  }
}
