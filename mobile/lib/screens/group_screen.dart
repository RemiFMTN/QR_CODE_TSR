import 'package:flutter/material.dart';

class GroupScreen extends StatefulWidget {
  const GroupScreen({super.key});

  @override
  State<GroupScreen> createState() => _GroupScreenState();
}

class _GroupScreenState extends State<GroupScreen> {
  final _members = [
    {'name': 'Alice Martin', 'checkedIn': false},
    {'name': 'Benoit Lemoine', 'checkedIn': true},
    {'name': 'Carla Dupont', 'checkedIn': false}
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Group')),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _members.length,
        separatorBuilder: (_, __) => const Divider(),
        itemBuilder: (context, index) {
          final member = _members[index];
          return CheckboxListTile(
            value: member['checkedIn'] as bool,
            title: Text(member['name'] as String),
            onChanged: (value) {
              setState(() {
                member['checkedIn'] = value ?? false;
              });
            },
          );
        },
      ),
    );
  }
}
