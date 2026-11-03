/**
 * Put an image on the system clipboard. Tries each URL in order (e.g. the
 * original, then the saved thumbnail) and returns the index of the one used.
 *
 * Decoding happens here so any format the renderer can display (webp, gif,
 * bmp...) works; the main process only receives a PNG, since the sandboxed
 * preload can't reach Electron's clipboard itself.
 */
export async function copyImageToClipboard(urls: string[]): Promise<number> {
  let lastError: unknown = new Error("no image source");
  for (let i = 0; i < urls.length; i++) {
    try {
      const res = await fetch(urls[i]);
      if (!res.ok) throw new Error(`${res.status} ${urls[i]}`);
      const blob = await res.blob();
      // Use the same decoder as the image viewer, including formats that
      // createImageBitmap may reject in the installed Chromium version.
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      try {
        image.src = objectUrl;
        await image.decode();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("이미지 변환용 캔버스를 만들 수 없습니다");
      context.drawImage(image, 0, 0);
      const png = canvas.toDataURL("image/png");
      if (!png.startsWith("data:image/png;base64,")) throw new Error("PNG 변환에 실패했습니다");
      // Strings retain their type across both contextBridge and IPC.
      await window.crokit.clipboard.writeImage(png);
      return i;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
