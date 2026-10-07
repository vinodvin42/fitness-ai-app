import { useCallback, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { UnitPreferences } from "@fitness-ai-app/types";
import { useAuth } from "../context/AuthContext";

/**
 * Display units. The API and database always store cm, kg, km, degrees C and
 * ml; this only converts for display and for what the user types.
 *
 * Resolution order per measure: the account's saved `unitPreferences` (set in
 * Settings > Measurement Units) > the legacy local imperial toggle > the
 * account's coarse `unitSystem`. Existing screens that only know weight and
 * body-length keep working: `wt`/`toKg` follow the weight unit and
 * `len`/`toCm` follow the height unit (inches when height is "ft").
 */
const KEY = "primefit.measureUnits.imperial";
const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;
const KM_PER_MI = 1.609344;
const ML_PER_OZ = 29.5735295625;

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
export const kmToMi = (km: number) => km / KM_PER_MI;
export const miToKm = (mi: number) => mi * KM_PER_MI;
export const cToF = (c: number) => (c * 9) / 5 + 32;
export const mlToOz = (ml: number) => ml / ML_PER_OZ;
export const ozToMl = (oz: number) => oz * ML_PER_OZ;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 175 (cm) -> `5'9"`. */
export function formatFeetInches(cm: number): string {
  const totalIn = Math.round(cmToIn(cm));
  return `${Math.floor(totalIn / 12)}'${totalIn % 12}"`;
}

/** The unit set a user sees, resolved from their saved preferences. */
export function resolveUnits(
  prefs: UnitPreferences | null | undefined,
  unitSystem: "metric" | "imperial" | undefined,
  localImperial: boolean | null = null,
) {
  const base = localImperial ?? unitSystem === "imperial";
  return {
    weight: prefs?.weight ?? (base ? "lb" : "kg"),
    height: prefs?.height ?? (base ? "ft" : "cm"),
    distance: prefs?.distance ?? (base ? "mi" : "km"),
    temperature: prefs?.temperature ?? (base ? "F" : "C"),
    water: prefs?.water ?? (base ? "oz" : "ml"),
  } as const;
}

export function useMeasureUnits() {
  const { user, updateProfile } = useAuth();
  useEffect(() => {
    void loadOnce();
  }, []);
  const local = useSyncExternalStore(
    subscribe,
    () => imperial,
    () => imperial,
  );
  const u = resolveUnits(user?.unitPreferences, user?.unitSystem, local);
  const weightImperial = u.weight === "lb";
  const lengthImperial = u.height === "ft";
  const isImperial = weightImperial && lengthImperial;

  /** Legacy quick toggle (Log Measurement): flips weight and height together and saves them on the account. */
  const toggle = useCallback(
    (v: boolean) => {
      setImperialUnits(v);
      void updateProfile({
        unitPreferences: { ...(user?.unitPreferences ?? {}), weight: v ? "lb" : "kg", height: v ? "ft" : "cm" },
      }).catch(() => undefined);
    },
    [updateProfile, user?.unitPreferences],
  );

  return {
    isImperial,
    setImperial: toggle,
    /** Body-measurement length unit (circumferences): inches when height is shown in ft. */
    lenUnit: lengthImperial ? "in" : "cm",
    wtUnit: weightImperial ? "lb" : "kg",
    weightUnit: u.weight,
    heightUnit: u.height,
    distanceUnit: u.distance,
    temperatureUnit: u.temperature,
    waterUnit: u.water,
    /** stored cm -> display number */
    len: (cm: number) => round1(lengthImperial ? cmToIn(cm) : cm),
    /** stored kg -> display number */
    wt: (kg: number) => round1(weightImperial ? kgToLb(kg) : kg),
    /** typed display number -> cm for the API */
    toCm: (v: number) => (lengthImperial ? inToCm(v) : v),
    /** typed display number -> kg for the API */
    toKg: (v: number) => (weightImperial ? lbToKg(v) : v),
    /** stored body height cm -> "175 cm" or `5'9"` */
    heightText: (cm: number) => (lengthImperial ? formatFeetInches(cm) : `${Math.round(cm)} cm`),
    /** stored kg -> "78.4 kg" / "172.8 lb" */
    weightText: (kg: number) => `${round1(weightImperial ? kgToLb(kg) : kg)} ${weightImperial ? "lb" : "kg"}`,
    /** stored metres -> "5.00 km" / "3.11 mi" */
    distanceText: (meters: number) =>
      u.distance === "mi" ? `${kmToMi(meters / 1000).toFixed(2)} mi` : `${(meters / 1000).toFixed(2)} km`,
    /** stored degrees C -> "21°C" / "70°F" */
    temperatureText: (c: number) => (u.temperature === "F" ? `${Math.round(cToF(c))}°F` : `${Math.round(c)}°C`),
    /** stored ml -> "500 ml" / "17 oz" */
    waterText: (ml: number) => (u.water === "oz" ? `${Math.round(mlToOz(ml))} oz` : `${Math.round(ml)} ml`),
  };
}
