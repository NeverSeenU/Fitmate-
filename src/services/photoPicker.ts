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
  return {
    imageUri: asset.uri,
    filename: asset.fileName ?? filenameFromUri(asset.uri),
    mimeType: asset.mimeType ?? mimeTypeFromUri(asset.uri),
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
