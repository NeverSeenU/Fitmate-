import * as ImagePicker from 'expo-image-picker';
import { isSupportedImageMimeType, normalizeImageMimeType } from './mimeTypes';

export type PhotoPickerSource = 'camera' | 'library';

export type PickedPhoto = {
  imageUri: string;
  filename: string;
  mimeType: string;
};

export async function pickFoodPhoto(source: PhotoPickerSource): Promise<PickedPhoto | null> {
  const permission = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync(false);

  if (!permission.granted) {
    throw new Error(source === 'camera' ? 'camera_permission_denied' : 'photo_library_permission_denied');
  }

  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(pickerOptions)
    : await ImagePicker.launchImageLibraryAsync(pickerOptions);

  if (result.canceled || !result.assets[0]) {
    return null;
  }

  const asset = result.assets[0];
  const pickedName = asset.fileName ?? filenameFromUri(asset.uri);
  const mimeType = normalizeImageMimeType(asset.mimeType, pickedName, asset.uri);
  if (!isSupportedImageMimeType(mimeType)) {
    throw new Error('当前照片格式暂不支持，请在 iPhone 相机设置中选择“兼容性最佳”，或先选择 JPEG/PNG 图片。');
  }
  return {
    imageUri: asset.uri,
    filename: withImageExtension(pickedName, mimeType),
    mimeType,
  };
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
  if (/\.(jpe?g|png|webp)$/i.test(filename)) {
    return filename;
  }
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  return `${filename}.${extension}`;
}
