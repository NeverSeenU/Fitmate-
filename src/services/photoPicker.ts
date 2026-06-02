import * as ImagePicker from 'expo-image-picker';
import { isSupportedImageMimeType, normalizeImageMimeType } from './mimeTypes';

export type PhotoPickerSource = 'camera' | 'library';

export type PickedPhoto = {
  imageUri: string;
  filename: string;
  mimeType: string;
  uploadUri?: string;
  uploadFilename?: string;
  uploadMimeType?: string;
  optimizedForUpload?: boolean;
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

  const pickedPhotos = await Promise.all(result.assets.slice(0, boundedLimit).map(async (asset) => {
    const pickedName = asset.fileName ?? filenameFromUri(asset.uri);
    const mimeType = normalizeImageMimeType(asset.mimeType, pickedName, asset.uri);
    if (!isSupportedImageMimeType(mimeType)) {
      throw new Error('Unsupported photo format. Please try the original photo from the system camera or photo library.');
    }
    const optimized = await optimizePhotoForUpload(asset.uri, mimeType, asset.width, asset.height);
    const filename = withImageExtension(pickedName, mimeType);
    return {
      imageUri: asset.uri,
      filename,
      mimeType,
      uploadUri: optimized.uri === asset.uri ? undefined : optimized.uri,
      uploadFilename: optimized.uri === asset.uri ? undefined : withImageExtension(filename, optimized.mimeType),
      uploadMimeType: optimized.uri === asset.uri ? undefined : optimized.mimeType,
      optimizedForUpload: optimized.uri !== asset.uri,
    };
  }));
  return pickedPhotos;
}

const pickerOptions: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: false,
  quality: 0.82,
};

const MAX_UPLOAD_IMAGE_SIDE = 1280;
const UPLOAD_JPEG_QUALITY = 0.82;

async function optimizePhotoForUpload(uri: string, mimeType: string, width?: number, height?: number): Promise<{ uri: string; mimeType: string }> {
  if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    return { uri, mimeType };
  }
  const resize = resizeActionForImage(width, height);
  try {
    const ImageManipulator = await import('expo-image-manipulator');
    const result = await ImageManipulator.manipulateAsync(
      uri,
      resize ? [{ resize }] : [],
      {
        compress: UPLOAD_JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );
    return { uri: result.uri, mimeType: 'image/jpeg' };
  } catch {
    return { uri, mimeType };
  }
}

function resizeActionForImage(width?: number, height?: number) {
  if (!width || !height || width <= 0 || height <= 0) {
    return { width: MAX_UPLOAD_IMAGE_SIDE };
  }
  const longestSide = Math.max(width, height);
  if (longestSide <= MAX_UPLOAD_IMAGE_SIDE) {
    return undefined;
  }
  if (width >= height) {
    return { width: MAX_UPLOAD_IMAGE_SIDE };
  }
  return { height: MAX_UPLOAD_IMAGE_SIDE };
}

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
