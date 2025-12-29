
import { RemovalMode } from '../types';

/**
 * 將大圖依照網格裁切
 */
export async function cropImageGrid(
  image: HTMLImageElement,
  rows: number,
  cols: number
): Promise<Blob[]> {
  const cellWidth = image.width / cols;
  const cellHeight = image.height / rows;
  const blobs: Blob[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const canvas = document.createElement('canvas');
      canvas.width = cellWidth;
      canvas.height = cellHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      ctx.drawImage(
        image,
        c * cellWidth, r * cellHeight, cellWidth, cellHeight, // 來源
        0, 0, cellWidth, cellHeight // 目標
      );

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/png');
      });
      blobs.push(blob);
    }
  }
  return blobs;
}

/**
 * 執行閾值去背
 */
export async function removeBackground(
  image: HTMLImageElement,
  mode: RemovalMode,
  threshold: number
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get canvas context');

  ctx.drawImage(image, 0, 0);
  
  if (mode !== 'none') {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i+1], b = data[i+2];
      let shouldBeTransparent = false;
      if (mode === 'white') {
        if (r > threshold && g > threshold && b > threshold) shouldBeTransparent = true;
      } else if (mode === 'black') {
        if (r < threshold && g < threshold && b < threshold) shouldBeTransparent = true;
      }
      if (shouldBeTransparent) data[i+3] = 0;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png');
  });
}

/**
 * 調整大小以符合 LINE 規範
 */
export async function resizeToLineSpec(
  blob: Blob,
  targetWidth: number,
  targetHeight: number,
  padding: number = 10
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('Context error');

      const usableW = targetWidth - padding * 2;
      const usableH = targetHeight - padding * 2;
      const scale = Math.min(usableW / img.width, usableH / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const x = (targetWidth - drawW) / 2;
      const y = (targetHeight - drawH) / 2;

      ctx.clearRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(img, x, y, drawW, drawH);
      
      canvas.toBlob((b) => resolve(b!), 'image/png');
    };
    img.src = URL.createObjectURL(blob);
  });
}
