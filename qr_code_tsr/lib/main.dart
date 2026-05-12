import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'screens/login_screen.dart';
import 'screens/scan_screen.dart';

void main() {
  runApp(const QrCodeTsrApp());
}

class QrCodeTsrApp extends StatelessWidget {
  const QrCodeTsrApp({super.key});

  @override
  Widget build(BuildContext context) {
    final baseTheme = ThemeData(
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF0F766E),
        brightness: Brightness.light,
      ),
      useMaterial3: true,
    );

    return MaterialApp(
      title: 'QR Code TSR',
      debugShowCheckedModeBanner: false,
      theme: baseTheme.copyWith(
        textTheme: GoogleFonts.spaceGroteskTextTheme(baseTheme.textTheme),
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.transparent,
          elevation: 0,
          centerTitle: false,
        ),
      ),
      initialRoute: '/login',
      routes: {
        '/login': (context) => const LoginScreen(),
        '/scan': (context) => const ScanScreen(),
      },
    );
  }
}
