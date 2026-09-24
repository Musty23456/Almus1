import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'config/theme.dart';
import 'navigation.dart';
import 'screens/splash_screen.dart';
import 'services/auth_service.dart';
import 'services/push_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Push notifications are optional: this does nothing if Firebase isn't configured.
  await PushService.instance.initFirebase();
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
        navigatorKey: appNavigatorKey,
        debugShowCheckedModeBanner: false,
        theme: almusTheme(),
        home: const SplashScreen(),
      ),
    );
  }
}
