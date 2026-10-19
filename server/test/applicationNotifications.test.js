import test from 'node:test';
import assert from 'node:assert/strict';
import { listNotificationsForUser, recordApplicationSavedNotification, recordApplicationStatusNotification } from '../src/services/applicationNotifications.js';

const application = { _id: 'app-1', userId: 'user-1' };
const internship = { title: 'Frontend Intern', company: 'Example' };
const setup = () => {
  const notifications = [];
  const createRecord = data => ({ _id: `notice-${notifications.length + 1}`, createdAt: new Date(Date.now() + notifications.length).toISOString(), ...data });
  return { notifications, createRecord };
};

test('status transition creates an owner and application scoped notification', () => {
  const state = setup();
  const record = recordApplicationStatusNotification({ ...state, userId: 'user-1', application, internship, previousStatus: 'SAVED', nextStatus: 'APPLIED' });
  assert.equal(record.event, 'APPLIED');
  assert.equal(record.userId, 'user-1');
  assert.equal(record.applicationId, 'app-1');
  assert.match(record.message, /Frontend Intern at Example/);
});

test('unchanged and non-milestone statuses do not create notifications', () => {
  const state = setup();
  assert.equal(recordApplicationStatusNotification({ ...state, userId: 'user-1', application, internship, previousStatus: 'APPLIED', nextStatus: 'APPLIED' }), null);
  assert.equal(recordApplicationStatusNotification({ ...state, userId: 'user-1', application, internship, previousStatus: 'SAVED', nextStatus: 'PREPARING' }), null);
  assert.equal(state.notifications.length, 0);
});

test('retry or returning to the same milestone does not duplicate its event', () => {
  const state = setup();
  const args = { ...state, userId: 'user-1', application, internship, previousStatus: 'SAVED', nextStatus: 'APPLIED' };
  recordApplicationStatusNotification(args);
  assert.equal(recordApplicationStatusNotification({ ...args, previousStatus: 'INTERVIEW' }), null);
  assert.equal(state.notifications.length, 1);
});

test('first save notification is deduplicated and refuses a mismatched owner', () => {
  const state = setup();
  const args = { ...state, userId: 'user-1', application, internship };
  recordApplicationSavedNotification(args);
  recordApplicationSavedNotification(args);
  assert.equal(recordApplicationSavedNotification({ ...args, userId: 'user-2' }), null);
  assert.equal(state.notifications.length, 1);
});

test('retrieval is user-scoped and newest-first', () => {
  const rows = [
    { _id: 'old', userId: 'u1', createdAt: '2026-01-01' },
    { _id: 'other', userId: 'u2', createdAt: '2026-03-01' },
    { _id: 'new', userId: 'u1', createdAt: '2026-02-01' },
  ];
  assert.deepEqual(listNotificationsForUser(rows, 'u1').map(n => n._id), ['new', 'old']);
});
