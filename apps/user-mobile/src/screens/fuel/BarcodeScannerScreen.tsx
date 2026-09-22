import React, { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { lookupBarcode } from "../../api/nutrition";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { FuelStackParamList } from "../../navigation/FuelStack";

type Props = NativeStackScreenProps<FuelStackParamList, "BarcodeScanner">;

/**
 * Barcode Scanner (R2 Wave, 22 Sep 2026) — docs/mobile/03-screen-inventory.md
 * §D's "search with a barcode-scan shortcut" (previously not built — see
 * FuelStack.tsx's own prior comment: "camera... gaps this pass doesn't
 * have"). Uses `expo-camera`'s real, built-in barcode-scanning API
 * (`CameraView`'s `onBarcodeScanned`) — no second camera library, since
 * this is the first screen in this app that needs a live viewfinder rather
 * than a single photo capture (Progress Photos/food estimates both use
 * `expo-image-picker`'s one-shot camera launch, which has no scanning
 * capability at all).
 *
 * On a successful decode this looks the code up via the real backend proxy
 * (api/nutrition.ts's lookupBarcode -> GET /nutrition/barcode/:code ->
 * lib/openFoodFactsClient.ts's real Open Food Facts call) and, if found,
 * navigates straight back to Log Meal with the result as a `barcodePrefill`
 * param — Log Meal's own manual-entry card picks that up and pre-fills
 * itself, so the user still reviews/edits and submits through the exact
 * same POST /meal-logs this app already had. A genuinely not-found barcode
 * (OFF doesn't have every product) is an honest dead end here, not a
 * fabricated result — the user is offered manual entry instead, same as
 * the AI-estimate card's own "insufficient context" fallback.
 */
export function BarcodeScannerScreen({ route, navigation }: Props) {
  const { mealType } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const [isLooking, setIsLooking] = useState(false);
  const [handled, setHandled] = useState(false);

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
            { text: "Scan again", onPress: () => setHandled(false) },
            { text: "Log manually", onPress: () => navigation.navigate("LogMeal", { mealType }) },
          ],
        );
        return;
      }
      navigation.navigate("LogMeal", {
        mealType,
        barcodePrefill: {
          name: lookup.product.name,
          brand: lookup.product.brand,
          servingSize: lookup.product.servingSize,
          basis: lookup.product.basis,
          calories: lookup.product.calories,
          proteinG: lookup.product.proteinG,
          carbsG: lookup.product.carbsG,
          fatG: lookup.product.fatG,
        },
      });
    } catch (err) {
      Alert.alert(
        "Couldn't look up this barcode",
        extractErrorMessage(err, "Check your connection and try again, or log this meal manually instead."),
        [
          { text: "Scan again", onPress: () => setHandled(false) },
          { text: "Log manually", onPress: () => navigation.navigate("LogMeal", { mealType }) },
        ],
      );
    } finally {
      setIsLooking(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>
          {permission.canAskAgain
            ? "Allow camera access to scan a product's barcode."
            : "Enable camera access for this app in your device Settings to scan a barcode."}
        </Text>
        {permission.canAskAgain ? (
          <Button label="Allow Camera" onPress={requestPermission} style={{ marginTop: spacing.lg }} />
        ) : null}
        <Button
          label="Log manually instead"
          variant="secondary"
          onPress={() => navigation.navigate("LogMeal", { mealType })}
          style={{ marginTop: spacing.sm }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
        onBarcodeScanned={handled ? undefined : onScanned}
      />
      <View style={styles.overlay}>
        <View style={styles.frame} />
        <Text style={styles.hint}>
          {isLooking ? "Looking up product..." : "Point your camera at a barcode"}
        </Text>
        {isLooking ? <ActivityIndicator color={colors.textOnAccent} style={{ marginTop: spacing.sm }} /> : null}
      </View>
      <View style={styles.footer}>
        <Button label="Cancel" variant="secondary" onPress={() => navigation.goBack()} />
      </View>
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
  permissionTitle: { ...typography.h2, color: colors.textPrimary, textAlign: "center" },
  permissionBody: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    width: "75%",
    aspectRatio: 1.6,
    borderRadius: radius.md,
    borderWidth: 3,
    borderColor: colors.accent,
  },
  hint: {
    ...typography.body,
    color: "#fff",
    marginTop: spacing.lg,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  footer: {
    position: "absolute",
    bottom: spacing.xl,
    left: spacing.lg,
    right: spacing.lg,
  },
});
