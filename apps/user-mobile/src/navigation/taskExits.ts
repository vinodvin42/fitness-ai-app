import { CommonActions, StackActions } from "@react-navigation/native";
import type { NavigationProp, ParamListBase } from "@react-navigation/native";

/**
 * Exits for focused tasks (Oct 2026), so a task opened straight into its tab's stack (no home screen underneath:
 * a cross-tab link without `initial: false`, a deep link, a notification) can still be left.
 * `popToTop()` / `navigate(home)` alone fail there: POP_TO_TOP is unhandled on a one-screen stack (the user stays
 * put), and navigate() pushes the home screen above the finished task, so Back returns to it.
 * Dispatches the same actions as the stack's popToTop() / reset() helpers.
 */

/** Leaves the task for its tab's home screen: pops to it when it is underneath, otherwise makes it the only screen. */
export function exitTaskToHome(navigation: NavigationProp<ParamListBase>, home: string): void {
  const { routes } = navigation.getState();
  if (routes[0]?.name === home) navigation.dispatch(StackActions.popToTop());
  else navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: home }] }));
}
