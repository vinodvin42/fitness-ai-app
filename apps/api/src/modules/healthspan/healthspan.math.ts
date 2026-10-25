/**
 * Healthspan estimates (owner, 25 Oct 2026, phases 1 and 2: fitness age and
 * heart age). Pure functions; every number comes from a published model and
 * is labelled an estimate in the app, never a diagnosis.
 *
 * 1. VO2max without an exercise test: the NTNU / HUNT non-exercise model,
 *    Nes BM et al., "Estimating VO2peak from a nonexercise prediction model:
 *    the HUNT Study, Norway", Med Sci Sports Exerc 2011;43(11):2024-30.
 *      men   = 100.27  - 0.296 age - 0.369 waist(cm) - 0.155 RHR + 0.226 PA
 *      women =  74.736 - 0.247 age - 0.259 waist(cm) - 0.114 RHR + 0.198 PA
 *    PA = HUNT physical-activity index = frequency x intensity x duration
 *    scores (0, 0.5, 1, 2.5, 5) x (1, 2, 3) x (0.10, 0.38, 0.75, 1.0), 0-15.
 *    Standard error about 5 mL/kg/min. A VO2max measured by a watch or test
 *    is used instead whenever the member has one.
 *
 * 2. Fitness age: the age at which the average man or woman in the HUNT3
 *    Fitness Study (4,631 healthy adults; NTNU CERG "Fitness numbers") has
 *    the member's VO2max, with straight lines between the published age-band
 *    averages placed at each band's middle year.
 *
 * 3. Heart age: the Framingham 2008 office-based (BMI) model, D'Agostino RB et
 *    al., Circulation 2008;117:743-753, with the coefficients, baseline
 *    survival and "normal" reference levels (SBP 125 untreated, BMI 22.5,
 *    non-smoker, no diabetes) of the Framingham Heart Study's own calculator
 *    (gencardio_bmi.xls). Heart age = the age at which a person with normal
 *    levels has the same 10-year cardiovascular risk. Valid for ages 30-74;
 *    derived in a US population, so it is shown as a guide.
 *
 * 4. 10-year cardiovascular risk for Indian members: the WHO 2019
 *    non-laboratory model (WHO CVD Risk Chart Working Group, Kaptoge S et al.,
 *    Lancet Glob Health 2019;7:e1332-45) recalibrated to the GBD "South Asia"
 *    region (India, 2017). Coefficients and baseline survival from the
 *    authors' Stata code (github.com/skkceu/stata whocvdrisk_erfc_score_v03.ado),
 *    identical in the R packages WHORiskCalculator and who_cvd_calculator;
 *    recalibration intercepts and slopes from the authors' file
 *    whocvdrisk_t10_calparms_gbd_sens0.dta (ccode IND, 2017, cal2 = region).
 *    Heart attack and stroke risks are recalibrated on the complementary
 *    log-log scale and combined assuming independence. Ages 40-74 (the
 *    charts' range). It has no diabetes term.
 */

export type Sex = "male" | "female";

// ---- HUNT physical-activity index ------------------------------------------

export const PA_FREQUENCY = { never: 0, less_than_weekly: 0.5, weekly: 1, two_three_weekly: 2.5, almost_daily: 5 } as const;
export const PA_INTENSITY = { easy: 1, breathless: 2, near_exhaustion: 3 } as const;
export const PA_DURATION = { under_15: 0.1, from_15_to_29: 0.38, from_30_to_60: 0.75, over_60: 1.0 } as const;

export type PaFrequency = keyof typeof PA_FREQUENCY;
export type PaIntensity = keyof typeof PA_INTENSITY;
export type PaDuration = keyof typeof PA_DURATION;

export interface ActivityAnswers {
  frequency: PaFrequency;
  intensity?: PaIntensity | null;
  duration?: PaDuration | null;
}

/** 0-15. Someone who never exercises scores 0 whatever the other answers. */
export function paIndex(a: ActivityAnswers): number | null {
  const f = PA_FREQUENCY[a.frequency];
  if (f === 0) return 0;
  if (!a.intensity || !a.duration) return null;
  return f * PA_INTENSITY[a.intensity] * PA_DURATION[a.duration];
}

// ---- VO2max ------------------------------------------------------------------

