"use client";

import { useState, useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, Download, Settings, RefreshCw, X, Zap, Archive } from 'lucide-react';
import JSZip from 'jszip';

// --- Helper: Web Worker for Faster Conversions ---
const converterWorkerCode = `
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
      self.postMessage({ id, status: 'error', error: error.message });
    }
  };
`;

// --- Component: ImageRow for Lazy Loading ---
const ImageRow = ({ image, onRemove }) => {
  const [isVisible, setIsVisible] = useState(false);
  const placeholderRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px 200px 0px' }
    );

    if (placeholderRef.current) {
      observer.observe(placeholderRef.current);
    }

    return () => {
      if (placeholderRef.current) {
        observer.unobserve(placeholderRef.current);
      }
    };
  }, []);

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!isVisible) {
    return <div ref={placeholderRef} style={{ height: '108px' }} className="w-full"></div>;
  }

  return (
    <div ref={placeholderRef} className="bg-white/60 p-4 rounded-lg flex flex-col md:flex-row items-center gap-4 animate-fade-in shadow-sm border border-slate-200/80">
      <div className="w-20 h-20 flex-shrink-0 bg-slate-100 rounded-md flex items-center justify-center overflow-hidden">
          <img src={image.originalUrl} alt={image.originalName} className="max-w-full max-h-full object-contain"/>
      </div>
      <div className="flex-grow text-center md:text-left">
          <p className="font-semibold text-slate-800 truncate" title={image.file.name}>{image.file.name}</p>
          <p className="text-sm text-slate-500">Original: {formatSize(image.originalSize)}</p>
      </div>
      <div className="flex-shrink-0 text-center w-32">
          {image.status === 'done' && image.convertedSize > 0 && (
              <>
                  <p className="text-sm text-slate-500">WebP: {formatSize(image.convertedSize)}</p>
                  <p className={`text-sm font-bold ${image.convertedSize < image.originalSize ? 'text-green-600' : 'text-red-600'}`}>
                      {(((image.originalSize - image.convertedSize) / image.originalSize) * 100).toFixed(1)}% change
                  </p>
              </>
          )}
          {image.status === 'converting' && <RefreshCw className="animate-spin text-indigo-600 mx-auto" size={24} />}
          {image.status === 'pending' && <p className="text-slate-400 text-sm">Queued</p>}
          {image.status === 'error' && <p className="text-red-500 text-sm">Error</p>}
      </div>
       <div className="flex-shrink-0 w-36">
          {image.status === 'done' ? (
              <a
                  href={image.convertedUrl}
                  download={`${image.originalName}.webp`}
                  className="bg-green-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center text-sm"
              >
                  <Download className="mr-2 h-4 w-4" /> Download
              </a>
          ) : (
              <div className="h-9"></div>
          )}
       </div>
       <button onClick={() => onRemove(image.id)} className="text-slate-400 hover:text-red-500 transition-colors">
          <X size={20}/>
       </button>
    </div>
  );
};


