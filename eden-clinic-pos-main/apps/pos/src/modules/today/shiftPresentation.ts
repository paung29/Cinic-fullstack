export type DrawerDifferenceTone = 'negative' | 'ink';

export function drawerDifferenceTone(difference: number): DrawerDifferenceTone {
  return difference < 0 ? 'negative' : 'ink';
}
