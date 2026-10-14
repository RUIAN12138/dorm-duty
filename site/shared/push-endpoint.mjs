// Never allow a subscription to turn the sender into a general HTTP client.
export function validPushEndpoint(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (!url.port || url.port === "443") &&
      url.pathname.length > 1 &&
      (url.hostname === "push.apple.com" ||
        url.hostname.endsWith(".push.apple.com") ||
        [
          "fcm.googleapis.com",
          "updates.push.services.mozilla.com",
          "push.services.mozilla.com",
        ].includes(url.hostname))
    );
  } catch {
    return false;
  }
}
