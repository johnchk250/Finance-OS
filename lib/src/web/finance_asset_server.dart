import 'dart:io';

import 'package:flutter/services.dart';

class FinanceAssetServer {
  HttpServer? _server;
  String? _html;

  int get port => _server?.port ?? 0;
  Uri get uri => Uri.parse('http://127.0.0.1:$port/');

  Future<void> start() async {
    if (_server != null) return;
    _html = await rootBundle.loadString('assets/finance/index.html');
    HttpServer? server;
    for (var candidate = 43821; candidate <= 43831; candidate++) {
      try {
        server = await HttpServer.bind(InternetAddress.loopbackIPv4, candidate);
        break;
      } on SocketException {
        // Try the next private loopback port.
      }
    }
    server ??= await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server = server;
    server.listen(_handleRequest);
  }

  Future<void> _handleRequest(HttpRequest request) async {
    request.response.headers
      ..set(HttpHeaders.cacheControlHeader, 'no-store')
      ..set('X-Content-Type-Options', 'nosniff')
      ..set('Referrer-Policy', 'no-referrer')
      ..set(
        'Content-Security-Policy',
        "default-src 'self' 'unsafe-inline' data: blob:; "
            "connect-src 'self'; img-src 'self' data: blob:; "
            "object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      );
    if (request.uri.path == '/' || request.uri.path == '/index.html') {
      request.response.headers.contentType = ContentType.html;
      request.response.write(_html);
      await request.response.close();
      return;
    }
    if (request.uri.path == '/health') {
      request.response.headers.contentType = ContentType.json;
      request.response.write('{"ok":true}');
      await request.response.close();
      return;
    }
    request.response.statusCode = HttpStatus.notFound;
    await request.response.close();
  }

  Future<void> stop() async {
    final server = _server;
    _server = null;
    await server?.close(force: true);
  }
}
