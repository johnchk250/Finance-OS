import 'dart:math' as math;
import 'package:flutter/material.dart';

/// A source-based, vector-rendered logo for Finance OS.
///
/// Renders an anti-aliased squircle emblem containing the Finance OS "F"
/// monogram fused with upward financial growth ledger bars and security vault nodes.
class FinanceLogo extends StatelessWidget {
  const FinanceLogo({
    super.key,
    this.size = 32.0,
    this.showBackground = true,
    this.elevation = 0.0,
    this.borderRadius,
  });

  /// The width and height of the logo widget.
  final double size;

  /// Whether to render the rounded squircle background with dark slate gradient.
  final bool showBackground;

  /// Elevation / drop shadow beneath the logo.
  final double elevation;

  /// Custom corner radius for the background squircle. Defaults to 22% of size.
  final double? borderRadius;

  @override
  Widget build(BuildContext context) {
    Widget child = CustomPaint(
      size: Size(size, size),
      painter: FinanceLogoPainter(
        showBackground: showBackground,
        borderRadiusRatio: borderRadius != null ? (borderRadius! / size) : 0.22,
      ),
    );

    if (elevation > 0) {
      final radius = borderRadius ?? (size * 0.22);
      child = Material(
        color: Colors.transparent,
        elevation: elevation,
        shadowColor: const Color(0x664F46E5),
        borderRadius: BorderRadius.circular(radius),
        child: child,
      );
    }

    return SizedBox(
      width: size,
      height: size,
      child: child,
    );
  }
}

/// CustomPainter that renders the Finance OS vector logo on any Canvas.
class FinanceLogoPainter extends CustomPainter {
  const FinanceLogoPainter({
    this.showBackground = true,
    this.borderRadiusRatio = 0.22,
  });

  final bool showBackground;
  final double borderRadiusRatio;

  @override
  void paint(Canvas canvas, Size size) {
    final s = math.min(size.width, size.height);
    final dx = (size.width - s) / 2;
    final dy = (size.height - s) / 2;

    canvas.save();
    canvas.translate(dx, dy);

    // Scale canvas from normalized 100x100 space to target size s
    final scale = s / 100.0;
    canvas.scale(scale, scale);

    if (showBackground) {
      _drawBackground(canvas, 100.0, borderRadiusRatio * 100.0);
    }

    _drawEmblem(canvas);

    canvas.restore();
  }

