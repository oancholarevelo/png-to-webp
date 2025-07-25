"use client";

import { useState, useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, Download, Settings, RefreshCw, X, Zap, Archive, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import JSZip from 'jszip';

// --- In-Memory File Cache (outside of React state) ---
const fileCache = new Map();

// --- Helper: Web Worker for Conversions ---
const converterWorkerCode = `
  const convertWithFileReader = (file, quality) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new self.Image(); 
        img.onload = () => {
          try {
            const canvas = new OffscreenCanvas(img.width, img.height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.convertToBlob({ type: 'image/webp', quality: quality / 100 })
              .then(resolve)
              .catch(reject);
          } catch (e) {
            reject(e);
          }
        };
        img.onerror = () => reject(new Error('Image could not be loaded. It might be corrupted.'));
        img.src = event.target.result;
      };
      reader.onerror = () => reject(new Error('FileReader failed to read the file.'));
      reader.readAsDataURL(file);
    });
  };

  self.onmessage = async (e) => {
    const { id, file, quality } = e.data;
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality: quality / 100 });
      self.postMessage({ id, status: 'done', blob });
    } catch (error) {
      console.warn(\`Fast conversion failed for \${file.name}, trying fallback...\`, error);
      try {
        const blob = await convertWithFileReader(file, quality);
        self.postMessage({ id, status: 'done', blob });
      } catch (fallbackError) {
        self.postMessage({ id, status: 'error', error: fallbackError.message });
      }
    }
  };
`;

// --- Component: ImageRow for Lazy Loading ---
const ImageRow = ({ image, onRemove, onRetry }) => {
  const [previewUrl, setPreviewUrl] = useState(null);
  const placeholderRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          const file = fileCache.get(image.id);
          if (file && !previewUrl) {
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
          }
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px 300px 0px' }
    );

    if (placeholderRef.current) {
      observer.observe(placeholderRef.current);
    }

    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      if (placeholderRef.current) {
        observer.unobserve(placeholderRef.current);
      }
    };
  }, [image.id, previewUrl]);

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const statusIndicator = {
    pending: <span className="flex items-center text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full"><Clock size={12} className="mr-1.5"/>Queued</span>,
    converting: <span className="flex items-center text-xs font-medium text-indigo-600 bg-indigo-100 px-2 py-1 rounded-full"><RefreshCw size={12} className="mr-1.5 animate-spin"/>Converting</span>,
    done: <span className="flex items-center text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded-full"><CheckCircle2 size={12} className="mr-1.5"/>Done</span>,
    error: <span className="flex items-center text-xs font-medium text-red-600 bg-red-100 px-2 py-1 rounded-full" title={image.errorMessage}><AlertTriangle size={12} className="mr-1.5"/>Error</span>,
  }
  
  return (
    <div ref={placeholderRef} className="bg-white/80 p-3 rounded-xl flex flex-col md:flex-row items-center gap-4 shadow-sm border border-slate-200/80 min-h-[100px] animate-fade-in">
      <div className="w-16 h-16 flex-shrink-0 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden">
          {previewUrl ? <img src={previewUrl} alt={image.originalName} className="max-w-full max-h-full object-contain"/> : <ImageIcon className="text-slate-300" size={32}/>}
      </div>
      <div className="flex-grow text-center md:text-left">
          <p className="font-semibold text-slate-800 truncate text-sm" title={image.originalName}>{image.originalName}</p>
          <div className="flex items-center justify-center md:justify-start gap-3 mt-1 text-xs text-slate-500">
            <span>{formatSize(image.originalSize)}</span>
            {image.status === 'done' && image.convertedSize > 0 && (
              <>
                <span>&rarr;</span>
                <span className="font-medium">{formatSize(image.convertedSize)}</span>
                <span className={`font-bold ${image.convertedSize < image.originalSize ? 'text-green-600' : 'text-red-600'}`}>
                  ({(((image.originalSize - image.convertedSize) / image.originalSize) * 100).toFixed(0)}% change)
                </span>
              </>
            )}
          </div>
      </div>
      <div className="flex-shrink-0 w-28 flex justify-center">
        {statusIndicator[image.status]}
      </div>
       <div className="flex-shrink-0 w-32">
          {image.status === 'done' && (
              <a href={image.convertedUrl} download={`${image.originalName}.webp`} className="bg-green-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center text-sm shadow-sm hover:shadow-md">
                  <Download className="mr-2 h-4 w-4" /> Download
              </a>
          )}
          {image.status === 'error' && (
              <button onClick={() => onRetry(image.id)} className="bg-amber-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-amber-600 transition-colors flex items-center justify-center text-sm shadow-sm hover:shadow-md">
                  <RefreshCw className="mr-2 h-4 w-4" /> Retry
              </button>
          )}
       </div>
       <button onClick={() => onRemove(image.id)} className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-100">
          <X size={18}/>
       </button>
    </div>
  );
};


