import 'version_vector.dart';
import 'state_projection.dart';

enum FinanceOperationKind { upsert, delete }

class FinanceOperation {
  const FinanceOperation({
    required this.opId,
    required this.deviceId,
    required this.deviceSequence,
    required this.collection,
    required this.recordId,
    required this.kind,
    required this.vector,
    required this.createdAt,
    this.payload,
    this.baseHash,
  });

  static const schemaVersion = 2;

  final String opId;
  final String deviceId;
  final int deviceSequence;
  final String collection;
  final String recordId;
  final FinanceOperationKind kind;
  final VersionVector vector;
  final DateTime createdAt;
  final Map<String, dynamic>? payload;
  final String? baseHash;

  String get entityKey => '$collection/$recordId';

  String get relativePath {
    final sequence = deviceSequence.toString().padLeft(12, '0');
    return 'finance-os/operations/$deviceId/$sequence-$opId.json';
  }

  Map<String, dynamic> get _content => {
    'opId': opId,
    'deviceId': deviceId,
    'deviceSequence': deviceSequence,
    'collection': collection,
    'recordId': recordId,
    'kind': kind.name,
    'vector': vector.toJson(),
    'createdAt': createdAt.toUtc().toIso8601String(),
    if (payload != null) 'payload': payload,
    if (baseHash != null) 'baseHash': baseHash,
  };

  String get operationHash => contentHash(_content);

  Map<String, dynamic> toJson() => {
    'schemaVersion': schemaVersion,
    ..._content,
    'operationHash': operationHash,
  };

  factory FinanceOperation.fromJson(Map<String, dynamic> json) {
    final version = (json['schemaVersion'] as num?)?.toInt();
    if (version != 1 && version != schemaVersion) {
      throw const FormatException('Unsupported finance operation version.');
    }
    final opId = json['opId'] as String? ?? '';
    final deviceId = json['deviceId'] as String? ?? '';
    final sequence = (json['deviceSequence'] as num?)?.toInt() ?? 0;
    final collection = json['collection'] as String? ?? '';
    final recordId = json['recordId'] as String? ?? '';
    if (opId.isEmpty ||
        deviceId.isEmpty ||
        sequence <= 0 ||
        collection.isEmpty ||
        recordId.isEmpty) {
      throw const FormatException('Finance operation identity is invalid.');
    }
    final allowedCollections = <String>{
      ...financeCollections,
      'settings',
      'forecastAssumptions',
    };
    if (!allowedCollections.contains(collection)) {
      throw const FormatException('Finance operation collection is invalid.');
    }
    final singleton =
        collection == 'settings' || collection == 'forecastAssumptions';
    if ((singleton && recordId != '@singleton') ||
        (!singleton && recordId == '@singleton')) {
      throw const FormatException('Finance operation record is invalid.');
    }
    final kindName = json['kind'] as String? ?? '';
    FinanceOperationKind kind;
    try {
      kind = FinanceOperationKind.values.byName(kindName);
    } catch (_) {
      throw const FormatException('Finance operation kind is invalid.');
    }
    final payload = json['payload'];
    if ((kind == FinanceOperationKind.upsert && payload is! Map) ||
        (kind == FinanceOperationKind.delete && payload != null)) {
      throw const FormatException('Finance operation payload is invalid.');
    }
    final vector = VersionVector.fromJson(json['vector']);
    if (vector.values[deviceId] != sequence) {
      throw const FormatException('Finance operation sequence is invalid.');
    }
    final operation = FinanceOperation(
      opId: opId,
      deviceId: deviceId,
      deviceSequence: sequence,
      collection: collection,
      recordId: recordId,
      kind: kind,
      vector: vector,
      createdAt: DateTime.parse(json['createdAt'] as String),
      payload: payload is Map
          ? payload.map((key, value) => MapEntry(key.toString(), value))
          : null,
      baseHash: json['baseHash'] as String?,
    );
    if (version == schemaVersion &&
        json['operationHash']?.toString() != operation.operationHash) {
      throw const FormatException('Finance operation integrity check failed.');
    }
    return operation;
  }
}