  void _drawBackground(Canvas canvas, double size, double radius) {
    final rect = Rect.fromLTWH(0, 0, size, size);
    final rrect = RRect.fromRectAndRadius(rect, Radius.circular(radius));

    // Deep slate/midnight gradient background
    final bgPaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          Color(0xFF0F172A), // Slate 900
          Color(0xFF1E1B4B), // Indigo 950
          Color(0xFF090D16), // Deep midnight
        ],
        stops: [0.0, 0.55, 1.0],
      ).createShader(rect);

    canvas.drawRRect(rrect, bgPaint);

    // Inner glowing rim / border
    final rimPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          Color(0x80818CF8), // Indigo 400 (50%)
          Color(0x3338BDF8), // Cyan 400 (20%)
          Color(0x1A10B981), // Emerald 500 (10%)
        ],
      ).createShader(rect);

    final innerRRect = RRect.fromRectAndRadius(
      rect.deflate(1.0),
      Radius.circular(math.max(0, radius - 1.0)),
    );
    canvas.drawRRect(innerRRect, rimPaint);

    // Top-left subtle ambient glow spot
    final glowPaint = Paint()
      ..shader = RadialGradient(
        center: const Alignment(-0.6, -0.6),
        radius: 0.8,
        colors: [
          const Color(0x336366F1), // Indigo glow
          const Color(0x006366F1),
        ],
      ).createShader(rect);
    canvas.drawRRect(rrect, glowPaint);
  }

  void _drawEmblem(Canvas canvas) {
    // 1. Ascending Financial Ledger Bars (Growth Chart)
    // Bar 1 (Left-lower)
    _drawRoundedBar(
      canvas,
      rect: const Rect.fromLTWH(42, 60, 9, 18),
      radius: 3.5,
      colors: const [Color(0xFF0D9488), Color(0xFF14B8A6)], // Teal
    );

    // Bar 2 (Middle)
    _drawRoundedBar(
      canvas,
      rect: const Rect.fromLTWH(54, 48, 9, 30),
      radius: 3.5,
      colors: const [Color(0xFF0284C7), Color(0xFF38BDF8)], // Cyan
    );

    // Bar 3 (Right-tallest)
    _drawRoundedBar(
      canvas,
      rect: const Rect.fromLTWH(66, 36, 9, 42),
      radius: 3.5,
      colors: const [Color(0xFF4F46E5), Color(0xFF818CF8)], // Indigo
    );

    // 2. Ascending Trend Chevron / Arrow line connecting tops
    final trendPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.8
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..shader = const LinearGradient(
        begin: Alignment.bottomLeft,
        end: Alignment.topRight,
        colors: [Color(0xFF10B981), Color(0xFF38BDF8), Color(0xFFFBBF24)],
      ).createShader(const Rect.fromLTWH(42, 30, 36, 35));

    final trendPath = Path()
      ..moveTo(46.5, 57)
      ..lineTo(58.5, 45)
      ..lineTo(70.5, 33);
    canvas.drawPath(trendPath, trendPaint);

    // 3. Main 'F' Monogram Stem (Left vertical pillar)
    final stemRect = const Rect.fromLTWH(22, 22, 11, 56);
    final stemRRect = RRect.fromRectAndRadius(stemRect, const Radius.circular(4.5));
    final stemPaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          Color(0xFF818CF8), // Indigo 400
          Color(0xFF4F46E5), // Indigo 600
          Color(0xFF3730A3), // Indigo 800
        ],
      ).createShader(stemRect);

    canvas.drawRRect(stemRRect, stemPaint);

    // 4. 'F' Top Horizontal Wing
    final topBarRect = const Rect.fromLTWH(22, 22, 54, 11);
    final topBarRRect = RRect.fromRectAndRadius(topBarRect, const Radius.circular(4.5));
    final topBarPaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
        colors: [
          Color(0xFF818CF8), // Indigo 400
          Color(0xFF38BDF8), // Cyan 400
          Color(0xFF34D399), // Emerald 400
        ],
      ).createShader(topBarRect);

    canvas.drawRRect(topBarRRect, topBarPaint);

    // 5. 'F' Middle Growth Crossbar (Connecting stem into the financial flow)
    final midBarRect = const Rect.fromLTWH(22, 42, 28, 10);
    final midBarRRect = RRect.fromRectAndRadius(midBarRect, const Radius.circular(4.0));
    final midBarPaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
        colors: [
          Color(0xFF4F46E5), // Indigo 600
          Color(0xFF10B981), // Emerald 500
          Color(0xFF34D399), // Mint 400
        ],
      ).createShader(midBarRect);

    canvas.drawRRect(midBarRRect, midBarPaint);

    // 6. Glowing Peak Node (Security Vault / Sync Apex Node)
    final peakCenter = const Offset(70.5, 33);
    
    // Golden amber outer ring
    final nodeOuterPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..color = const Color(0xFFF59E0B); // Amber 500
    canvas.drawCircle(peakCenter, 5.0, nodeOuterPaint);

    // Bright golden core
    final nodeCorePaint = Paint()
      ..style = PaintingStyle.fill
      ..color = const Color(0xFFFDE68A); // Amber 200 / Bright gold
    canvas.drawCircle(peakCenter, 3.0, nodeCorePaint);
  }

  void _drawRoundedBar(
    Canvas canvas, {
    required Rect rect,
    required double radius,
    required List<Color> colors,
  }) {
    final rrect = RRect.fromRectAndRadius(rect, Radius.circular(radius));
    final paint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.bottomCenter,
        end: Alignment.topCenter,
        colors: colors,
      ).createShader(rect);

    canvas.drawRRect(rrect, paint);
  }

  @override
  bool shouldRepaint(covariant FinanceLogoPainter oldDelegate) =>
      oldDelegate.showBackground != showBackground ||
      oldDelegate.borderRadiusRatio != borderRadiusRatio;
}