// --- Main App Component ---
export default function App() {
  const [imageList, setImageList] = useState([]);
  const [quality, setQuality] = useState(80);
  const [isConverting, setIsConverting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const workersRef = useRef([]);

  // --- Effect for Client-Side only code ---
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      body {
        background-color: #f1f5f9;
        background-image: radial-gradient(circle at top left, #e0e7ff, transparent 40%),
                          radial-gradient(circle at bottom right, #e0f2fe, transparent 50%);
      }
      @keyframes fade-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .animate-fade-in {
        animation: fade-in 0.3s ease-out forwards;
      }
    `;
    document.head.appendChild(style);

    const numWorkers = window.navigator.hardwareConcurrency || 4;
    const workerBlob = new Blob([converterWorkerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(workerBlob);
    
    for (let i = 0; i < numWorkers; i++) {
        workersRef.current.push(new Worker(workerUrl));
    }

    return () => {
        workersRef.current.forEach(worker => worker.terminate());
        URL.revokeObjectURL(workerUrl);
        document.head.removeChild(style);
    };
  }, []);

  // --- Handlers ---
  
  /**
   * Handles image uploads by processing them in asynchronous chunks
   * to prevent the UI from freezing with a large number of files.
   * @param {React.ChangeEvent<HTMLInputElement>} e - The input change event.
   */
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    const validFiles = files.filter(file => file && (file.type === 'image/png' || file.type === 'image/jpeg'));

    if (validFiles.length === 0) {
      if (files.length > 0) setError('Please select valid PNG or JPG images.');
      return;
    }

    setError('');
    
    const CHUNK_SIZE = 25; // Process 25 images per chunk.
    let i = 0;

    function processChunk() {
      const chunk = validFiles.slice(i, i + CHUNK_SIZE);
      if (chunk.length > 0) {
        const newImages = chunk.map(file => ({
          id: `${file.name}-${file.lastModified}-${Math.random()}`,
          file: file,
          originalUrl: URL.createObjectURL(file),
          originalName: file.name.split('.').slice(0, -1).join('.'),
          originalSize: file.size,
          convertedUrl: null,
          convertedSize: 0,
          status: 'pending'
        }));
        
        setImageList(prevList => [...prevList, ...newImages]);
        i += CHUNK_SIZE;
        
        // Schedule the next chunk to be processed after a short delay,
        // allowing the browser to render updates and remain responsive.
        setTimeout(processChunk, 0);
      }
    }

    processChunk(); // Start processing the first chunk.
    e.target.value = null; // Reset file input to allow re-uploading the same files.
  };
  
  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  const convertAllImages = async () => {
    const pendingImages = imageList.filter(img => img.status === 'pending');
    if (pendingImages.length === 0) {
      setError('No new images to convert. Upload more or reset.');
      return;
    }

    setIsConverting(true);
    setError('');

    let currentWorkerIndex = 0;
    const conversionPromises = pendingImages.map(imageObj => {
      return new Promise((resolve) => {
        const worker = workersRef.current[currentWorkerIndex];
        
        setImageList(prev => prev.map(img => img.id === imageObj.id ? { ...img, status: 'converting' } : img));

        const handleMessage = (e) => {
            if (e.data.id === imageObj.id) {
                const { status, blob } = e.data;
                const convertedUrl = status === 'done' ? URL.createObjectURL(blob) : null;
                const convertedSize = status === 'done' ? blob.size : 0;

                setImageList(prev => prev.map(img => 
                    img.id === imageObj.id ? { ...img, status, convertedUrl, convertedSize } : img
                ));
                
                worker.removeEventListener('message', handleMessage);
                resolve();
            }
        };

        worker.addEventListener('message', handleMessage);
        worker.postMessage({ id: imageObj.id, file: imageObj.file, quality });
        
        currentWorkerIndex = (currentWorkerIndex + 1) % workersRef.current.length;
      });
    });

    await Promise.all(conversionPromises);
    setIsConverting(false);
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
        } catch (e) {
            console.error(`Could not add ${image.originalName} to zip:`, e);
        }
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
  
  const removeImage = (id) => {
    const image = imageList.find(img => img.id === id);
    if (image) {
        if(image.originalUrl) URL.revokeObjectURL(image.originalUrl);
        if(image.convertedUrl) URL.revokeObjectURL(image.convertedUrl);
    }
    setImageList(prevList => prevList.filter(img => img.id !== id));
  };

  const resetState = () => {
      imageList.forEach(image => {
          if(image.originalUrl) URL.revokeObjectURL(image.originalUrl);
          if(image.convertedUrl) URL.revokeObjectURL(image.convertedUrl);
      });
      setImageList([]);
      setError('');
      setIsConverting(false);
      setIsZipping(false);
  };

  const pendingCount = imageList.filter(i => i.status === 'pending').length;
  const doneCount = imageList.filter(i => i.status === 'done').length;

  return (
    <div className="text-slate-800 min-h-screen font-sans flex flex-col items-center p-4 sm:p-8 lg:p-12">
      <div className="w-full max-w-7xl">
        <header className="text-center mb-10">
          <h1 className="text-5xl font-extrabold tracking-tight text-slate-900">
            Optimized WebP Converter
          </h1>
          <p className="text-slate-600 mt-4 max-w-2xl mx-auto">
            Convert PNG or JPG files to next-gen WebP format. Conversions happen in parallel using Web Workers for maximum speed.
          </p>
        </header>

        <main className="bg-white/50 p-6 rounded-2xl shadow-lg border border-slate-200/80 backdrop-blur-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
             <div className="bg-white/60 p-6 rounded-lg shadow-sm border border-slate-200/80">
                <h2 className="text-xl font-semibold mb-4 flex items-center text-slate-800"><Upload className="mr-2" /> Upload Images</h2>
                <button onClick={triggerFileInput} className="w-full border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-colors">
                    <input type="file" accept="image/png, image/jpeg" onChange={handleImageUpload} ref={fileInputRef} className="hidden" multiple />
                    <ImageIcon className="mx-auto text-slate-400 mb-2" size={48} />
                    <p className="text-slate-500 font-semibold">Click to browse or drag & drop</p>
                    <p className="text-xs text-slate-400 mt-1">Select multiple PNG or JPG files</p>
                </button>
            </div>
            <div className="bg-white/60 p-6 rounded-lg flex flex-col justify-between shadow-sm border border-slate-200/80">
                <div>
                    <h2 className="text-xl font-semibold mb-4 flex items-center text-slate-800"><Settings className="mr-2" /> Conversion Settings</h2>
                    <label htmlFor="quality" className="block text-sm font-medium text-slate-600">Quality: <span className="font-bold text-indigo-600">{quality}</span></label>
                    <input id="quality" type="range" min="0" max="100" value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 mt-2" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                    <button onClick={convertAllImages} disabled={pendingCount === 0 || isConverting} className="bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-md">
                      {isConverting ? <RefreshCw className="animate-spin mr-2"/> : <Zap className="mr-2"/>}
                      {isConverting ? 'Converting...' : `Convert ${pendingCount} Images`}
                    </button>
                    <button onClick={downloadAllAsZip} disabled={doneCount === 0 || isZipping} className="bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center shadow-md">
                        {isZipping ? <RefreshCw className="animate-spin mr-2"/> : <Archive className="mr-2"/>}
                        {isZipping ? 'Zipping...' : `Download ${doneCount} ZIP`}
                    </button>
                    <button onClick={resetState} disabled={imageList.length === 0} className="sm:col-span-2 bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-50 flex items-center justify-center">
                      <RefreshCw className="mr-2" /> Reset All
                    </button>
                </div>
            </div>
          </div>
          
          {error && <div className="bg-red-100 border border-red-300 text-red-700 p-3 rounded-lg text-center mb-6">{error}</div>}

          <div className="space-y-3">
            {imageList.length === 0 && (
                <div className="text-center py-10 text-slate-500"><p>Your uploaded images will appear here.</p></div>
            )}
            {imageList.map(image => (
              <ImageRow key={image.id} image={image} onRemove={removeImage} />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
