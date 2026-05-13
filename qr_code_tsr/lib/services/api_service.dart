import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiGroup {
  ApiGroup({
    required this.id,
    required this.name,
    required this.creatorName,
    required this.fallbackCode,
  });

  final String id;
  final String name;
  final String creatorName;
  final String fallbackCode;

  factory ApiGroup.fromJson(Map<String, dynamic> json) {
    return ApiGroup(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      creatorName: json['creator_name']?.toString() ?? '',
      fallbackCode: json['fallback_code']?.toString() ?? '',
    );
  }
}

class ApiMember {
  ApiMember({
    required this.id,
    required this.fullName,
    required this.checkedIn,
  });

  final String id;
  final String fullName;
  bool checkedIn;

  factory ApiMember.fromJson(Map<String, dynamic> json) {
    return ApiMember(
      id: json['id']?.toString() ?? '',
      fullName: json['full_name']?.toString() ?? '',
      checkedIn: json['checked_in'] == true,
    );
  }
}

class ApiGroupResponse {
  ApiGroupResponse({required this.group, required this.members});

  final ApiGroup group;
  final List<ApiMember> members;
}

class ApiSearchResult {
  ApiSearchResult({
    required this.groupId,
    required this.groupName,
    required this.creatorName,
    required this.qrToken,
    required this.fallbackCode,
    required this.memberId,
    required this.fullName,
    required this.email,
    required this.checkedIn,
  });

  final String groupId;
  final String groupName;
  final String creatorName;
  final String qrToken;
  final String fallbackCode;
  final String memberId;
  final String fullName;
  final String email;
  final bool checkedIn;

  factory ApiSearchResult.fromJson(Map<String, dynamic> json) {
    return ApiSearchResult(
      groupId: json['group_id']?.toString() ?? '',
      groupName: json['group_name']?.toString() ?? '',
      creatorName: json['creator_name']?.toString() ?? '',
      qrToken: json['qr_token']?.toString() ?? '',
      fallbackCode: json['fallback_code']?.toString() ?? '',
      memberId: json['member_id']?.toString() ?? '',
      fullName: json['full_name']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      checkedIn: json['checked_in'] == true,
    );
  }
}

class ApiService {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://qr-code-tsr.onrender.com',
  );

  static const String _tokenKey = 'auth_token';
  static String? _token;

  static Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_tokenKey);
  }

  static bool get hasToken => _token != null && _token!.isNotEmpty;

  static Future<void> saveToken(String token) async {
    _token = token;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, token);
  }

  static Future<void> clearToken() async {
    _token = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
  }

  static Map<String, String> _authHeaders() {
    if (!hasToken) return {};
    return {'Authorization': 'Bearer $_token'};
  }

  static Future<void> login({
    required String username,
    required String password,
  }) async {
    final uri = Uri.parse('$baseUrl/auth/login');
    final response = await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'username': username, 'password': password}),
    );

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode != 200) {
      throw Exception(data['error']?.toString() ?? 'Login failed');
    }

    final token = data['token']?.toString() ?? '';
    if (token.isEmpty) throw Exception('Missing token');
    await saveToken(token);
  }

  static Future<ApiGroupResponse> fetchGroup({
    String? qrToken,
    String? fallbackCode,
  }) async {
    final uri = Uri.parse('$baseUrl/scan/qr');
    final response = await http.post(
      uri,
      headers: {'Content-Type': 'application/json', ..._authHeaders()},
      body: jsonEncode({'qrToken': qrToken, 'fallbackCode': fallbackCode}),
    );

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode != 200) {
      throw Exception(data['error']?.toString() ?? 'Scan failed');
    }

    final group = ApiGroup.fromJson(data['group'] as Map<String, dynamic>);
    final membersJson = (data['members'] as List<dynamic>?) ?? [];
    final members = membersJson
        .map((m) => ApiMember.fromJson(m as Map<String, dynamic>))
        .toList();

    return ApiGroupResponse(group: group, members: members);
  }

  static Future<List<ApiSearchResult>> searchMembers(String query) async {
    final normalized = query.trim();
    if (normalized.isEmpty) return [];

    final uri = Uri.parse(
      '$baseUrl/groups/search?q=${Uri.encodeQueryComponent(normalized)}',
    );
    final response = await http.get(uri, headers: _authHeaders());

    final data = jsonDecode(response.body);
    if (response.statusCode != 200) {
      throw Exception(
        (data is Map<String, dynamic> ? data['error']?.toString() : null) ??
            'Search failed',
      );
    }

    final list = (data as List<dynamic>? ?? [])
        .map((item) => ApiSearchResult.fromJson(item as Map<String, dynamic>))
        .toList();
    return list;
  }

  static Future<void> updateCheckin({
    required String memberId,
    required bool checkedIn,
  }) async {
    final uri = Uri.parse('$baseUrl/members/$memberId');
    final response = await http.patch(
      uri,
      headers: {'Content-Type': 'application/json', ..._authHeaders()},
      body: jsonEncode({'checkedIn': checkedIn}),
    );

    if (response.statusCode != 200) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      throw Exception(data['error']?.toString() ?? 'Update failed');
    }
  }
}
