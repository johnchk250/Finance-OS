enum VectorOrder { before, equal, after, concurrent }

class VersionVector {
  VersionVector([Map<String, int>? values])
    : values = Map.unmodifiable(values ?? const <String, int>{});

  final Map<String, int> values;

  VersionVector increment(String deviceId, int sequence) {
    final next = Map<String, int>.from(values);
    final current = next[deviceId] ?? 0;
    next[deviceId] = sequence > current ? sequence : current + 1;
    return VersionVector(next);
  }

  VersionVector merge(VersionVector other) {
    final merged = Map<String, int>.from(values);
    for (final entry in other.values.entries) {
      final current = merged[entry.key] ?? 0;
      if (entry.value > current) merged[entry.key] = entry.value;
    }
    return VersionVector(merged);
  }

  VectorOrder compare(VersionVector other) {
    var lower = false;
    var higher = false;
    final keys = <String>{...values.keys, ...other.values.keys};
    for (final key in keys) {
      final left = values[key] ?? 0;
      final right = other.values[key] ?? 0;
      if (left < right) lower = true;
      if (left > right) higher = true;
    }
    if (lower && higher) return VectorOrder.concurrent;
    if (lower) return VectorOrder.before;
    if (higher) return VectorOrder.after;
    return VectorOrder.equal;
  }

  Map<String, dynamic> toJson() => values;

  factory VersionVector.fromJson(Object? json) {
    if (json is! Map) {
      throw const FormatException('Version vector is missing.');
    }
    final values = <String, int>{};
    for (final entry in json.entries) {
      final key = entry.key.toString();
      final value = entry.value;
      if (key.isEmpty || value is! num || value.toInt() <= 0) {
        throw const FormatException('Version vector is invalid.');
      }
      values[key] = value.toInt();
    }
    return VersionVector(values);
  }
}
