import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SearchBar } from "../../components/SearchBar";
import { Icon } from "../../components/Icon";
import { DEVICE_CATEGORIES } from "../../content/recover";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";
import { RecoverShell } from "./parts";

type Props = NativeStackScreenProps<RecoverStackParamList, "AddDevice">;

/** Recover 03 - Add Device: search, category chips and expandable category rows (static brand list). */
export function AddDeviceScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const categories = useMemo(
    () =>
      DEVICE_CATEGORIES.filter((c) => filter === "all" || c.key === filter)
        .map((c) => ({
          ...c,
          devices: q ? c.devices.filter((d) => `${d.name} ${d.brand}`.toLowerCase().includes(q)) : c.devices,
        }))
        .filter((c) => c.devices.length > 0),
    [filter, q],
  );

  return (
    <RecoverShell centered title="Add Device" onBack={() => navigation.goBack()}>
      <SearchBar value={query} onChangeText={setQuery} placeholder="Search brands, devices…" />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {[{ key: "all", chip: "All" }, ...DEVICE_CATEGORIES].map((c) => {
          const on = filter === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => setFilter(c.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{
                backgroundColor: on ? colors.accent : colors.surfaceRaised,
                borderRadius: radius.pill,
                paddingHorizontal: spacing.md,
                paddingVertical: 7,
              }}
            >
              <Text style={{ color: on ? colors.textOnAccent : colors.textSecondary, ...typography.label }}>{c.chip}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ gap: spacing.sm }}>
        {categories.map((c) => {
          const expanded = open === c.key || q !== "";
          return (
            <View
              key={c.key}
              style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}
            >
              <Pressable
                onPress={() => setOpen(open === c.key ? null : c.key)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                style={{ flexDirection: "row", alignItems: "center", padding: spacing.md, gap: spacing.sm }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{c.title}</Text>
                  <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                    {c.devices.length} device{c.devices.length === 1 ? "" : "s"} · {c.devices.map((d) => d.name).join(", ")}
                  </Text>
                </View>
                <Icon name={expanded ? "chevron-down" : "chevron-right"} size={16} color={colors.textMuted} />
              </Pressable>
              {expanded ? (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                  {c.devices.map((d) => (
                    <Pressable
                      key={d.name}
                      onPress={() => navigation.navigate("DevicePairing", { provider: d.provider, kind: c.kind, name: d.name })}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${d.name}`}
                      style={{ flexDirection: "row", alignItems: "center", padding: spacing.md, gap: spacing.sm }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.textPrimary, ...typography.body, fontSize: 14 }}>{d.name}</Text>
                        <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>{d.brand}</Text>
                      </View>
                      <Icon name="plus" size={16} color={colors.accent} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
        {categories.length === 0 ? (
          <Text style={{ color: colors.textMuted, ...typography.meta }}>No devices match your search.</Text>
        ) : null}
      </View>
      <Text style={{ color: colors.textMuted, ...typography.meta }}>
        Don&apos;t see yours? Any device that writes to Apple Health or Health Connect can be added from the nearest category.
      </Text>
    </RecoverShell>
  );
}
