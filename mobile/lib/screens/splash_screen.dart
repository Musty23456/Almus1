import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../services/auth_service.dart';
import 'auth/login_screen.dart';
import 'chat_list_screen.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AlmusColors.primary,
      body: Consumer<AuthService>(
        builder: (context, auth, _) {
          if (!auth.isLoading) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              Navigator.of(context).pushReplacement(
                MaterialPageRoute(
                  builder: (_) => auth.currentUser != null ? const ChatListScreen() : const LoginScreen(),
                ),
              );
            });
          }
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.forum_rounded, color: Colors.white, size: 88),
                const SizedBox(height: 16),
                const Text(
                  'ALMUS CHAT',
                  style: TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.bold, letterSpacing: 1.2),
                ),
                const SizedBox(height: 8),
                Text(
                  'Connect. Chat. Share.',
                  style: TextStyle(color: Colors.white.withOpacity(0.85), fontSize: 15),
                ),
                const SizedBox(height: 40),
                const CircularProgressIndicator(color: Colors.white),
              ],
            ),
          );
        },
      ),
    );
  }
}
