/** Keep API and public images inside the app's deployment path. */
export function appPath(path: string) {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
