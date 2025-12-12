import express from 'express';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateEmployeeData } from './generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Cache configuration
const CACHE_CONFIG = {
  // Maximum number of items in memory cache
  MAX_MEMORY_CACHE_SIZE: 10,
  // Cache TTL in milliseconds (24 hours default, 0 = no expiration)
  CACHE_TTL: process.env.CACHE_TTL ? parseInt(process.env.CACHE_TTL) : 24 * 60 * 60 * 1000,
  // Enable file-based caching
  ENABLE_FILE_CACHE: process.env.ENABLE_FILE_CACHE !== 'false',
  // Enable in-memory caching
  ENABLE_MEMORY_CACHE: process.env.ENABLE_MEMORY_CACHE !== 'false'
};

// In-memory cache (LRU-like with TTL)
const memoryCache = new Map();

// Cache entry structure
class CacheEntry {
  constructor(data, timestamp = Date.now()) {
    this.data = data;
    this.timestamp = timestamp;
    this.accessCount = 0;
    this.lastAccessed = timestamp;
  }
  
  isExpired() {
    if (CACHE_CONFIG.CACHE_TTL === 0) return false;
    return (Date.now() - this.timestamp) > CACHE_CONFIG.CACHE_TTL;
  }
  
  touch() {
    this.accessCount++;
    this.lastAccessed = Date.now();
  }
}

// Cache management functions
function getCacheKey(numEmployees, calendarYear) {
  return `cache_${numEmployees}_${calendarYear}`;
}

function getCacheFilePath(numEmployees, calendarYear) {
  const dataDir = path.join(__dirname, 'data');
  if (!fsSync.existsSync(dataDir)) {
    fsSync.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, `cache_${numEmployees}_${calendarYear}.json`);
}

function getFromMemoryCache(key) {
  if (!CACHE_CONFIG.ENABLE_MEMORY_CACHE) return null;
  
  const entry = memoryCache.get(key);
  if (!entry) return null;
  
  if (entry.isExpired()) {
    memoryCache.delete(key);
    return null;
  }
  
  entry.touch();
  return entry.data;
}

function setMemoryCache(key, data) {
  if (!CACHE_CONFIG.ENABLE_MEMORY_CACHE) return;
  
  // Implement LRU eviction if cache is full
  if (memoryCache.size >= CACHE_CONFIG.MAX_MEMORY_CACHE_SIZE && !memoryCache.has(key)) {
    // Remove least recently used entry
    let lruKey = null;
    let lruTime = Infinity;
    
    for (const [k, entry] of memoryCache.entries()) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = k;
      }
    }
    
    if (lruKey) {
      memoryCache.delete(lruKey);
    }
  }
  
  memoryCache.set(key, new CacheEntry(data));
}

async function getFromFileCache(numEmployees, calendarYear) {
  if (!CACHE_CONFIG.ENABLE_FILE_CACHE) return null;
  
  const filePath = getCacheFilePath(numEmployees, calendarYear);
  
  try {
    const stats = await fs.stat(filePath).catch(() => null);
    if (!stats) {
      return null;
    }
    
    // Check if file is expired
    if (CACHE_CONFIG.CACHE_TTL > 0) {
      const age = Date.now() - stats.mtime.getTime();
      if (age > CACHE_CONFIG.CACHE_TTL) {
        // File expired, delete it (async, don't wait)
        fs.unlink(filePath).catch(() => {});
        return null;
      }
    }
    
    const content = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(content);
    return data;
  } catch (error) {
    // Silently fail - cache miss is not an error
    return null;
  }
}

async function setFileCache(numEmployees, calendarYear, data) {
  if (!CACHE_CONFIG.ENABLE_FILE_CACHE) return;
  
  try {
    const filePath = getCacheFilePath(numEmployees, calendarYear);
    // Write asynchronously, don't block
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    // Log but don't throw - caching failure shouldn't break the request
    console.error(`Error writing cache file:`, error.message);
  }
}

async function getCachedData(numEmployees, calendarYear) {
  const key = getCacheKey(numEmployees, calendarYear);
  
  // Try memory cache first (synchronous, fast)
  const memoryData = getFromMemoryCache(key);
  if (memoryData) {
    return { data: memoryData, source: 'memory' };
  }
  
  // Try file cache (async)
  const fileData = await getFromFileCache(numEmployees, calendarYear);
  if (fileData) {
    // Populate memory cache with file data
    setMemoryCache(key, fileData);
    return { data: fileData, source: 'file' };
  }
  
  return null;
}

