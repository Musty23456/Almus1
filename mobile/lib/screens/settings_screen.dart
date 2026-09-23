import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import 'auth/login_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _lastSeenVisible = true;
  bool _profileVisible = true;
  bool _readReceiptsEnabled = true;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    try {
      final data = await ApiClient.get('/users/me');
      final user = data['user'];
      setState(() {
        _lastSeenVisible = user['lastSeenVisible'] ?? true;
        _profileVisible = user['profileVisible'] ?? true;
        _readReceiptsEnabled = user['readReceiptsEnabled'] ?? true;
        _loaded = true;
      });
    } catch (_) {
      setState(() => _loaded = true);
    }
  }

  Future<void> _updatePrivacy(String key, bool value) async {
    try {
      await ApiClient.patch('/users/me', body: {key: value});
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not update setting. Check your connection.')));
    }
  }

  Future<void> _confirmLogout({required bool allDevices}) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(allDevices ? 'Log out of all devices?' : 'Log out?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Log out')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final auth = context.read<AuthService>();
    if (allDevices) {
      await auth.logoutAllDevices();
    } else {
      await auth.logout();
    }
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthService>().currentUser;

    if (!_loaded) return const Center(child: CircularProgressIndicator());

    return ListView(
      children: [
        const SizedBox(height: 16),
        Center(
          child: CircleAvatar(
            radius: 40,
            backgroundColor: AlmusColors.primary.withOpacity(0.15),
            backgroundImage: user?.avatarUrl != null ? NetworkImage(user!.avatarUrl!) : null,
            child: user?.avatarUrl == null ? Text(user?.fullName.isNotEmpty == true ? user!.fullName[0].toUpperCase() : '?', style: const TextStyle(fontSize: 28)) : null,
          ),
        ),
        const SizedBox(height: 8),
        Center(child: Text(user?.fullName ?? '', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold))),
        Center(child: Text('@${user?.username ?? ''}', style: const TextStyle(color: Colors.grey))),
        const SizedBox(height: 24),

        const _SectionHeader('Privacy'),
        SwitchListTile(
          title: const Text('Show last seen'),
          value: _lastSeenVisible,
          onChanged: (v) {
            setState(() => _lastSeenVisible = v);
            _updatePrivacy('lastSeenVisible', v);
          },
        ),
        SwitchListTile(
          title: const Text('Public profile'),
          subtitle: const Text('Others can find and view your profile'),
          value: _profileVisible,
          onChanged: (v) {
            setState(() => _profileVisible = v);
            _updatePrivacy('profileVisible', v);
          },
        ),
        SwitchListTile(
          title: const Text('Read receipts'),
          value: _readReceiptsEnabled,
          onChanged: (v) {
            setState(() => _readReceiptsEnabled = v);
            _updatePrivacy('readReceiptsEnabled', v);
          },
        ),

        const _SectionHeader('Appearance'),
        const ListTile(
          title: Text('Theme'),
          subtitle: Text('System default (light/dark switching not yet wired to a persisted setting)'),
        ),

        const _SectionHeader('Security'),
        ListTile(
          leading: const Icon(Icons.logout),
          title: const Text('Log out'),
          onTap: () => _confirmLogout(allDevices: false),
        ),
        ListTile(
          leading: const Icon(Icons.logout, color: AlmusColors.danger),
          title: const Text('Log out of all devices', style: TextStyle(color: AlmusColors.danger)),
          onTap: () => _confirmLogout(allDevices: true),
        ),
        const SizedBox(height: 24),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader(this.title);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 4),
      child: Text(title, style: const TextStyle(fontWeight: FontWeight.bold, color: AlmusColors.primary)),
    );
  }
}
