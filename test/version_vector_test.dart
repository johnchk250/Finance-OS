import 'package:finance_os_synced/src/model/version_vector.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('VersionVector', () {
    test('orders causal revisions', () {
      final first = VersionVector({'pc': 1});
      final second = VersionVector({'pc': 2});

      expect(first.compare(second), VectorOrder.before);
      expect(second.compare(first), VectorOrder.after);
      expect(first.compare(VersionVector({'pc': 1})), VectorOrder.equal);
    });

    test('detects concurrent edits and merges them', () {
      final pc = VersionVector({'pc': 2});
      final phone = VersionVector({'phone': 3});

      expect(pc.compare(phone), VectorOrder.concurrent);
      expect(pc.merge(phone).values, {'pc': 2, 'phone': 3});
    });
  });
}
