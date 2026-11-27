// Lightweight in-browser OCR for supplier bills. No key, no server work.
// Tesseract.js is imported only when a scan starts; its LSTM-only engine and the compact
// English model (a few MB) are fetched from the jsDelivr CDN on first use, then cached.

const MAX_SIDE = 1600; // px. Bills stay readable; big phone photos get much faster.

/** Downscale and grey the photo: smaller input = faster, steadier OCR on cheap phones. */
export async function prepareImage(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.filter = "grayscale(1) contrast(1.35)";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/** Read the text on a bill photo. `onProgress` gets 0..1. */
export async function readBill(file: Blob, onProgress?: (p: number) => void): Promise<string> {
  const [{ createWorker, OEM }, image] = await Promise.all([import("tesseract.js"), prepareImage(file)]);
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    logger: (m) => {
      if (m.status === "recognizing text") onProgress?.(0.3 + m.progress * 0.7);
      else if (typeof m.progress === "number") onProgress?.(Math.min(0.3, m.progress * 0.3));
    },
  });
  try {
    const { data } = await worker.recognize(image);
    onProgress?.(1);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
