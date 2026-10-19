export function assertNotificationsResponse(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.notifications)) {
    throw new Error('Notification API returned an invalid response: expected a notifications array.');
  }
  payload.notifications.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
      typeof item._id !== 'string' || typeof item.title !== 'string' ||
      typeof item.message !== 'string' || typeof item.read !== 'boolean') {
      throw new Error(`Notification API returned an invalid notification at position ${index + 1}.`);
    }
  });
  return payload;
}

export function notificationErrorMessage(error) {
  return error?.response?.data?.message || error?.message || 'Could not load notifications.';
}
