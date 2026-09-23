import 'package:flutter/material.dart';

/// Original ALMUS CHAT visual identity - deep teal + amber accent,
/// deliberately distinct from WhatsApp's green/white branding.
class AlmusColors {
  static const Color primary = Color(0xFF0E7C7B); // deep teal
  static const Color primaryDark = Color(0xFF0A5F5E);
  static const Color accent = Color(0xFFF2A93B); // warm amber
  static const Color background = Color(0xFFF4F7F6);
  static const Color bubbleMine = Color(0xFFDCF3F1);
  static const Color bubbleTheirs = Color(0xFFFFFFFF);
  static const Color danger = Color(0xFFDC2626);
}

ThemeData almusTheme() {
  return ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AlmusColors.primary,
      primary: AlmusColors.primary,
      secondary: AlmusColors.accent,
    ),
    scaffoldBackgroundColor: AlmusColors.background,
    appBarTheme: const AppBarTheme(
      backgroundColor: AlmusColors.primary,
      foregroundColor: Colors.white,
      elevation: 0,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AlmusColors.primary,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
  );
}
