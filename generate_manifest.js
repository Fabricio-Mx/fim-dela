#!/usr/bin/env node
/**
 * Regenera media-manifest.js com todos os arquivos da pasta Galeria
 * Remove .MOV e adiciona .mp4 equivalentes
 */

const fs = require('fs');
const path = require('path');

const GALERIA_DIR = path.join(__dirname, 'Galeria');
const EXCLUDE_FILES = ['Perfil.jpeg']; // Arquivo de perfil não entra na galeria

function generateManifest() {
  const files = fs.readdirSync(GALERIA_DIR);
  
  // Filtra arquivos, excluindo o Perfil.jpeg
  const mediaFiles = files
    .filter(f => {
      // Exclude profile and hidden files
      if (EXCLUDE_FILES.includes(f) || f.startsWith('.')) return false;
      
      // Include images and videos
      const ext = path.extname(f).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.heic', '.mov', '.mp4'].includes(ext);
    })
    .map(f => {
      // Substitui .MOV/.mov por .mp4
      const ext = path.extname(f).toLowerCase();
      if (ext === '.mov') {
        return f.replace(/\.mov$/i, '.mp4');
      }
      return f;
    })
    .filter((f, i, arr) => arr.indexOf(f) === i); // Remove duplicatas
    
  // Prefere MP4 em vez de HEIC para o mesmo nome base (Live Photos)
  const mp4Basenames = new Set(
    mediaFiles
      .filter(f => f.toLowerCase().endsWith('.mp4'))
      .map(f => path.basename(f, path.extname(f)))
  );

  const finalMediaFiles = mediaFiles
    .filter(f => {
      if (!f.toLowerCase().endsWith('.heic')) {
        return true; // Mantem arquivos que não são HEIC
      }
      const heicBasename = path.basename(f, path.extname(f));
      // Mantem HEIC somente se não houver um MP4 com o mesmo nome
      return !mp4Basenames.has(heicBasename);
    })
    .sort();

  const manifestCode = `window.MEDIA_MANIFEST = [
${finalMediaFiles.map(f => `  "${f}",`).join('\n').replace(/,\n$/, '\n')}
];
`;

  return { mediaFiles: finalMediaFiles, manifestCode };
}

try {
  const { mediaFiles, manifestCode } = generateManifest();
  
  // Salva arquivo
  fs.writeFileSync(
    path.join(__dirname, 'media-manifest.js'),
    manifestCode
  );
  
  console.log(`✓ media-manifest.js atualizado com ${mediaFiles.length} arquivos`);
  console.log(`\nArquivos por tipo:`);
  
  const types = {
    'Imagens JPG': mediaFiles.filter(f => f.toLowerCase().endsWith('.jpg')).length,
    'Imagens PNG': mediaFiles.filter(f => f.toLowerCase().endsWith('.png')).length,
    'Imagens HEIC': mediaFiles.filter(f => f.toLowerCase().endsWith('.heic')).length,
    'Vídeos MP4': mediaFiles.filter(f => f.toLowerCase().endsWith('.mp4')).length,
  };
  
  Object.entries(types).forEach(([type, count]) => {
    if (count > 0) console.log(`  ${type}: ${count}`);
  });
  
  process.exit(0);
} catch (err) {
  console.error('✗ Erro:', err.message);
  process.exit(1);
}
