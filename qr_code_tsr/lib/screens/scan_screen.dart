import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'group_screen.dart';
import 'qr_scanner_screen.dart';

class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  final TextEditingController _manualController = TextEditingController();
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    if (!ApiService.hasToken) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        Navigator.of(context).pushReplacementNamed('/login');
      });
    }
  }

  @override
  void dispose() {
    _manualController.dispose();
    super.dispose();
  }

  Future<void> _openGroup({String? qrToken, String? fallbackCode}) async {
    if (_loading) return;
    setState(() => _loading = true);
    try {
      final response = await ApiService.fetchGroup(
        qrToken: qrToken,
        fallbackCode: fallbackCode,
      );
      if (!mounted) return;
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => GroupScreen(
            groupId: response.group.id,
            groupName: response.group.name,
            creatorName: response.group.creatorName,
            fallbackCode: response.group.fallbackCode,
            members: response.members
                .map(
                  (m) => MemberItem(
                    id: m.id,
                    name: m.fullName,
                    checkedIn: m.checkedIn,
                  ),
                )
                .toList(),
          ),
        ),
      );
    } catch (err) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(err.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(title: const Text('Scan et recherche')),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFFFBF7F0), Color(0xFFE8F3F5)],
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _ScanCard(
                  title: 'Scanner un QR code',
                  description: 'Ouvre la camera et detecte un QR code.',
                  buttonLabel: _loading ? 'Chargement...' : 'Lancer le scan',
                  onPressed: _loading
                      ? null
                      : () async {
                          final code = await Navigator.of(context).push<String>(
                            MaterialPageRoute(
                              builder: (_) => const QrScannerScreen(),
                            ),
                          );
                          if (!context.mounted || code == null) return;
                          await _openGroup(qrToken: code);
                        },
                ),
                const SizedBox(height: 16),
                _ScanCard(
                  title: 'Recherche manuelle',
                  description: 'Entrer un code de secours du groupe.',
                  child: TextField(
                    controller: _manualController,
                    decoration: const InputDecoration(
                      labelText: 'Code numerique',
                      border: OutlineInputBorder(),
                    ),
                    keyboardType: TextInputType.number,
                  ),
                  buttonLabel: _loading ? 'Chargement...' : 'Ouvrir le groupe',
                  onPressed: _loading
                      ? null
                      : () async {
                          final fallback = _manualController.text.trim();
                          if (fallback.isEmpty) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Code requis')),
                            );
                            return;
                          }
                          await _openGroup(fallbackCode: fallback);
                        },
                ),
                const Spacer(),
                Text(
                  'Mode en ligne : actif',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey.shade700),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ScanCard extends StatelessWidget {
  const _ScanCard({
    required this.title,
    required this.description,
    required this.buttonLabel,
    required this.onPressed,
    this.child,
  });

  final String title;
  final String description;
  final String buttonLabel;
  final VoidCallback? onPressed;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white.withOpacity(0.9),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 6),
            Text(description, style: TextStyle(color: Colors.grey.shade700)),
            if (child != null) ...[const SizedBox(height: 12), child!],
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: onPressed,
                child: Text(buttonLabel),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
