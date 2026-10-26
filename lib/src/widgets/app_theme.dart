import 'package:flutter/material.dart';

/// Native sync/recovery chrome uses the portal's evergreen palette.
/// The portal keeps its own device-local light/dark preference.
ThemeData financeHostTheme() => ThemeData(
  useMaterial3: true,
  colorScheme: ColorScheme.fromSeed(
    seedColor: const Color(0xff61c69c),
    brightness: Brightness.dark,
    surface: const Color(0xff17201d),
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
