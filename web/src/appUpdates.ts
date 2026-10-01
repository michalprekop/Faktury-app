/** Both JS and CSS matter: a style-only release can retain the same JS filename. */
export function assetVersion(urls: string[], origin: string): string {
  return [
    ...new Set(
      urls
        .map((value) => new URL(value, origin))
        .filter((url) => url.origin === origin && url.pathname.startsWith('/assets/'))
        .map((url) => url.pathname + url.search),
    ),
  ]
    .sort()
    .join('\n');
}

export function hasNewAssets(current: string, latest: string): boolean {
  // An offline/error/login response must never be mistaken for a new release.
  return Boolean(current && latest && current !== latest);
}

export async function reloadAfterSaving(
  save: () => Promise<boolean>,
  reload: () => void,
  canReload: () => boolean = () => true,
): Promise<boolean> {
  if (!canReload() || !(await save()) || !canReload()) return false;
  reload();
  return true;
}
