/**
 * Profile photo (20 Oct 2026): the crop and resize applied to a picked photo
 * before upload. Pure, so tests/profilePhotoCrop.check.cjs can run it in plain
 * Node; lib/profilePhoto.ts applies it with expo-image-manipulator.
 */

/** Longest side of the uploaded photo, in pixels (the app shows it at 92 px at most). */
export const PROFILE_PHOTO_SIZE = 512;

export type PhotoCropAction =
  | { crop: { originX: number; originY: number; width: number; height: number } }
  | { resize: { width: number; height: number } };

/**
 * The centre square of a `width` x `height` image (the picker's square crop
 * isn't guaranteed on every Android phone), then shrunk to `size` when larger.
 * No actions for an image that is already a small enough square.
 */
export function squarePhotoActions(width: number, height: number, size = PROFILE_PHOTO_SIZE): PhotoCropAction[] {
  if (!(width > 0) || !(height > 0)) return [{ resize: { width: size, height: size } }];
  const side = Math.min(width, height);
  const actions: PhotoCropAction[] = [];
  if (width !== height) {
    actions.push({ crop: { originX: Math.floor((width - side) / 2), originY: Math.floor((height - side) / 2), width: side, height: side } });
  }
  if (side > size) actions.push({ resize: { width: size, height: size } });
  return actions;
}
