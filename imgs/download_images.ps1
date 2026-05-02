# 图片相对路径列表
$imagePaths = @(
  "./image/IMSB.png",
  "./image/BOSS.png",
  "./image/MUM.png",
  "./image/FAKE.png",
  "./image/Dior-s.jpg",
  "./image/DEAD.png",
  "./image/ZZZZ.png",
  "./image/GOGO.png",
  "./image/FUCK.png",
  "./image/CTRL.png",
  "./image/HHHH.png",
  "./image/SEXY.png",
  "./image/OJBK.png",
  "./image/JOKE-R.jpg",
  "./image/POOR.png",
  "./image/OH-NO.png",
  "./image/MONK.png",
  "./image/SHIT.png",
  "./image/THAN-K.png",
  "./image/MALO.png",
  "./image/ATM-er.png",
  "./image/THIN-K.png",
  "./image/SOLO.png",
  "./image/LOVE-R.png",
  "./image/WOC!.png",
  "./image/DRUNK.png",
  "./image/IMFW.png"
)

# 基础URL
$baseUrl = "https://03-06.cn"

# 下载目录
$downloadDir = "c:\Users\Administrator\Desktop\imgs"

# 创建下载目录（如果不存在）
if (-not (Test-Path $downloadDir)) {
    New-Item -ItemType Directory -Path $downloadDir -Force
}

# 下载每张图片
foreach ($path in $imagePaths) {
    # 构建完整URL
    $fullUrl = $baseUrl + $path.Substring(1)  # 移除开头的点
    
    # 提取文件名
    $fileName = Split-Path $path -Leaf
    
    # 下载路径
    $downloadPath = Join-Path $downloadDir $fileName
    
    try {
        Write-Host "正在下载: $fullUrl"
        Invoke-WebRequest -Uri $fullUrl -OutFile $downloadPath -ErrorAction Stop
        Write-Host "下载完成: $fileName"
    } catch {
        Write-Host "下载失败: $fileName - $($_.Exception.Message)"
    }
}

Write-Host "所有图片下载完成！"