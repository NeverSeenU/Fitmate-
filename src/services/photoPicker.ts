import * as ImagePicker from 'expo-image-picker';
import { isSupportedImageMimeType, normalizeImageMimeType } from './mimeTypes';

export type PhotoPickerSource = 'camera' | 'library';

export type PickedPhoto = {
  imageUri: string;
  filename: string;
  mimeType: string;
};

export async function pickFoodPhoto(source: PhotoPickerSource): Promise<PickedPhoto | null> {
  const photos = await pickFoodPhotos(source, 1);
  return photos[0] ?? null;
}

export async function pickFoodPhotos(source: PhotoPickerSource, limit: number): Promise<PickedPhoto[]> {
  const permission = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync(false);

  if (!permission.granted) {
    throw new Error(source === 'camera' ? 'camera_permission_denied' : 'photo_library_permission_denied');
  }

  const boundedLimit = Math.max(1, Math.min(limit, 5));
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(pickerOptions)
    : await ImagePicker.launchImageLibraryAsync({
      ...pickerOptions,
      allowsMultipleSelection: boundedLimit > 1,
      selectionLimit: boundedLimit,
    });

  if (result.canceled || !result.assets[0]) {
    return [];
  }

  return result.assets.slice(0, boundedLimit).map((asset) => {
    const pickedName = asset.fileName ?? filenameFromUri(asset.uri);
    const mimeType = normalizeImageMimeType(asset.mimeType, pickedName, asset.uri);
    if (!isSupportedImageMimeType(mimeType)) {
      throw new Error('Unsupported photo format. Please try the original photo from the system camera or photo library.');
    }
    return {
      imageUri: asset.uri,
      filename: withImageExtension(pickedName, mimeType),
      mimeType,
    };
  });
}

const pickerOptions: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: false,
  quality: 0.85,
};

function filenameFromUri(uri: string) {
  const lastSegment = uri.split('/').pop();
  return lastSegment || `food-photo-${Date.now()}`;
}

function withImageExtension(filename: string, mimeType: string) {
  if (/\.(jpe?g|png|webp|heic|heif)$/i.test(filename)) {
    return filename;
  }
  const extension = mimeType === 'image/png'
    ? 'png'
    : mimeType === 'image/webp'
      ? 'webp'
      : mimeType === 'image/heic'
        ? 'heic'
        : mimeType === 'image/heif'
          ? 'heif'
          : 'jpg';
  return `${filename}.${extension}`;
}
