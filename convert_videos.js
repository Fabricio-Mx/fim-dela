#!/usr/bin/env node
/**
 * Converte arquivos .MOV para .mp4 usando ffmpeg-static
 * Uso: node convert_videos.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GALERIA_DIR = path.join(__dirname, 'Galeria');

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function ensureFFmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    log('✓ ffmpeg encontrado no PATH');
    return 'ffmpeg';
  } catch (e) {
    log('✗ ffmpeg não encontrado, tentando instalar ffmpeg-static...');
    try {
      execSync('npm install ffmpeg-static --save-dev', { 
        cwd: __dirname,
        stdio: 'pipe'
      });
      const ffmpegPath = require('ffmpeg-static');
      log(`✓ ffmpeg-static instalado: ${ffmpegPath}`);
      return ffmpegPath;
    } catch (err) {
      log('✗ Falha ao instalar ffmpeg-static: ' + err.message);
      throw err;
    }
  }
}

function convertMOVtoMP4(ffmpegPath, inputFile, outputFile) {
  try {
    const cmd = `"${ffmpegPath}" -i "${inputFile}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -y "${outputFile}"`;
    
    log(`Convertendo: ${path.basename(inputFile)} -> ${path.basename(outputFile)}`);
    execSync(cmd, { stdio: 'pipe' });
    
    // Verifica se o arquivo foi criado
    if (fs.existsSync(outputFile)) {
      const inputSize = fs.statSync(inputFile).size;
      const outputSize = fs.statSync(outputFile).size;
      const ratio = ((outputSize / inputSize) * 100).toFixed(1);
      log(`  ✓ Sucesso! Tamanho: ${(inputSize/1024/1024).toFixed(1)}MB → ${(outputSize/1024/1024).toFixed(1)}MB (${ratio}%)`);
      return true;
    } else {
      log(`  ✗ Arquivo de saída não foi criado`);
      return false;
    }
  } catch (err) {
    log(`  ✗ Erro: ${err.message.split('\n')[0]}`);
    return false;
  }
}

async function main() {
  try {
    log('Iniciando conversão de vídeos MOV para MP4...\n');

    // Garante que ffmpeg está disponível
    const ffmpegPath = ensureFFmpeg();
    log('');

    // Lista arquivos MOV
    if (!fs.existsSync(GALERIA_DIR)) {
      log('✗ Diretório Galeria não encontrado');
      process.exit(1);
    }

    const files = fs.readdirSync(GALERIA_DIR);
    const movFiles = files.filter(f => f.toLowerCase().endsWith('.mov'));

    if (movFiles.length === 0) {
      log('Nenhum arquivo .MOV encontrado');
      process.exit(0);
    }

    log(`Encontrados ${movFiles.length} arquivo(s) .MOV\n`);

    let successCount = 0;
    let failCount = 0;

    for (const movFile of movFiles) {
      const inputPath = path.join(GALERIA_DIR, movFile);
      const baseName = path.basename(movFile, path.extname(movFile));
      const outputPath = path.join(GALERIA_DIR, `${baseName}.mp4`);

      // Pula se o MP4 já existe
      if (fs.existsSync(outputPath)) {
        log(`⊘ Pulando (MP4 já existe): ${movFile}`);
        continue;
      }

      if (convertMOVtoMP4(ffmpegPath, inputPath, outputPath)) {
        successCount++;
      } else {
        failCount++;
      }
    }

    log(`\n=== Resumo ===`);
    log(`Convertidos com sucesso: ${successCount}`);
    log(`Falharam: ${failCount}`);
    
    process.exit(failCount > 0 ? 1 : 0);
  } catch (err) {
    log(`Erro fatal: ${err.message}`);
    process.exit(1);
  }
}

main();
