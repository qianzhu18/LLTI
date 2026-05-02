@echo off

rem 图片列表
set "images=image/IMSB.png image/BOSS.png image/MUM.png image/FAKE.png image/Dior-s.jpg image/DEAD.png image/ZZZZ.png image/GOGO.png image/FUCK.png image/CTRL.png image/HHHH.png image/SEXY.png image/OJBK.png image/JOKE-R.jpg image/POOR.png image/OH-NO.png image/MONK.png image/SHIT.png image/THAN-K.png image/MALO.png image/ATM-er.png image/THIN-K.png image/SOLO.png image/LOVE-R.png image/WOC!.png image/DRUNK.png image/IMFW.png"

rem 基础URL
set "baseUrl=https://03-06.cn/"

rem 下载每张图片
for %%i in (%images%) do (
    echo 正在下载: %baseUrl%%%i
    curl -o "%%~nxi" "%baseUrl%%%i"
    if %errorlevel% equ 0 (
        echo 下载完成: %%~nxi
    ) else (
        echo 下载失败: %%~nxi
    )
    echo.
)

echo 所有图片下载完成！
pause