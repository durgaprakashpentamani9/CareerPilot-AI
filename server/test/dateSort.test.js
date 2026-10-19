import test from 'node:test';
import assert from 'node:assert/strict';
import { newestFirst } from '../src/utils/dateSort.js';

test('newestFirst sorts Date, ISO, and serialized dates newest-first and puts invalid dates last', () => {
  const records = [
    { id: 'iso', createdAt: '2025-01-02T00:00:00.000Z' },
    { id: 'mongo-date', createdAt: new Date('2025-01-04T00:00:00.000Z') },
    { id: 'extended-json', createdAt: { $date: '2025-01-03T00:00:00.000Z' } },
    { id: 'epoch-json', createdAt: { $date: { $numberLong: '1735862400000' } } },
    { id: 'invalid', createdAt: 'not-a-date' },
    { id: 'missing' },
    { id: 'invalid-date-object', createdAt: new Date('invalid') },
  ];

  assert.deepEqual(records.sort(newestFirst).map(record => record.id), [
    'mongo-date', 'extended-json', 'epoch-json', 'iso',
    'invalid', 'missing', 'invalid-date-object',
  ]);
});
