import * as ImagePicker from 'expo-image-picker';

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
  const filename = asset.fileName ?? filenameFromUri(asset.uri);
  const mimeType = normalizeImageMimeType(asset.mimeType ?? mimeTypeFromUri(asset.uri), filename);
  if (!isSupportedImageMimeType(mimeType)) {
    throw new Error('当前照片格式暂不支持，请在 iPhone 相机设置中选择“兼容性最佳”，或先选择 JPEG/PNG 图片。');
  }
  return {
    imageUri: asset.uri,
    filename,
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
  return lastSegment?.includes('.') ? lastSegment : `food-photo-${Date.now()}.jpg`;
}

function mimeTypeFromUri(uri: string) {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) {
    return 'image/png';
  }
  if (lower.endsWith('.webp')) {
    return 'image/webp';
  }
  return 'image/jpeg';
}

function normalizeImageMimeType(mimeType: string, filename: string) {
  const lowerName = filename.toLowerCase();
  const lowerType = mimeType.toLowerCase();
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (lowerName.endsWith('.png')) {
    return 'image/png';
  }
  if (lowerName.endsWith('.webp')) {
    return 'image/webp';
  }
  return lowerType;
}

function isSupportedImageMimeType(mimeType: string) {
  return mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp';
}