async function setCachedData(numEmployees, calendarYear, data) {
  const key = getCacheKey(numEmployees, calendarYear);
  
  // Set in memory cache (synchronous, fast)
  setMemoryCache(key, data);
  
  // Set in file cache (async, don't block)
  setFileCache(numEmployees, calendarYear, data).catch(err => {
    console.error('Error setting file cache:', err.message);
  });
}

// Clean expired cache entries periodically (async)
async function cleanExpiredCache() {
  try {
    // Clean memory cache
    for (const [key, entry] of memoryCache.entries()) {
      if (entry.isExpired()) {
        memoryCache.delete(key);
      }
    }
    
    // Clean file cache (async)
    if (CACHE_CONFIG.ENABLE_FILE_CACHE && CACHE_CONFIG.CACHE_TTL > 0) {
      const dataDir = path.join(__dirname, 'data');
      if (fsSync.existsSync(dataDir)) {
        try {
          const files = await fs.readdir(dataDir);
          const cacheFiles = files.filter(f => f.startsWith('cache_') && f.endsWith('.json'));
          const now = Date.now();
          
          for (const file of cacheFiles) {
            const filePath = path.join(dataDir, file);
            try {
              const stats = await fs.stat(filePath);
              const age = now - stats.mtime.getTime();
              if (age > CACHE_CONFIG.CACHE_TTL) {
                await fs.unlink(filePath);
                console.log(`Cleaned expired cache file: ${file}`);
              }
            } catch (error) {
              // Ignore individual file errors
            }
          }
        } catch (error) {
          console.error('Error during cache cleanup:', error.message);
        }
      }
    }
  } catch (error) {
    console.error('Error in cache cleanup:', error.message);
  }
}

