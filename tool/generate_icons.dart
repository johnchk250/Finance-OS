// ignore_for_file: avoid_print

import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:finance_os_synced/src/widgets/finance_logo.dart';
import 'package:flutter/material.dart';

/// Renders the source-based FinanceLogo at [size] x [size] pixels and returns PNG bytes.
Future<Uint8List> renderLogoPng(int size, {bool showBackground = true}) async {
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  final painter = FinanceLogoPainter(showBackground: showBackground);

  painter.paint(canvas, Size(size.toDouble(), size.toDouble()));
  final picture = recorder.endRecording();
  final image = await picture.toImage(size, size);
  final byteData = await image.toByteData(format: ui.ImageByteFormat.png);

  if (byteData == null) {
    throw StateError('Failed to encode PNG for size $size');
  }
  return byteData.buffer.asUint8List();
}

/// Builds a Windows .ico binary containing multiple PNG images.
Uint8List buildIcoFile(Map<int, Uint8List> pngBySize) {
  final sizes = pngBySize.keys.toList()..sort();
  final count = sizes.length;

  final headerSize = 6;
  final dirEntrySize = 16;
  final dirSize = headerSize + (count * dirEntrySize);

  final builder = BytesBuilder();

  // ICO Header: Reserved (2), Type=1 (2), Count (2)
  final header = ByteData(6);
  header.setUint16(0, 0, Endian.little);
  header.setUint16(2, 1, Endian.little);
  header.setUint16(4, count, Endian.little);
  builder.add(header.buffer.asUint8List());

  int currentOffset = dirSize;

  // ICO Directory Entries
  for (final size in sizes) {
    final pngData = pngBySize[size]!;
    final entry = ByteData(16);

    entry.setUint8(0, size >= 256 ? 0 : size); // Width (0 means 256)
    entry.setUint8(1, size >= 256 ? 0 : size); // Height (0 means 256)
    entry.setUint8(2, 0); // Palette count
    entry.setUint8(3, 0); // Reserved
    entry.setUint16(4, 1, Endian.little); // Color planes
    entry.setUint16(6, 32, Endian.little); // Bits per pixel
    entry.setUint32(8, pngData.length, Endian.little); // Image data length
    entry.setUint32(12, currentOffset, Endian.little); // Image data offset

    builder.add(entry.buffer.asUint8List());
    currentOffset += pngData.length;
  }

  // PNG Payloads
  for (final size in sizes) {
    builder.add(pngBySize[size]!);
  }

  return builder.toBytes();
}

/// Generates all project icons from the source vector definition.
Future<void> generateAllIcons({String projectRoot = '.'}) async {
  print('Generating Finance OS source-based icons...');

  // 1. Android Launcher Icons
  final androidSizes = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
  };

  for (final entry in androidSizes.entries) {
    final folder = entry.key;
    final size = entry.value;
    final pngBytes = await renderLogoPng(size);
    final targetPath =
        '$projectRoot/android/app/src/main/res/$folder/ic_launcher.png';
    final file = File(targetPath);
    await file.parent.create(recursive: true);
    await file.writeAsBytes(pngBytes);
    print('  ✓ Android $folder ($size x $size) -> $targetPath');
  }

  // 2. Windows Multi-Resolution ICO
  final icoSizes = [16, 24, 32, 48, 64, 128, 256];
  final icoPngs = <int, Uint8List>{};
  for (final size in icoSizes) {
    icoPngs[size] = await renderLogoPng(size);
  }
  final icoBytes = buildIcoFile(icoPngs);
  final icoTarget = '$projectRoot/windows/runner/resources/app_icon.ico';
  final icoFile = File(icoTarget);
  await icoFile.parent.create(recursive: true);
  await icoFile.writeAsBytes(icoBytes);
  print('  ✓ Windows Multi-Res ICO (${icoSizes.join(", ")}px) -> $icoTarget');

  // 3. Master 512x512 High-Res PNG
  final master512 = await renderLogoPng(512);
  final masterTarget = '$projectRoot/assets/images/finance_logo.png';
  final masterFile = File(masterTarget);
  await masterFile.parent.create(recursive: true);
  await masterFile.writeAsBytes(master512);
  print('  ✓ Master 512x512 PNG -> $masterTarget');

  print('Icon generation complete!');
}
