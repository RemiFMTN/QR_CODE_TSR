import 'package:flutter/material.dart';
import 'screens/login_screen.dart';
import 'screens/scan_screen.dart';

void main() {
  runApp(const EventAccessApp());
}

class EventAccessApp extends StatelessWidget {
  const EventAccessApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Event Access',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
        useMaterial3: true,
      ),
      initialRoute: '/login',
      routes: {
        '/login': (context) => const LoginScreen(),
        '/scan': (context) => const ScanScreen(),
      },
    );
  }
}
