@echo off
:: Mengubah warna teks di seluruh jendela command prompt menjadi ungu
color 5

:: Memberi judul pada jendela
title False Overlay Tool Launcher

echo.
echo ====================================================================
echo      INITIALIZING NODE.JS SERVER / MELAKUKAN INISIALISASI SERVER
echo ====================================================================
echo.

:: 1. [DIPERBAIKI] Mencari alamat IPv4 dari adapter UTAMA (Wi-Fi/LAN)
echo [STEP 1] Finding active IPv4 address (Wi-Fi/Ethernet)...
echo [LANGKAH 1] Mencari alamat IPv4 dari koneksi utama...

:: Kita set IP_ADDRESS kosong dulu
set "IP_ADDRESS="

:: Perintah PowerShell ini mencari adapter yang Statusnya 'Up' DAN memiliki Default Gateway (koneksi ke Router)
:: Ini otomatis mengabaikan VMWare/VirtualBox karena biasanya mereka tidak punya Default Gateway aktif yang sama.
for /f "usebackq tokens=*" %%a in (`powershell -Command "Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -ExpandProperty IPv4Address | Select-Object -First 1 -ExpandProperty IPAddress"`) do (
    set IP_ADDRESS=%%a
)

:: Membersihkan spasi jika ada
if defined IP_ADDRESS set IP_ADDRESS=%IP_ADDRESS: =%

:: Cek apakah IP berhasil didapatkan
if not defined IP_ADDRESS (
    echo.
    echo [FAILED] No active Wi-Fi or Ethernet connection found.
    echo [GAGAL] Tidak ditemukan koneksi Wi-Fi atau LAN yang aktif ke Router.
    echo.
    echo Troubleshooting:
    echo 1. Pastikan internet/wifi tersambung.
    echo 2. Pastikan tidak sedang mode pesawat.
    pause
    exit
)

echo [SUCCESS] Main Adapter IP found: %IP_ADDRESS% / [BERHASIL] IP Utama ditemukan: %IP_ADDRESS%
echo.

:: 2. Menimpa (replace) teks di dalam file /public/serverip.txt
echo [STEP 2] Saving IP address to public\serverip.txt... / [LANGKAH 2] Menyimpan alamat IP ke file...
echo %IP_ADDRESS%> public\serverip.txt
echo [SUCCESS] File has been updated. / [BERHASIL] File telah diperbarui.
echo.

:: Menambahkan jeda singkat agar server punya waktu untuk siap sebelum browser dibuka
echo Pausing for 2 seconds before opening browser... / Memberi jeda 2 detik...
timeout /t 2 /nobreak > nul

:: 4. Membuka URL di browser (PORT 3000)
echo [STEP 4] Opening URL in the default browser... / [LANGKAH 4] Membuka URL di browser...
start http://%IP_ADDRESS%:3000/hub.html
echo.
echo Initialization complete. Clearing screen and starting server...
echo Inisialisasi selesai. Membersihkan layar dan menjalankan server...
timeout /t 2 /nobreak > nul

:: =================================================================
:: == MEMBERSIHKAN LAYAR & MENJALANKAN SERVER ==
:: =================================================================

cls

echo =========================================
echo ===========FALSE OVERLAY TOOL=============
echo =========================================
echo.
echo Please Read the readme ^| Tolong baca readme
echo.
echo =========================================
echo Server is running on Port 3000... 
echo Local Access: http://localhost:3000
echo LAN Access  : http://%IP_ADDRESS%:3000
echo.
echo Do not close this window!
echo Server sedang berjalan... Jangan tutup jendela ini!
echo =========================================
echo.

:: 3. Menjalankan server Node.js
node server.js

:: Cek jika Node.js error
if errorlevel 1 (
    echo.
    echo =========================================
    echo [ERROR] Server failed to start.
    echo [GALAT] Server gagal dijalankan.
    echo.
    echo Check if Node.js is installed or Port 3000 is in use.
    echo =========================================
    echo.
    pause
)