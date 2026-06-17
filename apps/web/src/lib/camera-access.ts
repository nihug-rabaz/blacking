export function canUseCamera(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.isSecureContext;
}

export function getCameraBlockedReason(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (window.isSecureContext) {
    return null;
  }
  return "המצלמה זמינה רק ב-HTTPS. בטלפון פתח https://כתובת-המחשב:3000/receiver ולא http";
}

export function getLocalNetworkHint(port = 3000): string {
  if (typeof window === "undefined") {
    return "";
  }
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return `בטלפון: npm run dev:mobile → https://<IP-המחשב>:${port}/receiver`;
  }
  return `https://${host}:${port}/receiver`;
}
