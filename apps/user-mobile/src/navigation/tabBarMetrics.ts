/**
 * Bottom-tab bar size (Oct 2026). The content row (icons and 13px labels) keeps the 60px it had inside the old
 * fixed 70px bar; the bottom padding now follows the device's bottom safe area (home indicator, Android gesture
 * bar), using @react-navigation/bottom-tabs' own rule (BottomTabBar.tsx getPaddingBottom: inset − 4 on iOS), and
 * never drops below the old 10px. A device without a bottom inset therefore keeps exactly 70 / 10.
 */
export const TAB_BAR_CONTENT_HEIGHT = 60;
const MIN_BOTTOM_PADDING = 10;

export function tabBarBottomPadding(insetBottom: number, os: string): number {
  return Math.max(insetBottom - (os === "ios" ? 4 : 0), MIN_BOTTOM_PADDING);
}
