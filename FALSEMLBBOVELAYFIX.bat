@echo off
:: Mengubah warna teks dan judul
color 5
title False Overlay Tool Launcher V4.1 (Fix IP)

echo.
echo ====================================================================
echo       INITIALIZING NODE.JS SERVER / MELAKUKAN INISIALISASI SERVER
echo ====================================================================
echo.

:: 1. [DIPERBAIKI] Mencari alamat IPv4 dengan FILTER ANTI-VIRTUALBOX
echo [STEP 1] Finding active IPv4 address (Filtering Virtual Adapters)...
echo [LANGKAH 1] Mencari alamat IPv4 (Mengabaikan VirtualBox/VMware)...

set "IP_ADDRESS="

:: PERUBAHAN UTAMA DI SINI:
:: Kita memfilter InterfaceDescription agar TIDAK mengandung kata-kata virtual.
:: Kita juga memastikan ConnectionProfile-nya adalah IPv4 dan statusnya Up.

for /f "usebackq tokens=*" %%a in (`powershell -Command "Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' -and $_.InterfaceDescription -notmatch 'Virtual|VMware|VBox|VPN|Pseudo|Host-Only' } | Select-Object -ExpandProperty IPv4Address | Select-Object -First 1 -ExpandProperty IPAddress"`) do (
    set IP_ADDRESS=%%a
)

:: Membersihkan spasi
if defined IP_ADDRESS set IP_ADDRESS=%IP_ADDRESS: =%

:: Cek apakah IP berhasil didapatkan
if not defined IP_ADDRESS (
    echo.
    echo [FAILED] No suitable active connection found.
    echo [GAGAL] Tidak ditemukan koneksi Wi-Fi/LAN utama.
    echo.
    echo Penyebab umum:
    echo 1. Anda tidak terhubung ke internet/router.
    echo 2. PowerShell diblokir di komputer ini.
    echo.
    echo Solusi Darurat:
    echo Ketik IP manual anda di 'public/serverip.txt' lalu jalankan server.js manual.
    echo.
    pause
    exit
)

echo [SUCCESS] Main Adapter IP found: %IP_ADDRESS%
echo.

:: 2. Menyimpan IP ke file
echo [STEP 2] Saving IP address to public\serverip.txt...
echo %IP_ADDRESS%> public\serverip.txt

:: 3. Persiapan Server
echo [STEP 3] Starting Server...
timeout /t 2 /nobreak > nul

:: Buka Browser
start http://%IP_ADDRESS%:3000/hub.html

cls

echo =========================================
echo ===========FALSE OVERLAY TOOL=============
echo =========================================
echo.
echo IP DETECTION FIX APPLIED
echo.
echo =========================================
echo Server is running on Port 3000... 
echo Local Access: http://localhost:3000
echo LAN Access  : http://%IP_ADDRESS%:3000
echo.
echo Do not close this window!
echo Jangan tutup jendela ini!
echo =========================================
echo.

:: Jalankan Node
node server.js

if errorlevel 1 (
    echo.
    echo [ERROR] Server failed to start.
    pause
)