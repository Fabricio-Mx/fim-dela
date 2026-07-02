#!/usr/bin/env python3
"""
Converte todos os arquivos .MOV em Galeria/ para .mp4
Requer ffmpeg instalado no PATH do sistema ou moviepy
"""
import os
import subprocess
import sys
from pathlib import Path

def convert_mov_to_mp4_ffmpeg(input_path, output_path):
    """Converte MOV para MP4 usando ffmpeg"""
    try:
        cmd = [
            'ffmpeg',
            '-i', str(input_path),
            '-c:v', 'libx264',       # H.264 codec
            '-preset', 'fast',       # velocidade
            '-crf', '23',            # qualidade (0-51, 23 é default)
            '-c:a', 'aac',           # áudio AAC
            '-b:a', '128k',          # bitrate áudio
            '-y',                    # overwrite sem perguntar
            str(output_path)
        ]
        print(f"Convertendo {input_path.name} -> {output_path.name}...")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode == 0:
            print(f"  ✓ Sucesso: {output_path.name}")
            return True
        else:
            print(f"  ✗ Erro: {result.stderr}")
            return False
    except FileNotFoundError:
        print("ffmpeg não encontrado. Tentando moviepy...")
        return False
    except Exception as e:
        print(f"  ✗ Erro ao converter: {e}")
        return False

def convert_mov_to_mp4_moviepy(input_path, output_path):
    """Alternativa: converte MOV para MP4 usando moviepy"""
    try:
        from moviepy.editor import VideoFileClip
        print(f"Convertendo (moviepy) {input_path.name} -> {output_path.name}...")
        clip = VideoFileClip(str(input_path))
        clip.write_videofile(str(output_path), verbose=False, logger=None)
        clip.close()
        print(f"  ✓ Sucesso: {output_path.name}")
        return True
    except ImportError:
        print("moviepy não instalado. Execute: pip install moviepy")
        return False
    except Exception as e:
        print(f"  ✗ Erro ao converter: {e}")
        return False

def main():
    galeria_dir = Path("Galeria")
    if not galeria_dir.exists():
        print("Erro: Diretório 'Galeria' não encontrado")
        return False
    
    mov_files = list(galeria_dir.glob("*.MOV")) + list(galeria_dir.glob("*.mov"))
    if not mov_files:
        print("Nenhum arquivo .MOV encontrado em Galeria/")
        return True
    
    print(f"Encontrados {len(mov_files)} arquivo(s) MOV\n")
    
    success_count = 0
    failed_count = 0
    
    for mov_file in mov_files:
        mp4_file = mov_file.with_suffix(".mp4")
        
        # Tenta ffmpeg primeiro
        if convert_mov_to_mp4_ffmpeg(mov_file, mp4_file):
            success_count += 1
        else:
            # Tenta moviepy como alternativa
            if convert_mov_to_mp4_moviepy(mov_file, mp4_file):
                success_count += 1
            else:
                failed_count += 1
    
    print(f"\n=== Resumo ===")
    print(f"Convertidos com sucesso: {success_count}")
    print(f"Falharam: {failed_count}")
    
    return failed_count == 0

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
