/**
 * qa-upload.js — File upload handling (drag & drop, ZIP extraction, individual files)
 */

'use strict';

const QAUpload = (() => {

  let _jszip = null;

  async function loadJSZip() {
    if (_jszip) return _jszip;
    // JSZip loaded from CDN in index.html
    if (typeof JSZip !== 'undefined') {
      _jszip = JSZip;
      return _jszip;
    }
    throw new Error('JSZip לא נטען - ודא שה-CDN נגיש');
  }

  /**
   * Parse a ZIP file containing symbol files
   */
  async function parseZipFile(file, onProgress) {
    const JSZipLib = await loadJSZip();
    const zip = await JSZipLib.loadAsync(file);
    
    const symbolFiles = {};
    const allFileNames = Object.keys(zip.files);
    let processed = 0;

    // Find all sym-* files
    const symFiles = allFileNames.filter(name => {
      const basename = name.split('/').pop();
      return /^sym-/.test(basename) && !zip.files[name].dir;
    });

    for (const filePath of symFiles) {
      const basename = filePath.split('/').pop();
      
      // Extract symbol name and file type
      let symbolName = null;
      let fileType = null;

      if (/^sym-(.+)-template\.html$/.test(basename)) {
        const m = basename.match(/^sym-(.+)-template\.html$/);
        symbolName = m[1];
        fileType = 'template';
      } else if (/^sym-(.+)-config\.html$/.test(basename)) {
        const m = basename.match(/^sym-(.+)-config\.html$/);
        symbolName = m[1];
        fileType = 'config';
      } else if (/^sym-(.+)\.js$/.test(basename)) {
        const m = basename.match(/^sym-(.+)\.js$/);
        symbolName = m[1];
        fileType = 'js';
      } else if (/^sym-(.+)\.css$/.test(basename)) {
        const m = basename.match(/^sym-(.+)\.css$/);
        symbolName = m[1];
        fileType = 'css';
      }

      if (symbolName && fileType) {
        if (!symbolFiles[symbolName]) {
          symbolFiles[symbolName] = {};
        }
        const content = await zip.files[filePath].async('string');
        symbolFiles[symbolName][fileType] = { name: basename, content };
      }

      processed++;
      if (onProgress) {
        onProgress(Math.round((processed / symFiles.length) * 100), `עיבוד ${basename}`);
      }
    }

    return symbolFiles;
  }

  /**
   * Parse individual dropped files
   */
  async function parseIndividualFiles(fileList, onProgress) {
    const symbolFiles = {};
    const files = Array.from(fileList);
    let processed = 0;

    for (const file of files) {
      const name = file.name;
      let symbolName = null;
      let fileType = null;

      if (/^sym-(.+)-template\.html$/.test(name)) {
        const m = name.match(/^sym-(.+)-template\.html$/);
        symbolName = m[1]; fileType = 'template';
      } else if (/^sym-(.+)-config\.html$/.test(name)) {
        const m = name.match(/^sym-(.+)-config\.html$/);
        symbolName = m[1]; fileType = 'config';
      } else if (/^sym-(.+)\.js$/.test(name)) {
        const m = name.match(/^sym-(.+)\.js$/);
        symbolName = m[1]; fileType = 'js';
      } else if (/^sym-(.+)\.css$/.test(name)) {
        const m = name.match(/^sym-(.+)\.css$/);
        symbolName = m[1]; fileType = 'css';
      }

      if (symbolName && fileType) {
        if (!symbolFiles[symbolName]) symbolFiles[symbolName] = {};
        const content = await readFileAsText(file);
        symbolFiles[symbolName][fileType] = { name, content };
      }

      processed++;
      if (onProgress) {
        onProgress(Math.round((processed / files.length) * 100), `עיבוד ${name}`);
      }
    }

    return symbolFiles;
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error(`שגיאה בקריאת ${file.name}`));
      reader.readAsText(file, 'UTF-8');
    });
  }

  /**
   * Setup drag & drop zone
   */
  function setupDropZone(element, onFiles) {
    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      element.classList.add('drag-active');
    });

    element.addEventListener('dragleave', (e) => {
      if (!element.contains(e.relatedTarget)) {
        element.classList.remove('drag-active');
      }
    });

    element.addEventListener('drop', async (e) => {
      e.preventDefault();
      element.classList.remove('drag-active');
      
      const items = e.dataTransfer.items;
      const files = [];
      
      for (const item of items) {
        if (item.kind === 'file') {
          files.push(item.getAsFile());
        }
      }

      if (files.length > 0) {
        onFiles(files);
      }
    });

    // Click to open file dialog
    element.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = '.js,.html,.css,.zip';
      input.onchange = (e) => {
        if (e.target.files.length > 0) {
          onFiles(Array.from(e.target.files));
        }
      };
      input.click();
    });
  }

  /**
   * Process uploaded files (auto-detect ZIP vs individual)
   */
  async function processFiles(files, onProgress) {
    if (files.length === 1 && files[0].name.endsWith('.zip')) {
      return parseZipFile(files[0], onProgress);
    } else {
      return parseIndividualFiles(files, onProgress);
    }
  }

  /**
   * Format file size for display
   */
  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return {
    parseZipFile,
    parseIndividualFiles,
    setupDropZone,
    processFiles,
    readFileAsText,
    formatSize
  };

})();

export default QAUpload;
