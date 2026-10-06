import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";
import { useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BarcodeProduct } from "@fitness-ai-app/types";
import { CameraPermissionDenied } from "../../components/CameraPermissionDenied";
import { Icon } from "../../components/Icon";
import { lookupBarcode, logMeal } from "../../api/nutrition";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { FuelStackParamList } from "../../navigation/FuelStack";

type Props = NativeStackScreenProps<FuelStackParamList, "BarcodeScanner">;

/**
 * Barcode Scanner (Figma Fuel 03). Full camera view with a corner-bracket scan
 * frame and a torch toggle in the header. Uses `expo-camera`'s built-in
 * barcode scanning. After a decode the code is looked up via the backend proxy
 * (GET /nutrition/barcode/:code -> Open Food Facts) and the result appears in
 * a bottom sheet: name, brand/serving, Calories/Protein/Carbs/Fat tiles and
 * "Add to Meal" (logs it straight away); "Edit details" opens Log Meal
 * pre-filled instead. The lookup response carries no verification flag, so
 * unlike the Figma there is no "Verified" tag — the sheet says where the data
 * is from ("Open Food Facts") and whether it is per serving or per 100 g.
 * A barcode the database doesn't know is an honest dead end offering manual
 * logging. Camera not granted -> CameraPermissionDenied (Fuel 10).
 */
