import 'package:flutter/material.dart';
import 'group_screen.dart';
import 'qr_scanner_screen.dart';

class ScanScreen extends StatelessWidget {
  const ScanScreen({super.key});

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
                  buttonLabel: 'Lancer le scan',
                  onPressed: () async {
                    final code = await Navigator.of(context).push<String>(
                      MaterialPageRoute(
                        builder: (_) => const QrScannerScreen(),
                      ),
                    );
                    if (!context.mounted || code == null) return;
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => GroupScreen(
                          groupName: 'TSR - Valenciennes',
                          creatorName: 'Admin TSR',
                          fallbackCode: code,
                          members: [
                            MemberItem(name: 'Alice Martin', checkedIn: false),
                            MemberItem(name: 'Benoit Lemoine', checkedIn: true),
                            MemberItem(name: 'Carla Dupont', checkedIn: false),
                          ],
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 16),
                _ScanCard(
                  title: 'Recherche manuelle',
                  description: 'Entrer un code de secours du groupe.',
                  child: TextField(
                    decoration: const InputDecoration(
                      labelText: 'Code numérique',
                      border: OutlineInputBorder(),
                    ),
                    keyboardType: TextInputType.number,
                  ),
                  buttonLabel: 'Ouvrir le groupe',
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => GroupScreen(
                          groupName: 'CMV - Delegation',
                          creatorName: 'Admin CMV',
                          fallbackCode: '983114',
                          members: [
                            MemberItem(name: 'Dora Kesler', checkedIn: true),
                            MemberItem(name: 'Eliot Vasseur', checkedIn: true),
                            MemberItem(name: 'Fanny Blois', checkedIn: false),
                          ],
                        ),
                      ),
                    );
                  },
                ),
                const Spacer(),
                Text(
                  'Mode hors ligne : actif (simulation)',
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
  final VoidCallback onPressed;
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
