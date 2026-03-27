const DATA_UPDATED_EVENT = "georank:data-updated";

export function emitDataUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DATA_UPDATED_EVENT));
}

export function subscribeToDataUpdated(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => listener();
  window.addEventListener(DATA_UPDATED_EVENT, handler);
  return () => window.removeEventListener(DATA_UPDATED_EVENT, handler);
}
