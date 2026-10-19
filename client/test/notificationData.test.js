import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNotificationsResponse, notificationErrorMessage } from '../src/notificationData.js';

test('validates notification response records before the bell renders them', () => {
  const response = { notifications: [{ _id: 'n1', title: 'Application submitted', message: 'Role was applied to.', read: false }] };
  assert.deepEqual(assertNotificationsResponse(response), response);
  assert.throws(() => assertNotificationsResponse(undefined), /expected a notifications array/);
  assert.throws(() => assertNotificationsResponse({ notifications: [null] }), /invalid notification at position 1/);
});

test('notification load errors preserve a useful message for the UI', () => {
  assert.equal(notificationErrorMessage({ response: { data: { message: 'Sign in again' } } }), 'Sign in again');
  assert.equal(notificationErrorMessage({ message: 'Network offline' }), 'Network offline');
  assert.equal(notificationErrorMessage({}), 'Could not load notifications.');
});
