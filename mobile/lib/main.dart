import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'config/theme.dart';
import 'screens/splash_screen.dart';
import 'services/auth_service.dart';

void main() {
  runApp(const AlmusChatApp());
}

class AlmusChatApp extends StatelessWidget {
  const AlmusChatApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AuthService(),
      child: MaterialApp(
        title: 'ALMUS CHAT',
        debugShowCheckedModeBanner: false,
        theme: almusTheme(),
        home: const SplashScreen(),
      ),
    );
  }
}
