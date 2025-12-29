
import React, { useState } from 'react';
import { StickerItem, StickerPackConfig, RemovalMode } from './types';
import { removeBackground, resizeToLineSpec, cropImageGrid } from './utils/imageUtils';
import StickerEditor from './components/StickerEditor';
import JSZip from 'jszip';
import saveAs from 'file-saver';

const App: React.FC = () => {
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [config, setConfig] = useState<StickerPackConfig>({ count: 16, type: 'standard' });
  const [editingItem, setEditingItem] = useState<StickerItem | null>(null);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [gridConfig, setGridConfig] = useState({ rows: 4, cols: 4 });

  const suggestGrid = (count: number) => {
    switch (count) {
      case 8: setGridConfig({ rows: 2, cols: 4 }); break;
      case 16: setGridConfig({ rows: 4, cols: 4 }); break;
      case 24: setGridConfig({ rows: 4, cols: 6 }); break;
      case 32: setGridConfig({ rows: 4, cols: 8 }); break;
      case 40: setGridConfig({ rows: 5, cols: 8 }); break;
      default: break;
    }
  };

  const handleConfigChange = (newCount: 8 | 16 | 24 | 32 | 40) => {
    setConfig(prev => ({ ...prev, count: newCount }));
    suggestGrid(newCount);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files) as File[];
    const newFiles = files.map(file => createStickerItem(URL.createObjectURL(file), file));
    setStickers(prev => [...prev, ...newFiles]);
  };

  const handleGridUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    const img = new Image();
    img.onload = async () => {
      const blobs = await cropImageGrid(img, gridConfig.rows, gridConfig.cols);
      const newItems = blobs.map((blob, idx) => {
        const item = createStickerItem(URL.createObjectURL(blob), null, blob);
        if (stickers.length === 0 && idx === 0) {
          item.isMain = true;
          item.isTab = true;
        }
        return item;
      });
      setStickers(prev => [...prev, ...newItems]);
    };
    img.src = URL.createObjectURL(file);
    e.target.value = '';
  };

  const createStickerItem = (url: string, file: File | null = null, blob: Blob | null = null): StickerItem => ({
    id: Math.random().toString(36).substr(2, 9),
    originalFile: file,
    previewUrl: url,
    processedBlob: blob,
    processedUrl: blob ? url : null,
    status: blob ? 'done' : 'pending',
    settings: { mode: 'white' as RemovalMode, threshold: 240 }
  });

  const processOne = async (id: string) => {
    const item = stickers.find(s => s.id === id);
    if (!item) return;
    setStickers(prev => prev.map(s => s.id === id ? { ...s, status: 'processing' } : s));

    try {
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.src = item.previewUrl;
      });
      const blob = await removeBackground(img, item.settings.mode, item.settings.threshold);
      const url = URL.createObjectURL(blob);
      setStickers(prev => prev.map(s => s.id === id ? {
        ...s,
        status: 'done',
        processedBlob: blob,
        processedUrl: url
      } : s));
    } catch (err) {
      setStickers(prev => prev.map(s => s.id === id ? { ...s, status: 'error' } : s));
    }
  };

  const processAll = async () => {
    setIsProcessingAll(true);
    for (const s of stickers) {
      if (s.status !== 'done') await processOne(s.id);
    }
    setIsProcessingAll(false);
  };

  const setRole = (id: string, role: 'main' | 'tab') => {
    setStickers(prev => prev.map(s => {
      if (role === 'main') return { ...s, isMain: s.id === id };
      if (role === 'tab') return { ...s, isTab: s.id === id };
      return s;
    }));
  };

  const handleExport = async () => {
    const doneStickers = stickers.filter(s => s.status === 'done' && s.processedBlob);
    if (doneStickers.length === 0) return alert('請先處理圖片！');

    setIsExporting(true);
    setExportProgress(0);

    const mainItem = stickers.find(s => s.isMain) || doneStickers[0];
    const tabItem = stickers.find(s => s.isTab) || doneStickers[0];

    const zip = new JSZip();
    const folder = zip.folder("line_sticker_pack")!;

    const exportCount = Math.min(doneStickers.length, config.count);
    const targetW = config.type === 'fullscreen' ? 480 : 370;
    const targetH = config.type === 'fullscreen' ? 480 : 320;

    try {
      for (let i = 0; i < exportCount; i++) {
        const item = doneStickers[i];
        const filename = `${(i + 1).toString().padStart(2, '0')}.png`;
        const stickerBlob = await resizeToLineSpec(item.processedBlob!, targetW, targetH);
        folder.file(filename, stickerBlob);
        setExportProgress(Math.round(((i + 1) / (exportCount + 2)) * 100));
      }

      const mainSize = config.type === 'fullscreen' ? 480 : 240;
      const mainBlob = await resizeToLineSpec(mainItem.processedBlob!, mainSize, mainSize);
      folder.file("main.png", mainBlob);
      setExportProgress(Math.round(((exportCount + 1) / (exportCount + 2)) * 100));

      const tabBlob = await resizeToLineSpec(tabItem.processedBlob!, 96, 74);
      folder.file("tab.png", tabBlob);
      setExportProgress(100);

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `LINE_Stickers_${exportCount}.zip`);
    } catch (err) {
      alert('匯出時發生錯誤');
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-black text-slate-800 mb-2 tracking-tight">LINE 貼圖一站式工作坊</h1>
        <p className="text-slate-500 font-medium">AI 拼圖裁切 • 智慧去背 • 規格校對 • 批次導出</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">1</span>
              設定貼圖規格
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-2 uppercase tracking-widest">貼圖類型</label>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  {(['standard', 'fullscreen'] as const).map(t => (
                    <button key={t} onClick={() => setConfig(c => ({...c, type: t}))}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${config.type === t ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>
                      {t === 'standard' ? '標準' : '全螢幕'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-2 uppercase tracking-widest">目標張數</label>
                <div className="grid grid-cols-3 gap-1">
                  {[8, 16, 24, 32, 40].map(n => (
                    <button key={n} onClick={() => handleConfigChange(n as any)}
                      className={`py-2 text-xs font-bold rounded-lg border transition-all ${config.count === n ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-slate-600 border-slate-100 hover:border-blue-200'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className="bg-purple-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">2</span>
              AI 拼圖裁切
            </h2>
            <div className="space-y-4">
                <div className="flex gap-2">
                   <div className="flex-1">
                     <span className="text-[10px] text-slate-400 font-bold">列 (Rows)</span>
                     <input type="number" min="1" value={gridConfig.rows} onChange={e => setGridConfig(p => ({...p, rows: parseInt(e.target.value) || 1}))} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-purple-400 outline-none transition-all"/>
                   </div>
                   <div className="flex-1">
                     <span className="text-[10px] text-slate-400 font-bold">行 (Cols)</span>
                     <input type="number" min="1" value={gridConfig.cols} onChange={e => setGridConfig(p => ({...p, cols: parseInt(e.target.value) || 1}))} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-purple-400 outline-none transition-all"/>
                   </div>
                </div>
                <div className="bg-purple-50 rounded-xl p-3 border border-purple-100 text-center">
                  <p className="text-[11px] text-purple-700 font-bold">預計裁切出：<span className="text-lg">{gridConfig.rows * gridConfig.cols}</span> 張</p>
                </div>
                <label className="block cursor-pointer bg-purple-600 text-white py-4 rounded-2xl text-center font-bold text-sm hover:bg-purple-700 shadow-lg shadow-purple-100 transition-all active:scale-95">
                  <input type="file" className="hidden" accept="image/*" onChange={handleGridUpload} />
                  📸 上傳並自動裁切
                </label>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
             <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
               <span className="bg-green-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">3</span>
               打包導出
             </h2>
             {isExporting && (
               <div className="mb-4">
                 <div className="flex justify-between text-[10px] font-bold text-green-600 mb-1">
                   <span>正在打包規格圖片...</span>
                   <span>{exportProgress}%</span>
                 </div>
                 <div className="w-full bg-green-100 h-1.5 rounded-full overflow-hidden">
                   <div className="bg-green-600 h-full transition-all duration-300" style={{ width: `${exportProgress}%` }} />
                 </div>
               </div>
             )}
             <button onClick={handleExport} disabled={isExporting || stickers.filter(s => s.status === 'done').length === 0}
               className="w-full py-4 bg-green-600 text-white rounded-2xl font-bold shadow-xl shadow-green-100 hover:bg-green-700 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-30 disabled:shadow-none">
               {isExporting ? '處理中...' : '打包下載 ZIP'}
             </button>
          </div>
        </aside>

        <main className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 min-h-[600px]">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
               <div>
                 <h2 className="text-2xl font-black text-slate-800 tracking-tight">貼圖素材清單</h2>
                 <p className="text-xs text-slate-400 font-medium">已準備 {stickers.length} 張，導出時將抓取前 {config.count} 張</p>
               </div>
               <div className="flex gap-2 w-full md:w-auto">
                  <label className="flex-1 md:flex-none cursor-pointer bg-slate-100 text-slate-600 px-5 py-2.5 rounded-2xl text-xs font-bold hover:bg-slate-200 transition-colors text-center">
                    增加素材
                    <input type="file" multiple className="hidden" accept="image/*" onChange={handleFileUpload} />
                  </label>
                  <button onClick={processAll} disabled={isProcessingAll || stickers.length === 0}
                    className="flex-1 md:flex-none bg-blue-600 text-white px-5 py-2.5 rounded-2xl text-xs font-bold hover:bg-blue-700 disabled:opacity-30 transition-all shadow-lg shadow-blue-100">
                    {isProcessingAll ? '處理中...' : '一鍵去背'}
                  </button>
               </div>
            </div>

            {stickers.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                {stickers.map((s, idx) => (
                  <div key={s.id} className={`group relative bg-white rounded-3xl overflow-hidden shadow-sm border transition-all duration-300 ${s.isMain ? 'ring-4 ring-yellow-400 border-yellow-400' : s.isTab ? 'ring-4 ring-purple-400 border-purple-400' : 'border-slate-100 hover:border-blue-300'}`}>
                    <div className="aspect-square checkerboard relative p-2 flex items-center justify-center">
                      <img src={s.processedUrl || s.previewUrl} className="max-w-full max-h-full object-contain drop-shadow-sm" />
                      <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black shadow-sm ${idx < config.count ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-500'}`}>
                          #{idx + 1}
                        </span>
                        {s.isMain && <span className="bg-yellow-400 text-yellow-900 text-[10px] px-2 py-0.5 rounded-full font-black shadow-sm">MAIN</span>}
                        {s.isTab && <span className="bg-purple-400 text-white text-[10px] px-2 py-0.5 rounded-full font-black shadow-sm">TAB</span>}
                      </div>
                      <div className="absolute inset-0 bg-slate-900/80 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-2 p-4">
                        <button onClick={() => setEditingItem(s)} className="w-full py-2 bg-white text-slate-800 text-xs font-bold rounded-xl hover:scale-105 transition-transform">去背微調</button>
                        <div className="grid grid-cols-2 gap-1 w-full">
                          <button onClick={() => setRole(s.id, 'main')} className="py-2 bg-yellow-400 text-yellow-900 text-[10px] font-black rounded-xl hover:bg-yellow-300 transition-colors">主要</button>
                          <button onClick={() => setRole(s.id, 'tab')} className="py-2 bg-purple-500 text-white text-[10px] font-black rounded-xl hover:bg-purple-400 transition-colors">標籤</button>
                        </div>
                        <button onClick={() => setStickers(prev => prev.filter(it => it.id !== s.id))} className="w-full py-1 text-red-400 text-[10px] font-bold">移除</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/50">
                <p className="text-slate-400 font-bold">請上傳或裁切 AI 素材圖片</p>
              </div>
            )}
          </div>
        </main>
      </div>

      {editingItem && (
        <StickerEditor item={editingItem} onClose={() => setEditingItem(null)}
          onSave={(blob, mode, threshold) => {
            const url = URL.createObjectURL(blob);
            setStickers(prev => prev.map(s => s.id === editingItem.id ? {
              ...s, processedBlob: blob, processedUrl: url, status: 'done' as const, settings: { mode, threshold }
            } : s));
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
};

export default App;
