import React from "react";
import type { ActivityKind } from "@fitness-ai-app/types";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ProgramsMarketplaceScreen, TrainScreen } from "../screens/train/TrainScreen";
import { ProgramDetailScreen } from "../screens/train/ProgramDetailScreen";
import { WorkoutDetailScreen } from "../screens/train/WorkoutDetailScreen";
import { ActiveWorkoutScreen } from "../screens/train/ActiveWorkoutScreen";
import { SetRestTrackerScreen } from "../screens/train/SetRestTrackerScreen";
import { WorkoutCompleteScreen } from "../screens/train/WorkoutCompleteScreen";
import { MyProgramsScreen } from "../screens/train/MyProgramsScreen";
import { ProgramProgressScreen } from "../screens/train/ProgramProgressScreen";
import { ProgramCompletionScreen } from "../screens/train/ProgramCompletionScreen";
import { ExerciseLibraryScreen } from "../screens/train/ExerciseLibraryScreen";
import { ExerciseDetailScreen } from "../screens/train/ExerciseDetailScreen";
import { WorkoutHistoryScreen } from "../screens/train/WorkoutHistoryScreen";
import { ExerciseSwapScreen } from "../screens/train/ExerciseSwapScreen";
import { TrainingAnalyticsScreen } from "../screens/train/TrainingAnalyticsScreen";
import { RoutinesScreen } from "../screens/train/RoutinesScreen";
import { RoutineEditorScreen } from "../screens/train/RoutineEditorScreen";
import { RemindersRoutinesScreen } from "../screens/train/RemindersRoutinesScreen";
import { WorkoutSettingsScreen } from "../screens/train/WorkoutSettingsScreen";
import { ActivityTrackerScreen } from "../screens/train/ActivityTrackerScreen";
import { ActivityDetailScreen } from "../screens/train/ActivityDetailScreen";
import { FormAnalysisScreen } from "../screens/train/FormAnalysisScreen";
import { SessionSetsScreen } from "../screens/train/SessionSetsScreen";

// docs/mobile/03-screen-inventory.md §C: Train Dashboard -> Training
// Programs -> Program Detail -> Workout Detail -> Active Workout ->
// Workout Complete. "Training Programs" (a separate marketplace/browse
// screen, trn-02) shipped 22 Sep 2026 as ProgramsMarketplaceScreen,
// reachable from Train Dashboard's new "Browse All Programs" entry —
// Train Dashboard's own inline program list stays as-is (a short, unfiltered
// preview) alongside the real browse/search/filter screen. §I (Phase 3,
// pulled forward): Train Dashboard -> My Programs -> Program Progress
// (active) or Program Completion (finished), and Program Detail's real
// Purchase flow. Active Workout -> Set/Rest Tracker (trn-08, later Phase 1)
// is presented modally per docs/mobile/02-information-architecture.md §4's
// "without leaving the workout session" framing. Train Dashboard ->
// Exercise Library -> Exercise Detail (trn-05/06, added 19 Aug 2026) —
// Exercise Detail can push another instance of itself via its
// "alternatives" section, hence `navigation.push` rather than `navigate` in
// that screen. Train Dashboard -> Workout History (trn-11, added 19 Aug
// 2026) — history rows navigate to the existing WorkoutDetail screen
// rather than a dedicated "session detail" screen, since none exists in
// the 82-screen inventory (see gap §27).
export type TrainStackParamList = {
  TrainDashboard: undefined;
  ProgramsMarketplace: undefined;
  ProgramDetail: { programId: string };
  WorkoutDetail: { workoutId: string };
  ActiveWorkout: { workoutId: string; sessionId: string };
  SetRestTracker: { workoutId: string; sessionId: string; exerciseIndex: number };
  WorkoutComplete: { sessionId: string; workoutName: string };
  MyPrograms: undefined;
  ProgramProgress: { programId: string };
  ProgramCompletion: { programId: string };
  ExerciseLibrary: undefined;
  ExerciseDetail: { exerciseId: string };
  WorkoutHistory: undefined;
  // Train 09 - client-side swap of one WorkoutExercise (see lib/exerciseSwaps.ts).
  ExerciseSwap: { workoutId: string; workoutExerciseId: string; exerciseId: string };
  // Wave B (Oct 2026): Train 12-16, 18 + set edit/delete.
  TrainingAnalytics: undefined;
  Routines: undefined;
  RoutineEditor: { routineId?: string };
  // Train 13 - unified reminders + medicine doses + saved routines.
  RemindersRoutines: undefined;
  WorkoutSettings: undefined;
  ActivityTracker: { kind: ActivityKind };
  ActivityDetail: { activityId: string };
  FormAnalysis: undefined;
  SessionSets: { sessionId: string; workoutName: string; workoutId?: string };
};

const Stack = createNativeStackNavigator<TrainStackParamList>();

export function TrainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="TrainDashboard" component={TrainScreen} />
      <Stack.Screen name="ProgramsMarketplace" component={ProgramsMarketplaceScreen} />
      <Stack.Screen name="ProgramDetail" component={ProgramDetailScreen} />
      <Stack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} />
      <Stack.Screen name="ActiveWorkout" component={ActiveWorkoutScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="SetRestTracker" component={SetRestTrackerScreen} options={{ presentation: "modal" }} />
      <Stack.Screen name="WorkoutComplete" component={WorkoutCompleteScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="MyPrograms" component={MyProgramsScreen} />
      <Stack.Screen name="ProgramProgress" component={ProgramProgressScreen} />
      <Stack.Screen name="ProgramCompletion" component={ProgramCompletionScreen} />
      <Stack.Screen name="ExerciseLibrary" component={ExerciseLibraryScreen} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
      <Stack.Screen name="WorkoutHistory" component={WorkoutHistoryScreen} />
      <Stack.Screen name="ExerciseSwap" component={ExerciseSwapScreen} />
      <Stack.Screen name="TrainingAnalytics" component={TrainingAnalyticsScreen} />
      <Stack.Screen name="Routines" component={RoutinesScreen} />
      <Stack.Screen name="RoutineEditor" component={RoutineEditorScreen} />
      <Stack.Screen name="RemindersRoutines" component={RemindersRoutinesScreen} />
      <Stack.Screen name="WorkoutSettings" component={WorkoutSettingsScreen} />
      <Stack.Screen name="ActivityTracker" component={ActivityTrackerScreen} />
      <Stack.Screen name="ActivityDetail" component={ActivityDetailScreen} />
      <Stack.Screen name="FormAnalysis" component={FormAnalysisScreen} />
      <Stack.Screen name="SessionSets" component={SessionSetsScreen} />
    </Stack.Navigator>
  );
}
