/**
 * qa-github.js — GitHub API integration for fetching PI Vision symbol files
 * Supports both public and private repos via Contents API and Git Trees API
 */

'use strict';

const QAGitHub = (() => {

  const GITHUB_API_BASE = 'https://api.github.com';
  let _token = '';
  let _rateLimit = null;

  function setToken(token) {
    _token = token ? token.trim() : '';
  }

  function getHeaders() {
    const h = { 'Accept': 'application/vnd.github.v3+json' };
    if (_token) h['Authorization'] = `token ${_token}`;
    return h;
  }

  async function fetchGH(url) {
    const response = await fetch(url, { headers: getHeaders() });
    _rateLimit = {
      limit: parseInt(response.headers.get('X-RateLimit-Limit') || '60'),
      remaining: parseInt(response.headers.get('X-RateLimit-Remaining') || '0'),
      reset: parseInt(response.headers.get('X-RateLimit-Reset') || '0')
    };
    if (response.status === 403 && _rateLimit.remaining === 0) {
      const resetDate = new Date(_rateLimit.reset * 1000);
      throw new Error(`הגבלת קצב GitHub API. יתאפס ב: ${resetDate.toLocaleTimeString('he-IL')}`);
    }
    if (response.status === 401) {
      throw new Error('טוקן GitHub לא תקין. בדוק את הטוקן ונסה שוב.');
    }
    if (response.status === 404) {
      throw new Error(`לא נמצא (404). אם המאגר פרטי, הזן GitHub Token בשדה המתאים.`);
    }
    if (!response.ok) {
      throw new Error(`שגיאת GitHub API: ${response.status} ${response.statusText}`);
    }
    return response;
  }

  /**
   * Strategy 1: Git Trees API — works for private repos, lists entire tree in one call
   */
  async function fetchViaTreesAPI(owner, repo, deployPath, onProgress) {
    if (onProgress) onProgress(0, 'טוען עץ קבצים מ-GitHub (Trees API)...');

    // Get default branch
    const repoResp = await fetchGH(`${GITHUB_API_BASE}/repos/${owner}/${repo}`);
    const repoData = await repoResp.json();
    const branch = repoData.default_branch || 'main';

    // Get full tree recursively
    const treeResp = await fetchGH(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
    const treeData = await treeResp.json();

    if (!treeData.tree || !Array.isArray(treeData.tree)) {
      throw new Error('לא ניתן לקרוא את עץ הקבצים');
    }

    // Filter symbol files under deployPath
    const prefix = deployPath ? `${deployPath}/` : '';
    const symbolFileEntries = treeData.tree.filter(item =>
      item.type === 'blob' &&
      item.path.startsWith(prefix) &&
      item.path.replace(prefix, '').startsWith('sym-') &&
      !item.path.replace(prefix, '').includes('/')
    );

    if (symbolFileEntries.length === 0) {
      throw new Error(`לא נמצאו קבצי סמלים בנתיב: ${deployPath}`);
    }

    // Discover symbol names
    const symbolNames = new Set();
    symbolFileEntries.forEach(f => {
      const fileName = f.path.replace(prefix, '');
      const match = fileName.match(/^sym-(.+?)(?:\.js|-template\.html|-config\.html|\.css)$/);
      if (match) {
        let name = match[1];
        name = name.replace(/-template$|-config$/, '');
        symbolNames.add(name);
      }
    });

    // Build file map
    const fileMap = {};
    symbolFileEntries.forEach(f => {
      const fileName = f.path.replace(prefix, '');
      fileMap[fileName] = { name: fileName, path: f.path, sha: f.sha };
    });

    // Fetch content for each symbol using blob API
    const discovered = Array.from(symbolNames);
    const symbolFiles = {};
    let done = 0;

    for (const sym of discovered) {
      const fileTypes = [
        { key: 'js', fileName: `sym-${sym}.js` },
        { key: 'template', fileName: `sym-${sym}-template.html` },
        { key: 'config', fileName: `sym-${sym}-config.html` },
        { key: 'css', fileName: `sym-${sym}.css` }
      ];

      const files = {};
      for (const ft of fileTypes) {
        const entry = fileMap[ft.fileName];
        if (entry) {
          try {
            const blobResp = await fetchGH(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/blobs/${entry.sha}`);
            const blobData = await blobResp.json();
            if (blobData.encoding === 'base64') {
              const binary = atob(blobData.content.replace(/\n/g, ''));
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              files[ft.key] = { name: ft.fileName, content: new TextDecoder('utf-8').decode(bytes) };
            } else {
              files[ft.key] = { name: ft.fileName, content: blobData.content };
            }
          } catch (err) {
            files[ft.key] = { name: ft.fileName, content: null, error: err.message };
          }
        } else {
          files[ft.key] = { name: ft.fileName, content: null, error: 'קובץ לא נמצא' };
        }
        // Rate limiting — small delay
        await new Promise(r => setTimeout(r, 30));
      }

      symbolFiles[sym] = { files, error: null };
      done++;
      if (onProgress) {
        const pct = Math.round((done / discovered.length) * 100);
        onProgress(pct, `${sym} (${done}/${discovered.length})`);
      }
    }

    return { symbolFiles, fileMap, discoveredCount: discovered.length };
  }

  /**
   * Strategy 2: Contents API — works for public repos without auth
   */
  async function fetchViaContentsAPI(owner, repo, deployPath, onProgress) {
    if (onProgress) onProgress(0, 'טוען רשימת קבצים מ-GitHub (Contents API)...');
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${deployPath}`;
    const response = await fetchGH(url);
    const contents = await response.json();

    if (!Array.isArray(contents)) {
      throw new Error('התשובה מה-API אינה רשימת קבצים');
    }

    const fileMap = {};
    contents.filter(f => f.type === 'file').forEach(f => {
      fileMap[f.name] = { name: f.name, path: f.path, downloadUrl: f.download_url, sha: f.sha };
    });

    // Discover symbols
    const symbolNames = new Set();
    Object.keys(fileMap).forEach(name => {
      const match = name.match(/^sym-(.+?)(?:\.js|-template\.html|-config\.html|\.css)$/);
      if (match) {
        let n = match[1];
        n = n.replace(/-template$|-config$/, '');
        symbolNames.add(n);
      }
    });

    const discovered = Array.from(symbolNames);
    const symbolFiles = {};
    let done = 0;

    for (const sym of discovered) {
      const fileTypes = [
        { key: 'js', fileName: `sym-${sym}.js` },
        { key: 'template', fileName: `sym-${sym}-template.html` },
        { key: 'config', fileName: `sym-${sym}-config.html` },
        { key: 'css', fileName: `sym-${sym}.css` }
      ];

      const files = {};
      for (const ft of fileTypes) {
        const entry = fileMap[ft.fileName];
        if (entry && entry.downloadUrl) {
          try {
            const resp = await fetch(entry.downloadUrl, { headers: getHeaders() });
            if (!resp.ok) throw new Error(`שגיאה בטעינה: ${resp.status}`);
            files[ft.key] = { name: ft.fileName, content: await resp.text() };
          } catch (err) {
            files[ft.key] = { name: ft.fileName, content: null, error: err.message };
          }
        } else {
          files[ft.key] = { name: ft.fileName, content: null, error: 'קובץ לא נמצא' };
        }
        await new Promise(r => setTimeout(r, 50));
      }

      symbolFiles[sym] = { files, error: null };
      done++;
      if (onProgress) {
        const pct = Math.round((done / discovered.length) * 100);
        onProgress(pct, `${sym} (${done}/${discovered.length})`);
      }
    }

    return { symbolFiles, fileMap, discoveredCount: discovered.length };
  }

  /**
   * Main entry: auto-selects strategy based on token and repo type
   */
  async function smartFetchSymbols(owner, repo, deployPath, onProgress) {
    // If we have a token, prefer Trees API (works for private repos, 1 API call for tree)
    if (_token) {
      try {
        return await fetchViaTreesAPI(owner, repo, deployPath, onProgress);
      } catch (err) {
        // Fallback to Contents API
        console.warn('Trees API failed, falling back to Contents API:', err.message);
        return await fetchViaContentsAPI(owner, repo, deployPath, onProgress);
      }
    }

    // No token — try Contents API first (works for public repos)
    try {
      return await fetchViaContentsAPI(owner, repo, deployPath, onProgress);
    } catch (err) {
      if (err.message.includes('404')) {
        throw new Error(
          'המאגר לא נמצא. אם המאגר פרטי, הזן GitHub Token (Personal Access Token) בשדה המתאים.\n' +
          'ליצירת token: GitHub → Settings → Developer settings → Personal access tokens → Generate new token (repo scope)'
        );
      }
      throw err;
    }
  }

  function getRateLimit() { return _rateLimit; }

  return {
    setToken,
    smartFetchSymbols,
    getRateLimit
  };

})();

export default QAGitHub;
