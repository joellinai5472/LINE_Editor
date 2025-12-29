
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { StickerItem, RemovalMode } from '../types';
import { removeBackground } from '../utils/imageUtils';

interface Props {
  item: StickerItem;
  onSave: (processedBlob: Blob, mode: RemovalMode, threshold: number) => void;
  onClose: () => void;
}

const StickerEditor: React.FC<Props> = ({ item, onSave, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  
  const [mode, setMode] = useState<RemovalMode>(item.settings.mode);
  const [threshold, setThreshold] = useState(item.settings.threshold);
  const [brushSize, setBrushSize] = useState(20);
  const [activeTool, setActiveTool] = useState<'eraser' | 'restore' | 'move'>('move');
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  // Initialize
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      originalImageRef.current = img;
      if (canvasRef.current) {
        canvasRef.current.width = img.width;
        canvasRef.current.height = img.height;
        applyAuto(img, mode, threshold);
      }
    };
    img.src = item.previewUrl;
  }, []);

  const pushHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory(prev => {
      const next = prev.slice(0, historyIdx + 1);
      if (next.length > 15) next.shift();
      return [...next, data];
    });
    setHistoryIdx(prev => Math.min(prev + 1, 14));
  }, [historyIdx]);

  const applyAuto = async (img: HTMLImageElement, m: RemovalMode, t: number) => {
    const blob = await removeBackground(img, m, t);
    const url = URL.createObjectURL(blob);
    const tempImg = new Image();
    tempImg.onload = () => {
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
        ctx.drawImage(tempImg, 0, 0);
        pushHistory();
      }
    };
    tempImg.src = url;
  };

  const handlePointerDown = (e: React.MouseEvent) => {
    if (activeTool === 'move' || e.button === 1 || e.altKey) {
      setIsPanning(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    } else {
      setIsDrawing(true);
      draw(e, true);
    }
  };

  const draw = (e: React.MouseEvent | MouseEvent, isStart = false) => {
    const canvas = canvasRef.current;
    if (!canvas || !isDrawing && !isStart) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    ctx.save();
    if (activeTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (activeTool === 'restore' && originalImageRef.current) {
      ctx.beginPath();
      ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(originalImageRef.current, 0, 0);
    }
    ctx.restore();
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (isPanning) {
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        setPan(p => ({ x: p.x + dx, y: p.y + dy }));
        lastMousePos.current = { x: e.clientX, y: e.clientY };
      } else if (isDrawing) {
        draw(e);
      }
    };
    const handleUp = () => {
      if (isDrawing) pushHistory();
      setIsDrawing(false);
      setIsPanning(false);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isPanning, isDrawing, activeTool, scale, brushSize, pushHistory]);

  const handleUndo = () => {
    if (historyIdx > 0) {
      const prevIdx = historyIdx - 1;
      const data = history[prevIdx];
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.putImageData(data, 0, 0);
        setHistoryIdx(prevIdx);
      }
    }
  };

  const handleSave = () => {
    canvasRef.current?.toBlob((blob) => {
      if (blob) onSave(blob, mode, threshold);
    }, 'image/png');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 bg-opacity-95 flex flex-col md:flex-row overflow-hidden">
      {/* Viewport */}
      <div 
        ref={viewportRef}
        className="flex-1 relative cursor-crosshair overflow-hidden checkerboard flex items-center justify-center"
        onMouseDown={handlePointerDown}
        onWheel={(e) => setScale(s => Math.max(0.1, Math.min(10, s + (e.deltaY < 0 ? 0.1 : -0.1))))}
      >
        <canvas 
          ref={canvasRef}
          style={{ 
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transition: isPanning ? 'none' : 'transform 0.1s ease-out'
          }}
          className="shadow-2xl max-w-none"
        />
        
        <div className="absolute top-4 left-4 bg-black/60 text-white px-3 py-1 rounded-full text-xs">
          縮放: {Math.round(scale * 100)}% | 空白鍵拖曳
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-full md:w-80 bg-white flex flex-col shadow-2xl z-10">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800">編輯貼圖</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <div className="flex-1 p-6 space-y-6 overflow-y-auto">
          {/* Auto Removal */}
          <section className="space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">自動去背</h4>
            <div className="grid grid-cols-3 gap-2">
              {(['white', 'black', 'none'] as RemovalMode[]).map(m => (
                <button 
                  key={m}
                  onClick={() => { setMode(m); if(originalImageRef.current) applyAuto(originalImageRef.current, m, threshold); }}
                  className={`py-2 text-xs rounded border transition-all ${mode === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}
                >
                  {m === 'white' ? '去白' : m === 'black' ? '去黑' : '不處理'}
                </button>
              ))}
            </div>
            {mode !== 'none' && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-slate-500">
                  <span>強度</span>
                  <span>{threshold}</span>
                </div>
                <input 
                  type="range" min="0" max="255" value={threshold}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setThreshold(val);
                    if(originalImageRef.current) applyAuto(originalImageRef.current, mode, val);
                  }}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
            )}
          </section>

          <hr className="border-slate-100" />

          {/* Manual Tools */}
          <section className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">手動修整</h4>
            <div className="grid grid-cols-3 gap-2">
              <button 
                onClick={() => setActiveTool('move')}
                className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all ${activeTool === 'move' ? 'bg-blue-50 border-blue-500 text-blue-600' : 'border-slate-100 text-slate-400'}`}
              >
                <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0V12m3.045-3.438a1.5 1.5 0 113 0V12m-3-3.144a1.5 1.5 0 113 0V12m-3-3.144a1.5 1.5 0 113 0V12m-9-5a1.5 1.5 0 00-1.5 1.5v3a4.499 4.499 0 00.733 2.455c.461.691 1.192 1.343 2.126 1.956.81.53 1.76.819 2.731.819h.39a3.5 3.5 0 003.5-3.5V10"></path></svg>
                <span className="text-[10px] font-bold">移動</span>
              </button>
              <button 
                onClick={() => setActiveTool('eraser')}
                className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all ${activeTool === 'eraser' ? 'bg-pink-50 border-pink-500 text-pink-600' : 'border-slate-100 text-slate-400'}`}
              >
                <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                <span className="text-[10px] font-bold">橡皮擦</span>
              </button>
              <button 
                onClick={() => setActiveTool('restore')}
                className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all ${activeTool === 'restore' ? 'bg-green-50 border-green-500 text-green-600' : 'border-slate-100 text-slate-400'}`}
              >
                <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                <span className="text-[10px] font-bold">還原</span>
              </button>
            </div>

            {activeTool !== 'move' && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-slate-500">
                  <span>筆刷大小</span>
                  <span>{brushSize}px</span>
                </div>
                <input 
                  type="range" min="1" max="100" value={brushSize}
                  onChange={(e) => setBrushSize(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
            )}

            <button 
              onClick={handleUndo}
              disabled={historyIdx <= 0}
              className="w-full py-2 flex items-center justify-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path></svg>
              上一步 (Undo)
            </button>
          </section>
        </div>

        <div className="p-4 bg-slate-50 border-t flex gap-2">
          <button 
            onClick={onClose}
            className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-100 transition-all"
          >
            取消
          </button>
          <button 
            onClick={handleSave}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all"
          >
            儲存
          </button>
        </div>
      </div>
    </div>
  );
};

export default StickerEditor;
