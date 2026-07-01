/** Get splash art URL — uses local bundled image if available, falls back to CDN */
export function getSplashUrl(championId: string): string {
  return `splash/${championId}.jpg`;
}
