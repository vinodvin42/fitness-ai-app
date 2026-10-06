import { useCallback, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../context/AuthContext";

/**
 * Display units for body measurements (Progress / Log Measurements). The API
 * and database always store cm and kg; this only converts for display and
 * for what the user types. The choice is persisted locally (AsyncStorage) and
 * defaults to the account's unitSystem preference until the user toggles it.
 */
const KEY = "primefit.measureUnits.imperial";
const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;

let imperial: boolean | null = null; // null = not chosen locally yet
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

async function loadOnce() {
  if (loaded) return;
  loaded = true;
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v === "1" || v === "0") {
      imperial = v === "1";
      emit();
    }
  } catch {
    /* storage unavailable: keep the account default */
  }
}

export function setImperialUnits(value: boolean) {
  imperial = value;
  emit();
  AsyncStorage.setItem(KEY, value ? "1" : "0").catch(() => undefined);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const inToCm = (inch: number) => inch * CM_PER_IN;
export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function useMeasureUnits() {
  const { user } = useAuth();
  useEffect(() => {
    void loadOnce();
  }, []);
  const local = useSyncExternalStore(
    subscribe,
    () => imperial,
    () => imperial,
  );
  const isImperial = local ?? user?.unitSystem === "imperial";

  const toggle = useCallback((v: boolean) => setImperialUnits(v), []);

  return {
    isImperial,
    setImperial: toggle,
    lenUnit: isImperial ? "in" : "cm",
    wtUnit: isImperial ? "lb" : "kg",
    /** stored cm -> display number */
    len: (cm: number) => round1(isImperial ? cmToIn(cm) : cm),
    /** stored kg -> display number */
    wt: (kg: number) => round1(isImperial ? kgToLb(kg) : kg),
    /** typed display number -> cm for the API */
    toCm: (v: number) => (isImperial ? inToCm(v) : v),
    /** typed display number -> kg for the API */
    toKg: (v: number) => (isImperial ? lbToKg(v) : v),
  };
}
