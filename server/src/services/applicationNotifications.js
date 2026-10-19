const milestoneCopy = {
  APPLIED: (label) => ['Application submitted', `${label} was marked as applied.`],
  INTERVIEW: (label) => ['Interview stage', `${label} moved to Interview. Prepare talking points.`],
  OFFER: (label) => ['Offer received', `Congratulations! ${label} resulted in an offer.`],
  REJECTED: (label) => ['Application closed', `${label} was marked rejected. Capture the learnings and keep going.`],
};

function addOnce(notifications, eventKey, createRecord) {
  if (!Array.isArray(notifications)) throw new TypeError('Notification storage must be an array.');
  if (notifications.some(item => item.eventKey === eventKey)) return null;
  const record = createRecord({ eventKey });
  notifications.unshift(record);
  return record;
}

export function recordApplicationSavedNotification({ notifications, userId, application, internship, createRecord }) {
  if (!application?._id || application.userId !== userId || !internship || typeof createRecord !== 'function') return null;
  const label = `${internship.title} at ${internship.company}`;
  return addOnce(notifications, `application:${application._id}:saved`, ({ eventKey }) => createRecord({
    userId,
    applicationId: application._id,
    eventKey,
    event: 'SAVED',
    title: 'Application saved',
    message: `${label} was saved to your tracker.`,
    read: false,
  }));
}

export function recordApplicationStatusNotification({ notifications, userId, application, internship, previousStatus, nextStatus, createRecord }) {
  if (!application?._id || application.userId !== userId || !internship || typeof createRecord !== 'function') return null;
  if (!nextStatus || previousStatus === nextStatus) return null;
  const buildCopy = milestoneCopy[nextStatus];
  if (!buildCopy) return null;
  const [title, message] = buildCopy(`${internship.title} at ${internship.company}`);
  return addOnce(notifications, `application:${application._id}:status:${nextStatus}`, ({ eventKey }) => createRecord({
    userId,
    applicationId: application._id,
    eventKey,
    event: nextStatus,
    title,
    message,
    read: false,
  }));
}

export function listNotificationsForUser(notifications, userId) {
  if (!Array.isArray(notifications)) throw new TypeError('Notification storage must be an array.');
  return notifications.filter(item => item.userId === userId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
