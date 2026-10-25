import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { showAlert } from "./dialogs";

/** The API accepts up to 1,400,000 characters (about 1 MB of image); a 512 px JPEG is far below it. */
const SIZE = 512;

/**
 * Picks a profile photo (25 Oct 2026) and returns it as a square JPEG or PNG data URI, or null when
 * cancelled or refused. The coach app ships as a web app, where the picker can't crop, so on web the
 * photo is cropped to the centre square and shrunk to 512 px in a canvas. On a phone the picker crops
 * it square and compresses it.
 */
export async function pickProfilePhoto(fromCamera: boolean): Promise<string | null> {
  if (Platform.OS !== "web") {
    const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      showAlert(
        fromCamera ? "Camera access needed" : "Photo library access needed",
        "Enable access in your device Settings to add a profile photo.",
      );
      return null;
    }
  }
  const options: ImagePicker.ImagePickerOptions = { allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: Platform.OS !== "web" };
  const result = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  if (Platform.OS === "web") return squareJpegOnWeb(asset.uri);
  if (!asset.base64) return null;
  const type = asset.mimeType === "image/png" ? "png" : "jpeg";
  return `data:image/${type};base64,${asset.base64}`;
}

function squareJpegOnWeb(uri: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx || side === 0) return resolve(null);
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(null);
    img.src = uri;
  });
}
