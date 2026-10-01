export const MAX_PROFILE_IMAGE_BYTES = 500_000;
export const MAX_PROFILE_IMAGE_BASE64 = 4 * Math.ceil(MAX_PROFILE_IMAGE_BYTES / 3);
// Two base64 images plus invoice fields, leaving room for the template snapshot in D1.
export const IMAGE_REQUEST_BYTES = 1_800_000;

export function base64ByteLength(value: string) {
  return (value.length * 3) / 4 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
}

export function imageSizeLabel(bytes: number) {
  return bytes === MAX_PROFILE_IMAGE_BYTES ? '0,5 MB' : `${bytes / 1000} kB`;
}
