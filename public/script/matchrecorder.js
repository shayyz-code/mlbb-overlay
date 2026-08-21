// script/matchrecorder.js

async function handleSaveDraft(buttonElement) {
    // Simpan teks & warna asli tombol untuk feedback visual
    const originalText = buttonElement.innerText;
    const originalColor = buttonElement.style.color;
    const originalBorder = buttonElement.style.borderColor;

    // Ubah status tombol jadi "Saving..."
    buttonElement.innerText = "SAVING...";
    buttonElement.disabled = true;
    buttonElement.style.color = "yellow";
    buttonElement.style.borderColor = "yellow";
    buttonElement.style.cursor = "wait";

    try {
        const response = await fetch('/api/save-match-record', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            // Sukses
            buttonElement.innerText = "SAVED!";
            buttonElement.style.color = "#00FF8C"; // Hijau cerah
            buttonElement.style.borderColor = "#00FF8C";
            console.log("Match data successfully archived.");
        } else {
            // Gagal dari server
            buttonElement.innerText = "ERROR";
            buttonElement.style.color = "red";
            buttonElement.style.borderColor = "red";
            console.error("Server failed to archive match data.");
        }

    } catch (error) {
        // Error koneksi/jaringan
        console.error("Network error:", error);
        buttonElement.innerText = "NET ERR";
        buttonElement.style.color = "red";
        buttonElement.style.borderColor = "red";
    }

    // Kembalikan tombol ke kondisi semula setelah 2 detik
    setTimeout(() => {
        buttonElement.innerText = originalText;
        buttonElement.style.color = originalColor;
        buttonElement.style.borderColor = originalBorder;
        buttonElement.disabled = false;
        buttonElement.style.cursor = "pointer";
    }, 2000);
}