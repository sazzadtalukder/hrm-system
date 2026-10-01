let accessToken = null;
const listeners = new Set();
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('hrm-auth');

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token;
}

export function clearAccessToken() {
  accessToken = null;
}

export function publishAuthEvent(type) {
  channel?.postMessage({ type, occurredAt: Date.now() });
  for (const listener of listeners) listener({ type, local: true });
}

export function subscribeAuthEvents(listener) {
  listeners.add(listener);
  const receive = (event) => listener({ ...event.data, local: false });
  channel?.addEventListener('message', receive);
  return () => {
    listeners.delete(listener);
    channel?.removeEventListener('message', receive);
  };
}
