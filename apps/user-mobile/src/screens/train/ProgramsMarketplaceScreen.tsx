import React, { useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { Program, ProgramType } from "@fitness-ai-app/types";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { fetchPrograms } from "../../api/programs";
import { fetchMyPrograms } from "../../api/programPurchases";
import { fetchNextWorkout } from "../../api/plans";
import { useTheme } from "../../theme/ThemeProvider";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

const ALL = "All";
const FREE = "Free";
const PAID = "Paid";
const LEVELS = ["beginner", "intermediate", "advanced"] as const;
const LEVEL_LABEL: Record<(typeof LEVELS)[number], string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};
const TYPE_LABELS: Record<ProgramType, string> = { fitness: "Fitness", nutrition: "Nutrition", combined: "Combined" };

function formatPrice(priceCents: number): string {
  return priceCents === 0 ? "Free" : `₹${Math.round(priceCents / 100).toLocaleString("en-IN")}`;
}

/** Small outlined filter chip used by the two filter rows (Figma Train 02). */
function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors: theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? theme.accent : colors.border,
        backgroundColor: selected ? theme.accent : colors.surface,
      }}
    >
      <Text style={{ color: selected ? theme.textOnAccent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Tag({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "accent" }) {
  const { colors: theme } = useTheme();
  return (
    <View
      style={{
        borderRadius: 6,
        borderWidth: 1,
        borderColor: tone === "accent" ? theme.accent : colors.borderStrong,
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <Text style={{ color: tone === "accent" ? theme.accent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 10 }}>{label}</Text>
    </View>
  );
}

interface CatalogProps {
  navigation: NativeStackNavigationProp<TrainStackParamList>;
}

/**
 * Programs tab body (Figma Train 02): type/level filter chips, a featured
 * card, the "Explore Programs" two-column grid and the AI footer. The
 * featured card and footer only appear when the user has a real active
 * plan; the grid reads the same `GET /programs` as before (now with
 * `workoutCount`/`level`) and filters client-side. Prices and the Buy flow
 * live on Program Detail (Razorpay), cards only navigate there.
 */
export function ProgramsCatalog({ navigation }: CatalogProps) {
  const { colors: theme } = useTheme();
  const { data: programs, isLoading, isError, refetch } = useQuery({ queryKey: ["programs"], queryFn: fetchPrograms });
  const myPrograms = useQuery({ queryKey: ["programs", "mine"], queryFn: fetchMyPrograms });
  const nextWorkout = useQuery({ queryKey: ["plans", "current", "nextWorkout"], queryFn: fetchNextWorkout });

  const [kind, setKind] = useState<string>(ALL);
  const [level, setLevel] = useState<string>(ALL);

  const kindOptions = useMemo(() => {
    const types = Array.from(new Set((programs ?? []).map((p) => p.type))).sort();
    return [ALL, ...types, FREE, PAID];
  }, [programs]);

  const levelOptions = useMemo(() => {
    const present = new Set((programs ?? []).map((p) => p.level).filter(Boolean));
    return [ALL, ...LEVELS.filter((l) => present.has(l))];
  }, [programs]);

  const filtered = useMemo(
    () =>
      (programs ?? []).filter((p) => {
        const matchesKind =
          kind === ALL || (kind === FREE ? p.priceCents === 0 : kind === PAID ? p.priceCents > 0 : p.type === kind);
        const matchesLevel = level === ALL || p.level === level;
        return matchesKind && matchesLevel;
      }),
    [programs, kind, level],
  );

  const progressById = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of myPrograms.data ?? []) {
      if (m.totalWorkouts > 0) map.set(m.program.id, Math.round((m.completedWorkouts / m.totalWorkouts) * 100));
    }
    return map;
  }, [myPrograms.data]);

  const plan = nextWorkout.data?.plan;
  const featured = useMemo(
    () => (plan?.programId ? (programs ?? []).find((p) => p.id === plan.programId) ?? null : null),
    [plan?.programId, programs],
  );

  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading) return <ActivityIndicator color={colors.accent} />;

  const open = (programId: string) => navigation.navigate("ProgramDetail", { programId });

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ marginHorizontal: -spacing.md }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.md }}>
          {kindOptions.map((k) => (
            <FilterChip key={k} label={k === ALL || k === FREE || k === PAID ? k : TYPE_LABELS[k as ProgramType] ?? k} selected={kind === k} onPress={() => setKind(k)} />
          ))}
        </ScrollView>
        {levelOptions.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.md, marginTop: 8 }}
          >
            {levelOptions.map((l) => (
              <FilterChip
                key={l}
                label={l === ALL ? ALL : LEVEL_LABEL[l as (typeof LEVELS)[number]]}
                selected={level === l}
                onPress={() => setLevel(l)}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>

      {featured ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
          {featured.imageUrl ? (
            <Image source={{ uri: featured.imageUrl }} style={{ width: "100%", height: 130, backgroundColor: colors.surfaceRaised }} resizeMode="cover" />
          ) : (
            <View style={{ height: 90, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
              <Icon name="dumbbell" size={30} color={theme.accent} />
            </View>
          )}
          <View style={{ padding: spacing.md }}>
            <Text style={{ color: theme.accent, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.6 }}>RECOMMENDED FOR YOU</Text>
            <Text style={{ color: colors.textPrimary, ...typography.h2, marginTop: 4 }}>{featured.name}</Text>
            <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>
              {featured.durationWeeks} weeks
              {featured.workoutCount ? ` · ${featured.workoutCount} workouts` : ""}
              {featured.level ? ` · ${LEVEL_LABEL[featured.level]}` : ""}
            </Text>
            <Button label="View Program" onPress={() => open(featured.id)} style={{ marginTop: spacing.md, height: 44 }} />
          </View>
        </View>
      ) : null}

      <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Explore Programs</Text>
      {filtered.length === 0 ? (
        <EmptyState title="No programs match" subtitle="Try a different filter." />
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {filtered.map((p: Program) => {
            const progress = progressById.get(p.id);
            return (
              <Pressable
                key={p.id}
                onPress={() => open(p.id)}
                accessibilityRole="button"
                accessibilityLabel={`${p.name}, ${formatPrice(p.priceCents)}`}
                style={{
                  width: "48%",
                  flexGrow: 1,
                  minWidth: 150,
                  backgroundColor: colors.surface,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 12,
                  gap: 6,
                }}
              >
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.displaySemi, fontSize: 14 }} numberOfLines={2}>
                  {p.name}
                </Text>
                <Text style={{ color: colors.textMuted, ...typography.meta }}>
                  {p.durationWeeks} weeks{p.workoutCount ? ` · ${p.workoutCount} workouts` : ""}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                  <Text style={{ color: p.priceCents === 0 ? colors.success : theme.accent, fontFamily: fonts.bodyBold, fontSize: 13 }}>
                    {formatPrice(p.priceCents)}
                    {p.priceCents > 0 ? <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 }}> /program</Text> : null}
                  </Text>
                  {p.level ? <Tag label={LEVEL_LABEL[p.level]} /> : null}
                </View>
                {p.isAiOnly ? <Text style={{ color: colors.aiAccent, fontFamily: fonts.bodySemi, fontSize: 11 }}>Personalized</Text> : null}
                {progress != null ? (
                  <View style={{ gap: 3 }}>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: "hidden" }}>
                      <View style={{ height: "100%", width: `${progress}%`, backgroundColor: theme.accent }} />
                    </View>
                    <Text style={{ color: theme.accent, fontSize: 10 }}>{progress}% completed</Text>
                  </View>
                ) : null}
                <View
                  style={{
                    marginTop: 4,
                    height: 36,
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: colors.borderStrong,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 12 }}>View Program</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {plan?.programName ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            backgroundColor: colors.aiAccentSoft,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.aiBorder,
            padding: spacing.md,
          }}
        >
          <Icon name="sparkles" size={16} color={colors.aiAccent} />
          <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 12 }}>
            {plan.programName} is the program your current plan is built on.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
