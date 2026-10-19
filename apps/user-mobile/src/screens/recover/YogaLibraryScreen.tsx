import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SearchBar } from "../../components/SearchBar";
import { Icon, IconName } from "../../components/Icon";
import { BREATHING_PATTERNS, GUIDED_ROUTINES, WELLNESS_NOTE } from "../../content/recover";
import type { LibraryCategory } from "../../content/recover";
import { visibleYogaPrograms } from "../../content/yogaFoundations";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";
import { ActionButton, PracticeArt, RecoverShell, SectionLabel } from "./parts";

type Props = NativeStackScreenProps<RecoverStackParamList, "YogaLibrary">;

interface Entry {
  key: string;
  category: LibraryCategory;
  tag: string;
  title: string;
  meta: string;
  blurb: string;
  icon: IconName;
  open: () => void;
}

const FILTERS: Array<"All" | LibraryCategory> = ["All", "Yoga", "Breathing", "Mobility"];

/** Recover 06 - Yoga & Mobility library (bundled content, see src/content/recover.ts). */
export function YogaLibraryScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const entries = useMemo<Entry[]>(() => {
    const easy = BREATHING_PATTERNS[0];
    const fromRoutine = (id: string): Entry => {
      const r = GUIDED_ROUTINES.find((x) => x.id === id)!;
      return {
        key: r.id,
        category: r.category,
        tag: r.kind === "yoga" ? `YOGA · ${r.level.toUpperCase()}` : r.kind === "mobility" ? "MOBILITY" : "MINDFUL",
        title: r.title,
        meta: r.meta,
        blurb: r.kind === "yoga" ? "An unhurried sequence of seated, tabletop and resting poses." : r.description,
        icon: r.kind === "mobility" ? "activity" : r.kind === "mindful" ? "brain" : "flower",
        open: () => navigation.navigate("RoutineDetail", { routineId: r.id }),
      };
    };
    return [
      fromRoutine("gentle-yoga"),
      {
        key: "breathing-easy",
        category: "Breathing",
        tag: "BREATHING",
        title: easy.name,
        meta: "5 min · Seated · No equipment",
        blurb: "A simple rhythm, at your own pace.",
        icon: "wind",
        open: () => navigation.navigate("GuidedBreathing", { patternId: easy.id }),
      },
      fromRoutine("shoulder-hamstring-mobility"),
      fromRoutine("mindful-practice"),
    ];
  }, [navigation]);

  // Multi-week programs (drafts only appear in development builds).
  const programs = visibleYogaPrograms(__DEV__);
  const q = query.trim().toLowerCase();
  const shownPrograms = programs.filter(
    (p) => (filter === "All" || filter === "Yoga") && (!q || `${p.title} ${p.description} yoga program`.toLowerCase().includes(q)),
  );
  const shown = entries.filter(
    (e) => (filter === "All" || e.category === filter) && (!q || `${e.title} ${e.meta} ${e.blurb} ${e.tag}`.toLowerCase().includes(q)),
  );
  const hero = shown.find((e) => e.key === "gentle-yoga");
  const rest = shown.filter((e) => e !== hero);

  return (
    <RecoverShell title="Yoga & Mobility" subtitle="Recovery · Move gently, breathe easily" onBack={() => navigation.goBack()}>
      <SearchBar value={query} onChangeText={setQuery} placeholder="Search yoga, breathing or mobility" />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {FILTERS.map((f) => {
          const on = filter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{
                borderRadius: radius.xs,
                borderWidth: 1,
                borderColor: on ? colors.accent : colors.border,
                backgroundColor: on ? colors.accentSoft : colors.surface,
                paddingHorizontal: spacing.md,
                paddingVertical: 6,
                minWidth: 52,
                alignItems: "center",
              }}
            >
              <Text style={{ color: on ? colors.accent : colors.textSecondary, ...typography.label, fontSize: 13 }}>{f}</Text>
            </Pressable>
          );
        })}
      </View>

      {shownPrograms.length > 0 ? (
        <>
          <SectionLabel>Programs</SectionLabel>
          {shownPrograms.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => navigation.navigate("YogaProgram", { programId: p.id })}
              accessibilityRole="button"
              accessibilityLabel={`${p.title}, ${p.weeks.length} week yoga program${p.reviewStatus === "draft" ? ", draft" : ""}`}
              style={{
                backgroundColor: colors.surface,
                borderRadius: radius.card,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.md,
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
              }}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Icon name="flower" size={12} color={colors.accent} />
                  <Text style={{ color: colors.accentText, ...typography.caption, letterSpacing: 0.6 }}>
                    YOGA PROGRAM · {p.level.toUpperCase()}
                    {p.reviewStatus === "draft" ? " · DRAFT" : ""}
                  </Text>
                </View>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 15 }}>{p.title}</Text>
                <Text style={{ color: colors.textMuted, ...typography.meta }}>
                  {p.weeks.length} weeks · {p.daysPerWeek} days a week · {p.minutesLabel} min
                </Text>
                <Text style={{ color: colors.textSecondary, ...typography.meta }}>{p.description}</Text>
              </View>
              <Icon name="chevron-right" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </>
      ) : null}

      {hero ? (
        <>
          <SectionLabel>Start with something gentle</SectionLabel>
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.sm + 2,
              gap: spacing.sm,
            }}
          >
            <PracticeArt height={150} icon={hero.icon} />
            <View style={{ paddingHorizontal: 4, gap: 4 }}>
              <Text style={{ color: colors.accentText, ...typography.caption, letterSpacing: 0.6 }}>{hero.tag}</Text>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 18 }}>{hero.title}</Text>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>{hero.meta}</Text>
              <Text style={{ color: colors.textSecondary, ...typography.meta }}>{hero.blurb}</Text>
            </View>
            <ActionButton label="View session" onPress={hero.open} />
          </View>
        </>
      ) : null}

      {rest.length > 0 ? <SectionLabel>{hero ? "More ways to recover" : "Practices"}</SectionLabel> : null}
      {rest.map((e) => (
        <Pressable
          key={e.key}
          onPress={e.open}
          accessibilityRole="button"
          accessibilityLabel={e.title}
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing.md,
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name={e.icon} size={12} color={colors.accent} />
              <Text style={{ color: colors.accentText, ...typography.caption, letterSpacing: 0.6 }}>{e.tag}</Text>
            </View>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 15 }}>{e.title}</Text>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>{e.meta}</Text>
            <Text style={{ color: colors.textSecondary, ...typography.meta }}>{e.blurb}</Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.textMuted} />
        </Pressable>
      ))}
      {shown.length === 0 && shownPrograms.length === 0 ? <Text style={{ color: colors.textMuted, ...typography.meta }}>Nothing matches that search.</Text> : null}

      <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 13 }}>{WELLNESS_NOTE}</Text>
    </RecoverShell>
  );
}