export function estimateVo2max(i: { sex: Sex; age: number; waistCm: number; restingHr: number; paIndex: number }): number {
  return i.sex === "male"
    ? 100.27 - 0.296 * i.age - 0.369 * i.waistCm - 0.155 * i.restingHr + 0.226 * i.paIndex
    : 74.736 - 0.247 * i.age - 0.259 * i.waistCm - 0.114 * i.restingHr + 0.198 * i.paIndex;
}

// ---- Fitness age -------------------------------------------------------------

/** HUNT3 mean VO2max (mL/kg/min) by age band, placed at each band's middle year (70+ at 75). */
export const HUNT3_MEAN_VO2: Record<Sex, Array<[number, number]>> = {
  male: [
    [25, 54],
    [35, 49],
    [45, 47],
    [55, 42],
    [65, 39],
    [75, 34],
  ],
  female: [
    [25, 43],
    [35, 40],
    [45, 38],
    [55, 34],
    [65, 31],
    [75, 27],
  ],
};

export const FITNESS_AGE_MIN = 20;
export const FITNESS_AGE_MAX = 90;

/**
 * The age whose HUNT3 average equals this VO2max. Beyond the youngest or
 * oldest band the nearest segment's slope is continued, then held at 20 and
 * 90 (`bound` says when the true value lies further out).
 */
