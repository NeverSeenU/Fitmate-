import * as DocumentPicker from 'expo-document-picker';
import { hasKnownMimeExtension, normalizeFileMimeType } from './mimeTypes';

export type PickedFile = {
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
};

const SUPPORTED_FILE_TYPES = [
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

export class UnsupportedFileTypeError extends Error {
  constructor(filename: string) {
    super(`暂不支持 ${filename}。请先选择 PDF、Word、Excel、CSV、TXT 或常见图片文件。`);
    this.name = 'UnsupportedFileTypeError';
  }
}

export async function pickFitMateFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: SUPPORTED_FILE_TYPES,
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const asset = result.assets[0];
  const name = asset.name || filenameFromUri(asset.uri);
  const mimeType = normalizeFileMimeType(asset.mimeType, name, SUPPORTED_FILE_TYPES);

  if (!isSupportedFile(name, mimeType)) {
    throw new UnsupportedFileTypeError(name);
  }

  return {
    uri: asset.uri,
    name,
    mimeType,
    sizeBytes: asset.size,
  };
}

export function formatFileSize(sizeBytes?: number) {
  if (!sizeBytes || sizeBytes <= 0) {
    return '大小未知';
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isSupportedFile(name: string, mimeType: string) {
  return SUPPORTED_FILE_TYPES.includes(mimeType) || hasKnownMimeExtension(name);
}

function filenameFromUri(uri: string) {
  const lastSegment = uri.split('/').pop();
  return lastSegment || 'selected-file';
}
