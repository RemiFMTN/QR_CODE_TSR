import 'dart:async';

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
  final TextEditingController _searchController = TextEditingController();
  Timer? _searchDebounce;
  List<ApiSearchResult> _searchResults = [];
  bool _searchLoading = false;
  String? _searchError;
  String _searchQuery = '';
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
    _searchController.dispose();
    _searchDebounce?.cancel();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    final query = value.trim();
    setState(() {
      _searchQuery = query;
      _searchError = null;
    });

    if (query.isEmpty) {
      setState(() {
        _searchResults = [];
        _searchLoading = false;
      });
      return;
    }

    setState(() {
      _searchLoading = true;
    });
    _searchDebounce = Timer(const Duration(milliseconds: 250), () async {
      try {
        final results = await ApiService.searchMembers(query);
        if (!mounted) return;
        if (_searchController.text.trim() != query) return;
        setState(() {
          _searchResults = results;
          _searchLoading = false;
        });
      } catch (err) {
        if (!mounted) return;
        if (_searchController.text.trim() != query) return;
        setState(() {
          _searchResults = [];
          _searchLoading = false;
          _searchError = err.toString().replaceFirst('Exception: ', '');
        });
      }
    });
  }

  Future<void> _openGroup({
    String? qrToken,
    String? fallbackCode,
    String initialSearchQuery = '',
  }) async {
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
            initialSearchQuery: initialSearchQuery,
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
      appBar: AppBar(title: const Text('Recherche globale et scan')),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFFFBF7F0), Color(0xFFE8F3F5)],
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
          ),
        ),
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(20),
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
                title: 'Recherche globale',
                description:
                    'Recherche en temps réel sur les noms et les groupes.',
                child: TextField(
                  controller: _searchController,
                  onChanged: _onSearchChanged,
                  decoration: const InputDecoration(
                    labelText: 'Nom ou groupe',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.search),
                  ),
                ),
              ),
              if (_searchQuery.isNotEmpty) ...[
                const SizedBox(height: 16),
                _SearchResultsCard(
                  query: _searchQuery,
                  loading: _searchLoading,
                  errorText: _searchError,
                  results: _searchResults,
                  onTapResult: (result) async {
                    await _openGroup(
                      qrToken: result.qrToken,
                      initialSearchQuery: _searchController.text.trim(),
                    );
                  },
                ),
              ],
              const SizedBox(height: 16),
              _ScanCard(
                title: 'Recherche manuelle',
                description: 'Entrer un code de secours du groupe.',
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
                child: TextField(
                  controller: _manualController,
                  decoration: const InputDecoration(
                    labelText: 'Code numerique',
                    border: OutlineInputBorder(),
                  ),
                  keyboardType: TextInputType.number,
                ),
              ),
              const SizedBox(height: 20),
              Text(
                'Mode en ligne : actif',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey.shade700),
              ),
            ],
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
    this.buttonLabel,
    this.onPressed,
    this.child,
  });

  final String title;
  final String description;
  final String? buttonLabel;
  final VoidCallback? onPressed;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white.withValues(alpha: 0.9),
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
            if (buttonLabel != null && onPressed != null) ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: onPressed,
                  child: Text(buttonLabel!),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SearchResultsCard extends StatelessWidget {
  const _SearchResultsCard({
    required this.query,
    required this.loading,
    required this.errorText,
    required this.results,
    required this.onTapResult,
  });

  final String query;
  final bool loading;
  final String? errorText;
  final List<ApiSearchResult> results;
  final Future<void> Function(ApiSearchResult result) onTapResult;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white.withValues(alpha: 0.92),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Résultats pour "$query"',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            if (loading) const LinearProgressIndicator(),
            if (errorText != null) ...[
              const SizedBox(height: 8),
              Text(errorText!, style: const TextStyle(color: Colors.red)),
            ] else if (!loading && results.isEmpty) ...[
              const SizedBox(height: 8),
              Text(
                'Aucun résultat trouvé.',
                style: TextStyle(color: Colors.grey.shade700),
              ),
            ] else if (results.isNotEmpty) ...[
              const SizedBox(height: 8),
              ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: results.length,
                separatorBuilder: (context, index) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final result = results[index];
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: CircleAvatar(
                      backgroundColor: const Color(
                        0xFF0F766E,
                      ).withValues(alpha: 0.12),
                      child: const Icon(Icons.person, color: Color(0xFF0F766E)),
                    ),
                    title: Text(result.fullName),
                    subtitle: Text(
                      '${result.groupName} · ${result.email.isNotEmpty ? result.email : 'sans email'}',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => onTapResult(result),
                  );
                },
              ),
            ],
          ],
        ),
      ),
    );
  }
}
