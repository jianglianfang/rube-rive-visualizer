/**
 * File Loader for RUBE-Rive Visualizer (Web Mode).
 *
 * Provides file type validation and browser File API handling
 * (drag-and-drop + file input) for loading .json + .riv file pairs.
 *
 * Requirements: 7.4, 8.5, 12.1, 12.2
 *
 * @module fileLoader
 */

/**
 * Validate that a pair of file names consists of exactly one .json and one .riv.
 *
 * @param {string} file1Name
 * @param {string} file2Name
 * @returns {boolean} true iff exactly one is .json and the other is .riv
 */
export function validateFilePair(file1Name, file2Name) {
  const ext1 = getExtension(file1Name);
  const ext2 = getExtension(file2Name);

  return (ext1 === '.json' && ext2 === '.riv') ||
         (ext1 === '.riv' && ext2 === '.json');
}

/**
 * Extract the lowercase file extension including the dot.
 * @param {string} name
 * @returns {string}
 */
function getExtension(name) {
  const idx = name.lastIndexOf('.');
  if (idx < 0) return '';
  return name.slice(idx).toLowerCase();
}

/**
 * Browser-side file loader supporting drag-and-drop and file input.
 */
export class FileLoader {
  /**
   * @param {string} dropZoneId - DOM id of the drop zone element
   * @param {string} fileInputId - DOM id of the file input element
   */
  constructor(dropZoneId, fileInputId) {
    this.dropZone = document.getElementById(dropZoneId);
    this.fileInput = document.getElementById(fileInputId);
    /** @type {((jsonFile: File, rivFile: File) => void)|null} */
    this.onFilesLoaded = null;
    /** @type {((message: string) => void)|null} */
    this.onError = null;
  }

  /** Wire up DOM event listeners. */
  init() {
    if (this.dropZone) {
      this.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.add('drag-over');
      });

      this.dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.remove('drag-over');
      });

      this.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.remove('drag-over');
        this._handleFiles(e.dataTransfer.files);
      });

      // Clicking the drop zone triggers the file input
      this.dropZone.addEventListener('click', () => {
        if (this.fileInput) this.fileInput.click();
      });
    }

    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        this._handleFiles(e.target.files);
        // Reset so the same files can be re-selected
        e.target.value = '';
      });
    }

    // Prevent browser from opening dropped files outside the drop zone
    document.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      // If dropped outside drop zone but on the page, still try to handle
      if (e.dataTransfer?.files?.length > 0 && this.dropZone) {
        this._handleFiles(e.dataTransfer.files);
      }
    });
  }

  /**
   * Process a FileList, extract the .json and .riv files, validate, and invoke callback.
   * @param {FileList} fileList
   */
  _handleFiles(fileList) {
    let jsonFile = null;
    let rivFile = null;

    for (const file of fileList) {
      const ext = getExtension(file.name);
      if (ext === '.json') {
        if (jsonFile) {
          this._reportError('Multiple .json files provided. Please provide exactly one .json and one .riv file.');
          return;
        }
        jsonFile = file;
      } else if (ext === '.riv') {
        if (rivFile) {
          this._reportError('Multiple .riv files provided. Please provide exactly one .json and one .riv file.');
          return;
        }
        rivFile = file;
      }
      // Silently ignore other file types in a multi-file drop
    }

    if (!jsonFile && !rivFile) {
      this._reportError('No .json or .riv files found. Please provide one .json and one .riv file.');
      return;
    }
    if (!jsonFile) {
      this._reportError('Missing .json file. Please also provide a RUBE .json file.');
      return;
    }
    if (!rivFile) {
      this._reportError('Missing .riv file. Please also provide a Rive .riv file.');
      return;
    }

    if (this.onFilesLoaded) {
      this.onFilesLoaded(jsonFile, rivFile);
    }
  }

  /**
   * @param {string} message
   */
  _reportError(message) {
    if (this.onError) {
      this.onError(message);
    } else {
      console.error('[FileLoader]', message);
    }
  }
}
