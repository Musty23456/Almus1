import 'package:flutter/material.dart';
import '../../config/theme.dart';
import '../../services/api_client.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _identifier = TextEditingController();
  bool _loading = false;
  String? _message;
  String? _error;

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
      _message = null;
    });
    try {
      final data = await ApiClient.post(
        '/auth/forgot-password',
        auth: false,
        body: {'identifier': _identifier.text.trim()},
      );
      setState(() => _message = data['message'] ?? 'If an account exists, a reset link has been sent.');
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'No internet connection');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Forgot password')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Enter your username, email, or phone number. If an account exists, we\'ll send a reset link.',
              style: TextStyle(color: Colors.grey),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _identifier,
              decoration: const InputDecoration(hintText: 'Username, email, or phone'),
            ),
            const SizedBox(height: 16),
            if (_message != null) Text(_message!, style: const TextStyle(color: AlmusColors.primary)),
            if (_error != null) Text(_error!, style: const TextStyle(color: AlmusColors.danger)),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: _loading ? null : _submit,
              child: _loading
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Send reset link'),
            ),
          ],
        ),
      ),
    );
  }
}