// Run cache cleanup every hour (async, don't block)
setInterval(() => {
  cleanExpiredCache().catch(err => console.error('Cache cleanup error:', err.message));
}, 60 * 60 * 1000);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Generate data endpoint with caching
app.post('/api/generate', async (req, res) => {
  try {
    const { numEmployees = 10, calendarYear = new Date().getFullYear().toString(), forceRegenerate = false } = req.body;
    
    if (numEmployees <= 0 || numEmployees > 70000) {
      return res.status(400).json({ error: 'numEmployees must be between 1 and 70000' });
    }
    
    if (!/^\d{4}$/.test(calendarYear)) {
      return res.status(400).json({ error: 'calendarYear must be 4 digits' });
    }
    
    const numEmployeesInt = parseInt(numEmployees);
    let data;
    let cacheHit = false;
    let cacheSource = null;
    
    // Check cache unless forceRegenerate is true
    if (!forceRegenerate) {
      try {
        const cached = await getCachedData(numEmployeesInt, calendarYear);
        if (cached) {
          data = cached.data;
          cacheHit = true;
          cacheSource = cached.source;
        }
      } catch (cacheError) {
        // Cache error shouldn't break the request, just log and continue
        console.error('Cache read error:', cacheError.message);
      }
    }
    
    // Generate new data if not cached
    if (!data) {
      try {
        const startTime = Date.now();
        data = generateEmployeeData(numEmployeesInt, calendarYear);
        const generationTime = Date.now() - startTime;
        
        // Cache the generated data (async, don't block response)
        setCachedData(numEmployeesInt, calendarYear, data).catch(err => {
          console.error('Cache write error:', err.message);
        });
        
        console.log(`Generated data for ${numEmployeesInt} employees (${calendarYear}) in ${generationTime}ms`);
      } catch (genError) {
        console.error('Generation error:', genError);
        return res.status(500).json({ error: genError.message });
      }
    } else {
      console.log(`Cache hit (${cacheSource}) for ${numEmployeesInt} employees (${calendarYear})`);
    }
    
    const totalW2s = data.employees.reduce((sum, emp) => sum + emp.w2s.Report_Entry.length, 0);
    const totalW2Cs = data.employees.reduce((sum, emp) => sum + emp.w2cs.Report_Entry.length, 0);
    
    res.json({
      success: true,
      employees: data.employees.length,
      totalW2s,
      totalW2Cs,
      cached: cacheHit,
      cacheSource: cacheSource,
      data
    });
  } catch (error) {
    console.error('Error in /api/generate:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// List generated files
app.get('/api/files', async (req, res) => {
  try {
    const dataDir = path.join(__dirname, 'data');
    
    if (!fsSync.existsSync(dataDir)) {
      return res.json({ files: [] });
    }
    
    const files = await fs.readdir(dataDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    const fileStats = await Promise.all(
      jsonFiles.map(async (file) => {
        try {
          const filePath = path.join(dataDir, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            size: stats.size,
            modified: stats.mtime.toISOString()
          };
        } catch (error) {
          return null;
        }
      })
    );
    
    const validFiles = fileStats.filter(f => f !== null)
      .sort((a, b) => b.modified.localeCompare(a.modified));
    
    res.json({ files: validFiles });
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get a specific file
app.get('/api/files/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'data', filename);
    
    // Security check - ensure file is in data directory
    const resolvedPath = path.resolve(filePath);
    const dataDir = path.resolve(path.join(__dirname, 'data'));
    
    if (!resolvedPath.startsWith(dataDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);
      res.json(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({ error: 'File not found' });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get statistics about generated data
app.get('/api/stats', async (req, res) => {
  try {
    const dataDir = path.join(__dirname, 'data');
    
    if (!fsSync.existsSync(dataDir)) {
      return res.json({ 
        totalFiles: 0,
        totalSize: 0,
        files: [],
        cache: {
          memoryEntries: 0,
          memorySize: 0
        }
      });
    }
    
    const files = await fs.readdir(dataDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    let totalSize = 0;
    let cacheSize = 0;
    const fileStats = [];
    const cacheStats = [];
    
    await Promise.all(
      jsonFiles.map(async (file) => {
        try {
          const filePath = path.join(dataDir, file);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
          
          const isCacheFile = file.startsWith('cache_');
          if (isCacheFile) {
            cacheSize += stats.size;
          }
          
          try {
            const content = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(content);
            const w2s = data.employees?.reduce((sum, emp) => sum + (emp.w2s?.Report_Entry?.length || 0), 0) || 0;
            const w2cs = data.employees?.reduce((sum, emp) => sum + (emp.w2cs?.Report_Entry?.length || 0), 0) || 0;
            
            const fileInfo = {
              name: file,
              size: stats.size,
              employees: data.employees?.length || 0,
              w2s,
              w2cs,
              modified: stats.mtime.toISOString(),
              isCache: isCacheFile
            };
            
            if (isCacheFile) {
              cacheStats.push(fileInfo);
            } else {
              fileStats.push(fileInfo);
            }
          } catch (e) {
            // Skip files that can't be parsed
          }
        } catch (e) {
          // Skip files that can't be accessed
        }
      })
    );
    
    // Calculate memory cache stats
    let memorySize = 0;
    for (const entry of memoryCache.values()) {
      try {
        memorySize += JSON.stringify(entry.data).length;
      } catch (e) {
        // Ignore
      }
    }
    
    res.json({
      totalFiles: jsonFiles.length,
      totalSize,
      cacheFiles: cacheStats.length,
      cacheSize,
      files: fileStats.sort((a, b) => b.modified.localeCompare(a.modified)),
      cache: {
        memoryEntries: memoryCache.size,
        memorySize,
        maxMemoryCacheSize: CACHE_CONFIG.MAX_MEMORY_CACHE_SIZE,
        cacheTTL: CACHE_CONFIG.CACHE_TTL,
        fileCacheEnabled: CACHE_CONFIG.ENABLE_FILE_CACHE,
        memoryCacheEnabled: CACHE_CONFIG.ENABLE_MEMORY_CACHE
      }
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clear cache endpoint
app.delete('/api/cache', async (req, res) => {
  try {
    const { type = 'all' } = req.query; // 'all', 'memory', or 'file'
    let cleared = { memory: 0, file: 0 };
    
    if (type === 'all' || type === 'memory') {
      cleared.memory = memoryCache.size;
      memoryCache.clear();
    }
    
    if (type === 'all' || type === 'file') {
      const dataDir = path.join(__dirname, 'data');
      if (fsSync.existsSync(dataDir)) {
        try {
          const files = await fs.readdir(dataDir);
          const cacheFiles = files.filter(f => f.startsWith('cache_') && f.endsWith('.json'));
          
          await Promise.all(
            cacheFiles.map(async (file) => {
              try {
                await fs.unlink(path.join(dataDir, file));
                cleared.file++;
              } catch (error) {
                // Ignore individual file errors
              }
            })
          );
        } catch (error) {
          console.error('Error clearing file cache:', error.message);
        }
      }
    }
    
    res.json({
      success: true,
      cleared,
      message: `Cleared ${type} cache`
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: error.message });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'W2/W2C Test Data Generator API',
    version: '1.0.0',
    endpoints: {
      'GET /health': 'Health check',
      'POST /api/generate': 'Generate test data (body: {numEmployees, calendarYear, forceRegenerate?})',
      'GET /api/files': 'List generated files',
      'GET /api/files/:filename': 'Get a specific file',
      'GET /api/stats': 'Get statistics about generated data and cache',
      'DELETE /api/cache': 'Clear cache (query: ?type=all|memory|file)'
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`W2/W2C Test Data Generator API running on port ${PORT}`);
  console.log(`Health check: http://0.0.0.0:${PORT}/health`);
});

