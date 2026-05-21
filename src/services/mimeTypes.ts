const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const EXTENSION_MIME_TYPES: Record<string, string> = {
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  pdf: 'application/pdf',
  png: 'image/png',
  txt: 'text/plain',
  webp: 'image/webp',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function normalizeImageMimeType(mimeType: string | null | undefined, filename: string, uri = '') {
  const lowerType = mimeType?.toLowerCase();
  if (lowerType === 'image/jpg') {
    return 'image/jpeg';
  }
  if (lowerType?.startsWith('image/')) {
    return lowerType;
  }
  const lowerName = filename.toLowerCase();
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (lowerName.endsWith('.png')) {
    return 'image/png';
  }
  if (lowerName.endsWith('.webp')) {
    return 'image/webp';
  }
  return imageMimeTypeFromUri(uri);
}

export function normalizeFileMimeType(mimeType: string | null | undefined, name: string, supportedTypes: readonly string[]) {
  const extensionType = mimeTypeFromName(name);
  const lowerType = mimeType?.toLowerCase();
  if (lowerType === 'image/jpg') {
    return 'image/jpeg';
  }
  if (!lowerType || lowerType === 'application/octet-stream') {
    return extensionType;
  }
  return supportedTypes.includes(lowerType) ? lowerType : extensionType;
}

export function isSupportedImageMimeType(mimeType: string) {
  return SUPPORTED_IMAGE_TYPES.includes(mimeType);
}

export function mimeTypeFromName(name: string) {
  return EXTENSION_MIME_TYPES[fileExtension(name)] ?? 'application/octet-stream';
}

export function hasKnownMimeExtension(name: string) {
  return Boolean(EXTENSION_MIME_TYPES[fileExtension(name)]);
}

function imageMimeTypeFromUri(uri: string) {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) {
    return 'image/png';
  }
  if (lower.endsWith('.webp')) {
    return 'image/webp';
  }
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (lower.endsWith('.heic')) {
    return 'image/heic';
  }
  if (lower.endsWith('.heif')) {
    return 'image/heif';
  }
  return 'application/octet-stream';
}

function fileExtension(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}
