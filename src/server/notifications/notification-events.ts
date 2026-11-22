import "server-only";

type Listener = () => void;

// Route handlers can load separate bundles in the same Node.js process.
const notificationGlobal = globalThis as typeof globalThis & {
  cirkitNotificationListeners?: Map<string, Set<Listener>>;
};
const listeners = (notificationGlobal.cirkitNotificationListeners ??= new Map());

// Subscribe to notification changes for a specific recipient.
export function subscribeToNotificationChanges(recipientId: string, listener: Listener) {
  const subscribers = listeners.get(recipientId) ?? new Set<Listener>();
  subscribers.add(listener);
  listeners.set(recipientId, subscribers);

  return () => {
    if (subscribers.delete(listener) && subscribers.size === 0) {
      listeners.delete(recipientId);
    }
  };
}

// Publish notification changes for a specific recipient.
export function publishNotificationChanged(recipientId: string) {
  for (const listener of listeners.get(recipientId) ?? []) {
    try {
      listener();
    } catch (error) {
      console.error("Could not deliver a notification update.", error);
    }
  }
}
