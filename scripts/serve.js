// Servidor estático mínimo para desarrollo local (los módulos ES no cargan desde file://).
// Uso: npm start  → http://localhost:8080
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const RAIZ = resolve('.');
const PUERTO = Number(process.env.PORT) || 8080;
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.csv': 'text/csv' };

createServer(async (req, res) => {
  const ruta = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const archivo = join(RAIZ, ruta === '/' || ruta === '\\' ? 'index.html' : ruta);
  if (!archivo.startsWith(RAIZ)) { res.writeHead(403).end(); return; }
  try {
    const datos = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': (TIPOS[extname(archivo)] ?? 'application/octet-stream') + '; charset=utf-8' });
    res.end(datos);
  } catch {
    res.writeHead(404).end('No encontrado');
  }
}).listen(PUERTO, () => console.log(`CrashDetector en http://localhost:${PUERTO}`));