export function BarcodeScannerScreen({ route, navigation }: Props) {
  const { mealType } = route.params;
  const queryClient = useQueryClient();
  const { colors: theme } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [isLooking, setIsLooking] = useState(false);
  const [handled, setHandled] = useState(false);
  const [torch, setTorch] = useState(false);
  const [product, setProduct] = useState<BarcodeProduct | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const scanAgain = () => {
    setProduct(null);
    setHandled(false);
  };

  const onScanned = async (result: BarcodeScanningResult) => {
    if (handled || isLooking) return;
    setHandled(true);
    setIsLooking(true);
    try {
      const lookup = await lookupBarcode(result.data);
      if (!lookup.found) {
        Alert.alert(
          "Product not found",
          "Open Food Facts doesn't have this barcode yet — try again, or log this meal manually instead.",
          [
            { text: "Scan again", onPress: scanAgain },
            { text: "Log manually", onPress: () => navigation.navigate("LogMeal", { mealType }) },
          ],
        );
        return;
      }
      setProduct(lookup.product);
    } catch (err) {
      Alert.alert(
        "Couldn't look up this barcode",
        extractErrorMessage(err, "Check your connection and try again, or log this meal manually instead."),
        [
          { text: "Scan again", onPress: scanAgain },
          { text: "Log manually", onPress: () => navigation.navigate("LogMeal", { mealType }) },
        ],
      );
    } finally {
      setIsLooking(false);
    }
  };

  const productName = (p: BarcodeProduct) => (p.brand ? `${p.name} (${p.brand})` : p.name);

  const onAddToMeal = async () => {
    if (!product || isAdding) return;
    setIsAdding(true);
    try {
      await logMeal({
        mealType,
        name: productName(product),
        calories: Math.round(product.calories),
        proteinG: Math.round(product.proteinG),
        carbsG: Math.round(product.carbsG),
        fatG: Math.round(product.fatG),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mealLogs", "today"] }),
        queryClient.invalidateQueries({ queryKey: ["recentFoods"] }),
      ]);
      navigation.navigate("FuelDashboard");
    } catch (err) {
      Alert.alert("Couldn't add this food", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsAdding(false);
    }
  };

  const onEditDetails = () => {
    if (!product) return;
    navigation.navigate("LogMeal", {
      mealType,
      barcodePrefill: {
        name: product.name,
        brand: product.brand,
        servingSize: product.servingSize,
        basis: product.basis,
        calories: product.calories,
        proteinG: product.proteinG,
        carbsG: product.carbsG,
        fatG: product.fatG,
      },
    });
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    // Fuel 10 — camera not granted. Only offer the in-app prompt while the OS will still show it.
    return (
      <CameraPermissionDenied
        variant="barcode"
        onRequestPermission={permission.canAskAgain ? requestPermission : undefined}
        onManual={() => navigation.navigate("LogMeal", { mealType })}
        onBack={() => navigation.goBack()}
      />
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
        onBarcodeScanned={handled ? undefined : onScanned}
      />

      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} style={styles.headerBtn}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Text accessibilityRole="header" style={styles.headerTitle}>
          Barcode Scanner
        </Text>
        <Pressable
          onPress={() => setTorch((t) => !t)}
          accessibilityRole="button"
          accessibilityLabel={torch ? "Turn torch off" : "Turn torch on"}
          accessibilityState={{ selected: torch }}
          hitSlop={10}
          style={styles.headerBtn}
        >
          <Icon name="flashlight" size={22} color={torch ? colors.warning : "#fff"} />
        </Pressable>
      </SafeAreaView>

      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame}>
          <View style={[styles.corner, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 }]} />
          <View style={[styles.corner, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 }]} />
          <View style={[styles.corner, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 }]} />
          <View style={[styles.corner, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 }]} />
          <View style={styles.scanLine} />
        </View>
        {!product ? (
          <Text style={styles.hint}>{isLooking ? "Looking up product..." : "Point your camera at a barcode"}</Text>
        ) : null}
        {isLooking ? <ActivityIndicator color="#fff" style={{ marginTop: spacing.sm }} /> : null}
      </View>

      {product ? (
        <SafeAreaView edges={["bottom"]} style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, ...typography.h2, fontSize: 18 }}>{product.name}</Text>
              <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>
                {[product.brand, product.servingSize ? `1 serving (${product.servingSize})` : null].filter(Boolean).join(" • ") ||
                  "Brand and serving not listed"}
              </Text>
            </View>
            <View style={{ backgroundColor: colors.surfaceHigh, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: colors.textSecondary, ...typography.caption }}>Open Food Facts</Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MacroTile label="Calories" value={`${Math.round(product.calories)} kcal`} color={colors.textPrimary} />
            <MacroTile label="Protein" value={`${Math.round(product.proteinG)}g`} color={colors.success} />
            <MacroTile label="Carbs" value={`${Math.round(product.carbsG)}g`} color={theme.accent} />
            <MacroTile label="Fat" value={`${Math.round(product.fatG)}g`} color={colors.warning} />
          </View>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>
            Values are {product.basis === "serving" ? "per serving" : "per 100 g"}, as listed in the community database — check them against the label.
          </Text>

          <Pressable
            onPress={onAddToMeal}
            disabled={isAdding}
            accessibilityRole="button"
            accessibilityLabel="Add to Meal"
            style={{
              height: 52,
              borderRadius: radius.md,
              backgroundColor: theme.accent,
              alignItems: "center",
              justifyContent: "center",
              opacity: isAdding ? 0.6 : 1,
            }}
          >
            <Text style={{ color: theme.textOnAccent, ...typography.h3 }}>{isAdding ? "Adding…" : "Add to Meal"}</Text>
          </Pressable>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Pressable onPress={onEditDetails} accessibilityRole="button" accessibilityLabel="Edit details" hitSlop={8}>
              <Text style={{ color: theme.accent, ...typography.label }}>Edit details</Text>
            </Pressable>
            <Pressable onPress={scanAgain} accessibilityRole="button" accessibilityLabel="Scan again" hitSlop={8}>
              <Text style={{ color: colors.textSecondary, ...typography.label }}>Scan again</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

function MacroTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surfaceRaised,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.sm,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.sm,
      }}
    >
      <Text style={{ color: colors.textMuted, ...typography.caption }}>{label}</Text>
      <Text style={{ color, fontSize: 14, fontFamily: fonts.displayBold, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", ...typography.h3, fontSize: 16 },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  frame: { width: "78%", aspectRatio: 1.7 },
  corner: { position: "absolute", width: 28, height: 28, borderColor: "#fff" },
  scanLine: { position: "absolute", left: 12, right: 12, top: "50%", height: 2, backgroundColor: colors.accent, opacity: 0.9 },
  hint: {
    ...typography.body,
    color: "#fff",
    marginTop: spacing.lg,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong },
});
