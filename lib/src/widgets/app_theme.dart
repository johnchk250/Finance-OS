import 'package:flutter/material.dart';

/// Native sync/recovery chrome uses the portal's evergreen palette.
ThemeData financeHostTheme({Brightness brightness = Brightness.dark}) =>
    ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: brightness == Brightness.dark
            ? const Color(0xff61c69c)
            : const Color(0xff176b52),
        brightness: brightness,
        surface: brightness == Brightness.dark
            ? const Color(0xff17201d)
            : const Color(0xffffffff),
      ),
      appBarTheme: const AppBarThemeData(
        backgroundColor: Color(0xff153b30),
        foregroundColor: Color(0xffeef8f3),
        surfaceTintColor: Colors.transparent,
        elevation: 0,
      ),
      inputDecorationTheme: const InputDecorationThemeData(
        border: OutlineInputBorder(),
      ),
    );
