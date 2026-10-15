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
      const bitmap = await createImageBitmap(await res.blob());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
      bitmap.close();
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!png) throw new Error("PNG encoding failed");
      await window.crokit.clipboard.writeImage(await png.arrayBuffer());
      return i;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