export function fitnessAge(sex: Sex, vo2max: number): { age: number; bound: "under" | "over" | null } {
  const pts = HUNT3_MEAN_VO2[sex];
  const along = (a: [number, number], b: [number, number]) => a[0] + ((vo2max - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
  let age: number;
  if (vo2max >= pts[0][1]) age = along(pts[0], pts[1]);
  else if (vo2max <= pts[pts.length - 1][1]) age = along(pts[pts.length - 2], pts[pts.length - 1]);
  else {
    let i = 0;
    while (!(vo2max <= pts[i][1] && vo2max >= pts[i + 1][1])) i++;
    age = along(pts[i], pts[i + 1]);
  }
  if (age < FITNESS_AGE_MIN) return { age: FITNESS_AGE_MIN, bound: "under" };
  if (age > FITNESS_AGE_MAX) return { age: FITNESS_AGE_MAX, bound: "over" };
  return { age, bound: null };
}

// ---- Heart age (Framingham 2008, BMI model) ------------------------------------

export const FRAMINGHAM_BMI: Record<
  Sex,
  { lnAge: number; lnBmi: number; lnSbpUntreated: number; lnSbpTreated: number; smoker: number; diabetes: number; mean: number; s0: number }
> = {
  male: { lnAge: 3.11296, lnBmi: 0.79277, lnSbpUntreated: 1.85508, lnSbpTreated: 1.92672, smoker: 0.70953, diabetes: 0.5316, mean: 23.9388, s0: 0.88431 },
  female: { lnAge: 2.72107, lnBmi: 0.51125, lnSbpUntreated: 2.81291, lnSbpTreated: 2.88267, smoker: 0.61868, diabetes: 0.77763, mean: 26.0145, s0: 0.94833 },
};

/** The Framingham Heart Study calculator's "normal" levels for heart age. */
export const HEART_AGE_NORMAL = { sbp: 125, bmi: 22.5 } as const;
export const HEART_AGE_VALID_AGES = { min: 30, max: 74 } as const;

export interface HeartInputs {
  sex: Sex;
  age: number;
  bmi: number;
  sbp: number;
  bpTreated: boolean;
  smoker: boolean;
  diabetes: boolean;
}

function sumBetaX(i: HeartInputs): number {
  const c = FRAMINGHAM_BMI[i.sex];
  return (
    c.lnAge * Math.log(i.age) +
    c.lnBmi * Math.log(i.bmi) +
    (i.bpTreated ? c.lnSbpTreated : c.lnSbpUntreated) * Math.log(i.sbp) +
    (i.smoker ? c.smoker : 0) +
    (i.diabetes ? c.diabetes : 0)
  );
}

/** 10-year risk of a cardiovascular event, 0-1. */
export function framinghamRisk(i: HeartInputs): number {
  const c = FRAMINGHAM_BMI[i.sex];
  return 1 - Math.pow(c.s0, Math.exp(sumBetaX(i) - c.mean));
}

/** The age at which someone of the same sex with normal levels has the same risk. */
export function heartAge(i: HeartInputs): number {
  const c = FRAMINGHAM_BMI[i.sex];
  const normalRest = c.lnBmi * Math.log(HEART_AGE_NORMAL.bmi) + c.lnSbpUntreated * Math.log(HEART_AGE_NORMAL.sbp);
  return Math.exp((sumBetaX(i) - normalRest) / c.lnAge);
}

// ---- WHO 2019 non-laboratory model, South Asia ---------------------------------

type WhoEndpoint = { age: number; bmi: number; sbp: number; smoker: number; bmiAge: number; sbpAge: number; smokerAge: number; s0: number };

export const WHO_NONLAB: Record<Sex, { chd: WhoEndpoint; stroke: WhoEndpoint }> = {
  male: {
    chd: { age: 0.073593, bmi: 0.0337219, sbp: 0.0133937, smoker: 0.5954767, bmiAge: -0.0010432, sbpAge: -0.0001837, smokerAge: -0.0200831, s0: 0.9544258 },
    stroke: { age: 0.097674, bmi: 0.0159518, sbp: 0.0227294, smoker: 0.4999862, bmiAge: -0.0003516, sbpAge: -0.0004374, smokerAge: -0.0153895, s0: 0.984826 },
  },
  female: {
    chd: { age: 0.1049418, bmi: 0.0257616, sbp: 0.016726, smoker: 1.093132, bmiAge: -0.0006537, sbpAge: -0.0001966, smokerAge: -0.0343739, s0: 0.9887124 },
    stroke: { age: 0.1046105, bmi: 0.0036406, sbp: 0.0216741, smoker: 0.7399405, bmiAge: -0.0000129, sbpAge: -0.0005311, smokerAge: -0.0203997, s0: 0.9885706 },
  },
};

/** GBD South Asia (India, 2017) recalibration, non-laboratory model: [intercept, slope]. */
export const WHO_SOUTH_ASIA_RECAL: Record<Sex, { chd: [number, number]; stroke: [number, number] }> = {
  male: { chd: [-0.20811593532562256, 0.9884583950042725], stroke: [-1.3655134439468384, 0.5289114713668823] },
  female: { chd: [-0.4299526512622833, 0.6976673603057861], stroke: [-1.056442379951477, 0.5795308947563171] },
};

export const WHO_VALID_AGES = { min: 40, max: 74 } as const;

/** The WHO charts' risk bands. */
export type WhoBand = "<5" | "5-10" | "10-20" | "20-30" | ">=30";

export function whoBand(riskPct: number): WhoBand {
  if (riskPct < 5) return "<5";
  if (riskPct < 10) return "5-10";
  if (riskPct < 20) return "10-20";
  if (riskPct < 30) return "20-30";
  return ">=30";
}

/** 10-year risk (0-1) of a heart attack or stroke, WHO 2019 non-laboratory model for South Asia. */
export function whoSouthAsiaRisk(i: { sex: Sex; age: number; sbp: number; bmi: number; smoker: boolean }): { chd: number; stroke: number; cvd: number } {
  const a = i.age - 60;
  const s = i.sbp - 120;
  const b = i.bmi - 25;
  const smk = i.smoker ? 1 : 0;
  const one = (c: WhoEndpoint, [cons, slope]: [number, number]) => {
    const lp = c.age * a + c.bmi * b + c.sbp * s + c.smoker * smk + c.bmiAge * a * b + c.sbpAge * a * s + c.smokerAge * a * smk;
    const uncalibrated = 1 - Math.pow(c.s0, Math.exp(lp));
    return 1 - Math.exp(-Math.exp(cons + slope * Math.log(-Math.log(1 - uncalibrated))));
  };
  const chd = one(WHO_NONLAB[i.sex].chd, WHO_SOUTH_ASIA_RECAL[i.sex].chd);
  const stroke = one(WHO_NONLAB[i.sex].stroke, WHO_SOUTH_ASIA_RECAL[i.sex].stroke);
  return { chd, stroke, cvd: 1 - (1 - chd) * (1 - stroke) };
}

/** Which of the member's own levels push heart age above their real age. */
export function heartAgeDrivers(i: HeartInputs): Array<"blood_pressure" | "bp_medication" | "bmi" | "smoking" | "diabetes"> {
  const out: Array<"blood_pressure" | "bp_medication" | "bmi" | "smoking" | "diabetes"> = [];
  if (i.sbp > HEART_AGE_NORMAL.sbp) out.push("blood_pressure");
  if (i.bpTreated) out.push("bp_medication");
  if (i.bmi > HEART_AGE_NORMAL.bmi) out.push("bmi");
  if (i.smoker) out.push("smoking");
  if (i.diabetes) out.push("diabetes");
  return out;
}
