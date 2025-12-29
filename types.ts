
export type RemovalMode = 'white' | 'black' | 'none';

export interface StickerItem {
  id: string;
  originalFile: File | null; // 可能是從大圖裁切來的，所以沒有原始 File
  previewUrl: string;
  processedBlob: Blob | null;
  processedUrl: string | null;
  status: 'pending' | 'processing' | 'done' | 'error';
  isMain?: boolean;
  isTab?: boolean;
  settings: {
    mode: RemovalMode;
    threshold: number;
  };
}

export type StickerSetType = 'standard' | 'fullscreen';

export interface StickerPackConfig {
  count: 8 | 16 | 24 | 32 | 40;
  type: StickerSetType;
}
