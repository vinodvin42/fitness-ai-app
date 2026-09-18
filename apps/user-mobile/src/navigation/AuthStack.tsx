import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SplashScreen } from "../screens/auth/SplashScreen";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { SignupScreen } from "../screens/auth/SignupScreen";
import { TwoFactorChallengeScreen } from "../screens/auth/TwoFactorChallengeScreen";
import { ForgotPasswordScreen } from "../screens/auth/ForgotPasswordScreen";
import { ResetPasswordScreen } from "../screens/auth/ResetPasswordScreen";

export type AuthStackParamList = {
  Splash: undefined;
  Login: undefined;
  Signup: undefined;
  // §L "Security" — Two-Factor Authentication (25 Aug 2026, gap §17).
  // Reached from LoginScreen when a correct password still needs a
  // second factor — see AuthContext.tsx's login()/completeTwoFactorLogin().
  TwoFactorChallenge: { twoFactorToken: string };
  // Forgot/Reset Password (18 Sep 2026, gap §53). ForgotPassword is
  // reached from LoginScreen and only ever submits an email.
  // ResetPassword is reached from SplashScreen when a
  // `primefit://reset-password?token=` link was captured — see
  // src/lib/resetPasswordLink.ts — the real path a user actually takes
  // (tapping the link in the email ForgotPassword triggered).
  ForgotPassword: undefined;
  ResetPassword: { token: string };
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator initialRouteName="Splash" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="TwoFactorChallenge" component={TwoFactorChallengeScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </Stack.Navigator>
  );
}
