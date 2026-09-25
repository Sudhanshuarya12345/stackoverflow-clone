// A random per-browser identifier used to recognise trusted devices. It is hashed server-side.
const KEY = "deviceId";

export const getDeviceId = (): string => {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "";
  }
};
