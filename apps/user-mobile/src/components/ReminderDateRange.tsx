import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Icon } from "./Icon";
import { SegmentedControl } from "./SegmentedControl";
import { DateWheel } from "./WheelPicker";
import { addDays, daysInclusive, endDateFromDays, localYmd, MAX_DAYS } from "../lib/reminderSchedule";
import { formatDayMonthYear, formatLongDate } from "../lib/medicationReminder";
import { colors, fonts, radius, spacing, typography } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

type EndMode = "none" | "date" | "days";

const END_OPTIONS: ReadonlyArray<{ value: EndMode; label: string }> = [
  { value: "none", label: "No end" },
  { value: "date", label: "End date" },
  { value: "days", label: "Days" },
];

export type DateRangeChange = { startDate: string; endDate: string | null; error: string | null };

const longDate = (ymd: string) => formatLongDate(new Date(`${ymd}T12:00:00`));
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "Today, 25 Oct 2026" or "Sun 1 Nov 2026": fits the row on a small phone. */
function rowDate(ymd: string, today: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  return `${ymd === today ? "Today," : WEEKDAY_SHORT[d.getDay()]} ${formatDayMonthYear(d)}`;
}

function DateRow({ label, ymd, open, onPress }: { label: string; ymd: string; open: boolean; onPress: () => void }) {
  const value = rowDate(ymd, localYmd());
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${label}: ${value}. Change`}
      style={({ pressed }) => ({
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: open ? colors.accent : colors.border,
        backgroundColor: pressed ? colors.surfaceRaised : colors.surface,
      })}
    >
      <Icon name="calendar" size={18} color={colors.textMuted} />
      <Text style={{ color: colors.textSecondary, ...typography.label, fontSize: 14, width: 56 }}>{label}</Text>
      <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14, textAlign: "right" }} numberOfLines={1}>
        {value}
      </Text>
      <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
        <Icon name="chevron-down" size={16} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

/**
 * When a reminder starts and stops (owner, 25 Oct 2026: "start date and end date or number of days"):
 * a start date, then no end, an end date, or a number of days counted from the start (day 1 is the
 * start day). Used by Add Reminder and the medicine Add Reminder. `startOnly` shows just the one date
 * (a medicine set to "Once").
 */
export function ReminderDateRange({
  startDate,
  endDate,
  onChange,
  startOnly,
  startLabel = "Starts",
}: {
  startDate: string;
  endDate: string | null;
  onChange: (next: DateRangeChange) => void;
  startOnly?: boolean;
  startLabel?: string;
}) {
  const { colors: theme } = useTheme();
  const [mode, setMode] = useState<EndMode>(endDate ? "date" : "none");
  const [daysText, setDaysText] = useState(endDate && endDate >= startDate ? String(daysInclusive(startDate, endDate)) : "7");
  const [open, setOpen] = useState<"start" | "end" | null>(null);

  const parsedDays = /^\d+$/.test(daysText) ? Number(daysText) : NaN;
  const daysValid = parsedDays >= 1 && parsedDays <= MAX_DAYS;
  const DAYS_ERROR = `Enter 1 to ${MAX_DAYS} days`;
  const ORDER_ERROR = "The end date can't be before the start date";

  const emit = (start: string, end: string | null, error: string | null = null) => onChange({ startDate: start, endDate: end, error });

  const changeStart = (s: string) => {
    if (startOnly || mode === "none") return emit(s, null);
    if (mode === "days") return daysValid ? emit(s, endDateFromDays(s, parsedDays)) : emit(s, null, DAYS_ERROR);
    // End date: keep it, but never before the new start.
    return emit(s, endDate && endDate >= s ? endDate : s);
  };

  const changeMode = (m: EndMode) => {
    setMode(m);
    setOpen(null);
    if (m === "none") return emit(startDate, null);
    if (m === "date") return emit(startDate, endDate && endDate >= startDate ? endDate : addDays(startDate, 6));
    const n = daysValid ? parsedDays : 7;
    setDaysText(String(n));
    return emit(startDate, endDateFromDays(startDate, n));
  };

  const changeDays = (text: string) => {
    const clean = text.replace(/[^0-9]/g, "").slice(0, 3);
    setDaysText(clean);
    const n = Number(clean);
    if (!clean || n < 1 || n > MAX_DAYS) return emit(startDate, null, DAYS_ERROR);
    return emit(startDate, endDateFromDays(startDate, n));
  };

  const changeEnd = (e: string) => emit(startDate, e, e < startDate ? ORDER_ERROR : null);

  const today = localYmd();
  const endPassed = !startOnly && mode !== "none" && endDate != null && endDate < today;

  return (
    <View style={{ gap: spacing.sm }}>
      <DateRow label={startLabel} ymd={startDate} open={open === "start"} onPress={() => setOpen(open === "start" ? null : "start")} />
      {open === "start" ? <DateWheel value={startDate} onChange={changeStart} /> : null}

      {startOnly ? null : (
        <>
          <Text style={{ color: colors.textSecondary, ...typography.label, marginTop: spacing.xs }}>Ends</Text>
          <SegmentedControl options={END_OPTIONS} value={mode} onChange={changeMode} />

          {mode === "date" && endDate ? (
            <>
              <DateRow label="Ends" ymd={endDate} open={open === "end"} onPress={() => setOpen(open === "end" ? null : "end")} />
              {open === "end" ? <DateWheel value={endDate} onChange={changeEnd} /> : null}
              {endDate >= startDate ? (
                <Text style={{ color: colors.textMuted, ...typography.meta }}>
                  {daysInclusive(startDate, endDate) === 1 ? "1 day" : `${daysInclusive(startDate, endDate)} days`}, start and end days included.
                </Text>
              ) : (
                <Text style={{ color: colors.dangerText, ...typography.meta }}>{ORDER_ERROR}.</Text>
              )}
            </>
          ) : null}

          {mode === "days" ? (
            <View style={{ gap: spacing.xs }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <TextInput
                  value={daysText}
                  onChangeText={changeDays}
                  keyboardType="number-pad"
                  maxLength={3}
                  accessibilityLabel="Number of days"
                  selectTextOnFocus
                  style={{
                    width: 88,
                    height: 48,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: daysValid ? colors.border : colors.dangerText,
                    backgroundColor: colors.surface,
                    color: colors.textPrimary,
                    fontFamily: fonts.bodySemi,
                    fontSize: 18,
                    textAlign: "center",
                  }}
                />
                <Text style={{ color: colors.textPrimary, ...typography.body }}>{parsedDays === 1 ? "day" : "days"}</Text>
              </View>
              {daysValid ? (
                <Text style={{ color: colors.textMuted, ...typography.meta }}>
                  Counting {startDate === today ? "today" : "the start day"} as day 1, the last day is{" "}
                  <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi }}>{longDate(endDateFromDays(startDate, parsedDays))}</Text>.
                </Text>
              ) : (
                <Text style={{ color: colors.dangerText, ...typography.meta }}>{DAYS_ERROR}.</Text>
              )}
            </View>
          ) : null}

          {endPassed ? (
            <Text style={{ color: colors.warningText, ...typography.meta }}>This end date has passed, so the reminder won't go off.</Text>
          ) : null}
        </>
      )}
    </View>
  );
}
