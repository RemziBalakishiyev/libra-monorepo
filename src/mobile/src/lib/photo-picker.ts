import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import type { PickedPhoto } from '@/lib/api/food-analysis';

export type PhotoSource = 'camera' | 'library';

export type PickOutcome =
  | { kind: 'picked'; photo: PickedPhoto }
  | { kind: 'cancelled' }
  | { kind: 'denied'; source: PhotoSource; canAskAgain: boolean }
  | { kind: 'failed' };

/** The camera is only offered where there is one to open; the web falls back to choosing a file. */
export const cameraAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

const options: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: false,
  // Re-encoded on the server anyway; a smaller upload just gets there sooner.
  quality: 0.8,
  exif: false,
  allowsMultipleSelection: false,
};

/**
 * Picks one photo from the camera or the gallery. Permission denial is a named outcome rather than an
 * exception, so the screen can explain it and keep the manual form one tap away.
 */
export async function pickPhoto(source: PhotoSource): Promise<PickOutcome> {
  try {
    const permission = await requestPermission(source);
    if (permission && !permission.granted) {
      return { kind: 'denied', source, canAskAgain: permission.canAskAgain };
    }

    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.assets?.[0];
    // The browser never reports a cancellation, so "no asset" is the cancel signal everywhere.
    if (result.canceled || !asset) {
      return { kind: 'cancelled' };
    }

    return { kind: 'picked', photo: toPickedPhoto(asset) };
  } catch {
    return { kind: 'failed' };
  }
}

async function requestPermission(source: PhotoSource): Promise<ImagePicker.PermissionResponse | null> {
  if (Platform.OS === 'web') {
    // The browser's own file dialog is the permission prompt.
    return null;
  }
  return source === 'camera' ? ImagePicker.requestCameraPermissionsAsync() : ImagePicker.requestMediaLibraryPermissionsAsync();
}

function toPickedPhoto(asset: ImagePicker.ImagePickerAsset): PickedPhoto {
  const mimeType = asset.mimeType ?? 'image/jpeg';
  return {
    uri: asset.uri,
    // On the web the picker hands over the browser's own File, which FormData can send as-is.
    blob: asset.file ?? undefined,
    fileName: asset.fileName ?? `meal.${extensionOf(mimeType)}`,
    mimeType,
    width: asset.width,
    height: asset.height,
  };
}

function extensionOf(mimeType: string): string {
  if (mimeType.includes('png')) {
    return 'png';
  }
  return mimeType.includes('webp') ? 'webp' : 'jpg';
}
