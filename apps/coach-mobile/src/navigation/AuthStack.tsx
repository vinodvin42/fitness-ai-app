import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { SignupScreen } from "../screens/auth/SignupScreen";

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

/**
 * docs/coach/03-screen-inventory.md §A — Coach Signup / Coach Login. 24 Oct
 * 2026, owner: the login page is the first screen (the separate welcome
 * screen with two buttons is gone); sign-up is a link from it.
 */
export function AuthStack() {
  return (
    <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
    </Stack.Navigator>
  );
}
