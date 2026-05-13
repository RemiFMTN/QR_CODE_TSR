import 'package:flutter/material.dart';
import '../services/api_service.dart';

class GroupScreen extends StatefulWidget {
  const GroupScreen({
    super.key,
    required this.groupId,
    required this.groupName,
    required this.creatorName,
    required this.fallbackCode,
    required this.members,
  });

  final String groupId;
  final String groupName;
  final String creatorName;
  final String fallbackCode;
  final List<MemberItem> members;

  @override
  State<GroupScreen> createState() => _GroupScreenState();
}

class _GroupScreenState extends State<GroupScreen> {
  late final List<MemberItem> _members;

  @override
  void initState() {
    super.initState();
    _members = widget.members.map((m) => m.copy()).toList();
  }

  @override
  Widget build(BuildContext context) {
    final checkedCount = _members.where((m) => m.checkedIn).length;

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(title: const Text('Groupe')),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFFF4F2EC), Color(0xFFEAF1F7)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.groupName,
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Créateur : ${widget.creatorName} · Code secours : ${widget.fallbackCode}',
                      style: TextStyle(color: Colors.grey.shade700),
                    ),
                    const SizedBox(height: 10),
                    _StatusChip(
                      checkedCount: checkedCount,
                      total: _members.length,
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                  itemCount: _members.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final member = _members[index];
                    return Card(
                      elevation: 0,
                      color: Colors.white.withOpacity(0.92),
                      child: CheckboxListTile(
                        value: member.checkedIn,
                        title: Text(member.name),
                        subtitle: Text(member.checkedIn ? 'Présent' : 'Absent'),
                        onChanged: (value) async {
                          final nextValue = value ?? false;
                          final previous = member.checkedIn;
                          setState(() {
                            member.checkedIn = nextValue;
                          });
                          try {
                            await ApiService.updateCheckin(
                              memberId: member.id,
                              checkedIn: nextValue,
                            );
                          } catch (err) {
                            if (!context.mounted) return;
                            setState(() {
                              member.checkedIn = previous;
                            });
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  err.toString().replaceFirst(
                                    'Exception: ',
                                    '',
                                  ),
                                ),
                              ),
                            );
                          }
                        },
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.checkedCount, required this.total});

  final int checkedCount;
  final int total;

  @override
  Widget build(BuildContext context) {
    final color = checkedCount == total
        ? Colors.green
        : const Color(0xFF0F766E);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Text(
        '$checkedCount / $total présents',
        style: TextStyle(color: color),
      ),
    );
  }
}

class MemberItem {
  MemberItem({required this.id, required this.name, required this.checkedIn});

  final String id;
  final String name;
  bool checkedIn;

  MemberItem copy() => MemberItem(id: id, name: name, checkedIn: checkedIn);
}
