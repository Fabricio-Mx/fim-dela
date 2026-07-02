param(
  [int]$Port = 8080
)

function Get-FreePort {
  param([int]$PreferredPort)

  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $PreferredPort)
    $listener.Start()
    return $listener.LocalEndpoint.Port
  } catch {
    for ($candidate = $PreferredPort + 1; $candidate -lt $PreferredPort + 50; $candidate++) {
      try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $candidate)
        $listener.Start()
        return $listener.LocalEndpoint.Port
      } catch {
        continue
      } finally {
        if ($listener) {
          $listener.Stop()
        }
      }
    }

    throw "Nenhuma porta livre encontrada após tentar $PreferredPort e as próximas 49."
  } finally {
    if ($listener) {
      $listener.Stop()
    }
  }
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$galleryPath = Join-Path $root 'Galeria'
$resolvedPort = Get-FreePort -PreferredPort $Port
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$resolvedPort/")
$listener.Start()

function Write-ResponseBytes {
  param(
    $Context,
    [byte[]]$Bytes
  )

  if ($Context.Request.HttpMethod -eq 'HEAD') {
    return $true
  }

  try {
    $Context.Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
    return $true
  } catch [System.Management.Automation.MethodInvocationException] {
    $innerException = $_.Exception.InnerException
    if ($innerException -is [System.Net.HttpListenerException] -or $innerException -is [System.IO.IOException]) {
      return $false
    }

    throw
  } catch [System.Net.HttpListenerException] {
    return $false
  } catch [System.IO.IOException] {
    return $false
  }
}

function Close-ResponseSafely {
  param($Response)

  try {
    $Response.Close()
  } catch [System.Management.Automation.MethodInvocationException] {
    $innerException = $_.Exception.InnerException
    if ($innerException -isnot [System.Net.HttpListenerException] -and $innerException -isnot [System.IO.IOException]) {
      throw
    }
  } catch [System.Net.HttpListenerException] {
  } catch [System.IO.IOException] {
  }
}

$mimeTypes = @{
  ".aac" = "audio/aac"
  ".css" = "text/css; charset=utf-8"
  ".flac" = "audio/flac"
  ".gif" = "image/gif"
  ".heic" = "image/heic"
  ".heif" = "image/heif"
  ".html" = "text/html; charset=utf-8"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".js" = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".m4a" = "audio/mp4"
  ".mov" = "video/quicktime"
  ".mp3" = "audio/mpeg"
  ".mp4" = "video/mp4"
  ".ogg" = "audio/ogg"
  ".png" = "image/png"
  ".svg" = "image/svg+xml"
  ".wav" = "audio/wav"
}

$audioExtensions = @('.aac', '.flac', '.m4a', '.mp3', '.ogg', '.wav')

Write-Host "Galeria disponivel em http://localhost:$resolvedPort"
Write-Host "Pressione Ctrl+C para encerrar."

try {
  while ($listener.IsListening) {
    try {
      $context = $listener.GetContext()
      $requestPath = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))

      if ([string]::IsNullOrWhiteSpace($requestPath)) {
        $requestPath = 'index.html'
      }

      if ($requestPath -eq 'media-manifest.json') {
        $files = Get-ChildItem -File -Path $galleryPath |
          Sort-Object -Property LastWriteTime, Name -Descending |
          Select-Object -ExpandProperty Name

        $json = [System.Text.Encoding]::UTF8.GetBytes(($files | ConvertTo-Json))
        $context.Response.ContentType = 'application/json; charset=utf-8'
        $context.Response.ContentLength64 = $json.Length
        Write-ResponseBytes -Context $context -Bytes $json | Out-Null
        Close-ResponseSafely -Response $context.Response
        continue
      }

      if ($requestPath -eq 'audio-manifest.json') {
        $audioFiles = @(
          Get-ChildItem -File -Path $root | Where-Object { $audioExtensions -contains $_.Extension.ToLowerInvariant() }
          Get-ChildItem -File -Path $galleryPath | Where-Object { $audioExtensions -contains $_.Extension.ToLowerInvariant() }
        ) |
          Sort-Object -Property LastWriteTime, Name -Descending |
          ForEach-Object {
            $relativePath = $_.FullName.Substring($root.Length).TrimStart('\\').Replace('\\', '/')
            [PSCustomObject]@{
              fileName = $_.Name
              relativePath = $relativePath
            }
          }

        $json = [System.Text.Encoding]::UTF8.GetBytes(($audioFiles | ConvertTo-Json))
        $context.Response.ContentType = 'application/json; charset=utf-8'
        $context.Response.ContentLength64 = $json.Length
        Write-ResponseBytes -Context $context -Bytes $json | Out-Null
        Close-ResponseSafely -Response $context.Response
        continue
      }

      $fullPath = Join-Path $root $requestPath

      if ((Test-Path $fullPath) -and (Get-Item $fullPath) -is [System.IO.DirectoryInfo]) {
        $fullPath = Join-Path $fullPath 'index.html'
      }

      if (-not (Test-Path $fullPath) -or (Get-Item $fullPath) -isnot [System.IO.FileInfo]) {
        $context.Response.StatusCode = 404
        $buffer = [System.Text.Encoding]::UTF8.GetBytes('Arquivo nao encontrado.')
        $context.Response.ContentLength64 = $buffer.Length
        Write-ResponseBytes -Context $context -Bytes $buffer | Out-Null
        Close-ResponseSafely -Response $context.Response
        continue
      }

      $extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
      $context.Response.ContentType = $mimeTypes[$extension]
      if (-not $context.Response.ContentType) {
        $context.Response.ContentType = 'application/octet-stream'
      }

      $bytes = [System.IO.File]::ReadAllBytes($fullPath)
      $context.Response.ContentLength64 = $bytes.Length
      Write-ResponseBytes -Context $context -Bytes $bytes | Out-Null
      Close-ResponseSafely -Response $context.Response
    } catch [System.Net.HttpListenerException] {
      if ($_.Exception.ErrorCode -ne 995 -and $listener.IsListening) {
        throw
      }
    } catch [System.IO.IOException] {
      if ($listener.IsListening) {
        continue
      }
    }
  }
}
finally {
  $listener.Stop()
  $listener.Close()
}