// --- Main App Component ---
export default function ConvertThatImagePage() {
  const [imageList, setImageList] = useState([]);
  const [quality, setQuality] = useState(80);
  const [isConverting, setIsConverting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [error, setError] = useState('');
  
  const fileInputRef = useRef(null);
  const workersRef = useRef([]);
  const conversionQueueRef = useRef([]);
  const busyWorkersRef = useRef(new Set());

  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      body { background-color: #f1f5f9; background-image: radial-gradient(circle at top left, #e0e7ff, transparent 40%), radial-gradient(circle at bottom right, #e0f2fe, transparent 50%); }
      @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
    `;
    document.head.appendChild(style);

    const numWorkers = navigator.hardwareConcurrency || 4;
    const workerBlob = new Blob([converterWorkerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(workerBlob);
    
    for (let i = 0; i < numWorkers; i++) {
        const worker = new Worker(workerUrl);
        worker.onmessage = (e) => handleWorkerMessage(e, i);
        workersRef.current.push(worker);
    }

    return () => {
        workersRef.current.forEach(worker => worker.terminate());
        URL.revokeObjectURL(workerUrl);
        document.head.removeChild(style);
        fileCache.clear();
    };
  }, []);

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    const validFiles = files.filter(file => file && (file.type === 'image/png' || file.type === 'image/jpeg'));

    if (validFiles.length === 0) {
      if (files.length > 0) setError('Please select valid PNG or JPG images.');
      return;
    }
    setError('');
    
    const newImageMetadata = validFiles.map(file => {
      const id = `${file.name}-${file.lastModified}-${Math.random()}`;
      fileCache.set(id, file);
      return { id, originalName: file.name, originalSize: file.size, convertedUrl: null, convertedSize: 0, status: 'pending' };
    });

    setImageList(prevList => [...prevList, ...newImageMetadata]);
    e.target.value = null;
  };
  
  const triggerFileInput = () => fileInputRef.current.click();

  const dispatchJob = (workerIndex) => {
    if (conversionQueueRef.current.length === 0) return;

    const imageId = conversionQueueRef.current.shift();
    const file = fileCache.get(imageId);

    if (file) {
      busyWorkersRef.current.add(workerIndex);
      setImageList(prev => prev.map(img => img.id === imageId ? { ...img, status: 'converting' } : img));
      workersRef.current[workerIndex].postMessage({ id: imageId, file, quality });
    } else {
      setImageList(prev => prev.map(img => img.id === imageId ? { ...img, status: 'error', errorMessage: 'File not found' } : img));
      dispatchJob(workerIndex);
    }
  };
  
  const handleWorkerMessage = (e, workerIndex) => {
    const { id, status, blob, error } = e.data;
    const convertedUrl = status === 'done' ? URL.createObjectURL(blob) : null;
    const convertedSize = status === 'done' ? blob.size : 0;
    
    setImageList(prev => prev.map(img => img.id === id ? { ...img, status, convertedUrl, convertedSize, errorMessage: error } : img));
    
    busyWorkersRef.current.delete(workerIndex);

    if (conversionQueueRef.current.length > 0) {
      dispatchJob(workerIndex);
    } else if (busyWorkersRef.current.size === 0) {
      setIsConverting(false);
    }
  };

  const convertAllImages = () => {
    const imagesToProcess = imageList.filter(img => img.status === 'pending' || img.status === 'error');
    if (imagesToProcess.length === 0) {
      setError('No new images to convert.');
      return;
    }
    
    conversionQueueRef.current.push(...imagesToProcess.map(img => img.id));
    setIsConverting(true);
    setError('');

    workersRef.current.forEach((_, index) => {
        if (!busyWorkersRef.current.has(index)) {
            dispatchJob(index);
        }
    });
  };
  
  const handleRetry = (id) => {
    setImageList(prev => prev.map(img => img.id === id ? { ...img, status: 'pending', errorMessage: null } : img));
  };

  const removeImage = (id) => {
    const image = imageList.find(img => img.id === id);
    if (image && image.convertedUrl) {
        URL.revokeObjectURL(image.convertedUrl);
    }
    fileCache.delete(id);
    setImageList(prevList => prevList.filter(img => img.id !== id));
    conversionQueueRef.current = conversionQueueRef.current.filter(queueId => queueId !== id);
  };

  const resetState = () => {
      imageList.forEach(image => {
          if(image.convertedUrl) URL.revokeObjectURL(image.convertedUrl);
      });
      setImageList([]);
      fileCache.clear();
      conversionQueueRef.current = [];
      busyWorkersRef.current.clear();
      setError('');
      setIsConverting(false);
      setIsZipping(false);
  };
  
  const downloadAllAsZip = async () => {
    const convertedImages = imageList.filter(img => img.status === 'done' && img.convertedUrl);
    if (convertedImages.length === 0) {
        setError('No converted images to download.');
        return;
    }
    setIsZipping(true);
    setError('');
    const zip = new JSZip();
    for (const image of convertedImages) {
        try {
            const response = await fetch(image.convertedUrl);
            const blob = await response.blob();
            zip.file(`${image.originalName}.webp`, blob);
        } catch (e) { console.error(`Could not add ${image.originalName} to zip:`, e); }
    }
    zip.generateAsync({ type: 'blob' }).then(content => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = 'converted_images.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        setIsZipping(false);
    });
  };

  const processableCount = imageList.filter(i => i.status === 'pending' || i.status === 'error').length;
  const doneCount = imageList.filter(i => i.status === 'done').length;

  return (
    <div className="text-slate-800 flex flex-col items-center px-4 pt-8 sm:pt-10 lg:pt-12 pb-10">
      <div className="w-full max-w-7xl">
        <header className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">
            Convert That Image
          </h1>
          <p className="text-slate-600 mt-4 max-w-2xl mx-auto text-lg">
            The fastest, most reliable way to batch convert your images to the modern WebP format.
          </p>
        </header>
        <main className="bg-white/50 p-4 sm:p-6 rounded-2xl shadow-lg border border-slate-200/80 backdrop-blur-lg">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
             <div className="lg:col-span-2 bg-white/80 p-6 rounded-xl shadow-sm border border-slate-200/80">
                <h2 className="text-xl font-semibold mb-4 flex items-center text-slate-800"><Upload className="mr-2" /> Upload Images</h2>
                <button onClick={triggerFileInput} className="w-full border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50/80 transition-all duration-300 group">
                    <input type="file" accept="image/png, image/jpeg" onChange={handleImageUpload} ref={fileInputRef} className="hidden" multiple />
                    <ImageIcon className="mx-auto text-slate-400 mb-2 transition-transform duration-300 group-hover:scale-110" size={48} />
                    <p className="text-slate-600 font-semibold">Click to browse or drag & drop</p>
                    <p className="text-xs text-slate-500 mt-1">Select multiple PNG or JPG files</p>
                </button>
            </div>
            <div className="lg:col-span-3 bg-white/80 p-6 rounded-xl flex flex-col justify-between shadow-sm border border-slate-200/80">
                <div>
                    <h2 className="text-xl font-semibold mb-4 flex items-center text-slate-800"><Settings className="mr-2" /> Conversion Settings</h2>
                    <label htmlFor="quality" className="block text-sm font-medium text-slate-600">Quality: <span className="font-bold text-indigo-600">{quality}</span></label>
                    <input id="quality" type="range" min="0" max="100" value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 mt-2" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
                    <button onClick={convertAllImages} disabled={processableCount === 0 || isConverting} className="sm:col-span-3 bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:shadow-indigo-500/30">
                      {isConverting ? <RefreshCw className="animate-spin mr-2"/> : <Zap className="mr-2"/>}
                      {isConverting ? `Converting... (${conversionQueueRef.current.length} left)` : `Convert ${processableCount} Images`}
                    </button>
                    <button onClick={downloadAllAsZip} disabled={doneCount === 0 || isZipping} className="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center shadow-md shadow-green-500/20">
                        {isZipping ? <RefreshCw className="animate-spin mr-2 h-4 w-4"/> : <Archive className="mr-2 h-4 w-4"/>}
                        {isZipping ? 'Zipping...' : `Download ZIP`}
                    </button>
                    <button onClick={resetState} disabled={imageList.length === 0} className="sm:col-span-2 bg-slate-200 text-slate-700 font-bold py-2 px-4 rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-50 flex items-center justify-center">
                      <RefreshCw className="mr-2 h-4 w-4" /> Reset All
                    </button>
                </div>
            </div>
          </div>
          {error && <div className="bg-red-100 border border-red-300 text-red-700 p-3 rounded-lg text-center my-4">{error}</div>}
          <div className="mt-6 space-y-3">
            {imageList.length === 0 && (<div className="text-center py-16 bg-slate-50/50 rounded-xl"><p className="text-slate-500">Your uploaded images will appear here.</p></div>)}
            {imageList.map(image => (<ImageRow key={image.id} image={image} onRemove={removeImage} onRetry={handleRetry} />))}
          </div>
        </main>
      </div>
    </div>
  );
}