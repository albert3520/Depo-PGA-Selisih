// ========== Fungsi Deposit ==========
function readCSV(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;

        // Parsing CSV yang mendukung data "1,234"
        const rows = text.split(/\r?\n/).map(line => {
            const regex = /("([^"]|"")*"|[^,]+|),?/g;
            let matches = [...line.matchAll(regex)];
            return matches.map(m => m[1].replace(/^"|"$/g, "").replace(/""/g, '"'));
        });

        callback(rows);
    };
    reader.readAsText(file);
}

function readXLSX(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
        callback(sheet);
    };
    reader.readAsArrayBuffer(file);
}

function extractIdFromDescription(text) {
    if (!text) return "";
    const parts = text.split(" ");
    return parts[parts.length - 1].trim();
}

function processFiles() {
    const file1 = document.getElementById("file1").files[0];
    const file2List = document.getElementById("file2").files;

    if (!file1 || file2List.length === 0) {
        alert("Harap upload File PGA IDN dan File PGA Motion!");
        return;
    }

    // ====== FILE IDN CSV ======
    readCSV(file1, file1Rows => {
        let idnMap = {};

        for (let i = 1; i < file1Rows.length; i++) {
            const row = file1Rows[i];
            const id = row[0];
            const nominal = row[7];
            if (id) idnMap[id.trim()] = nominal ? formatNumber(nominal) : "";
        }

        // ====== FILE MOTION XLSX ======
        let motionMap = {};
        let dateMismatchList = [];   // <= fitur baru
        let filesProcessed = 0;

        for (let f = 0; f < file2List.length; f++) {
            readXLSX(file2List[f], sheet => {

                for (let i = 1; i < sheet.length; i++) {
                    const row = sheet[i];

                    // ====== DATA MOTION ======
                    const desc = row[5];     // kolom F
                    const extractedId = extractIdFromDescription(desc);
                    const nominal = row[14]; // kolom O

                    // ====== CEK TANGGAL ======
                    const tA = row[0];  // Kolom A
                    const tP = row[15]; // Kolom P

                    if (tA && tP) {
                        let dateA = String(tA).split(" ")[0];  // YYYY-MM-DD
                        let dateP = String(tP).split(" ")[0];

                        if (dateA !== dateP) {
                            dateMismatchList.push({
                                id: extractedId || "-",
                                tanggalA: tA,
                                tanggalP: tP
                            });
                        }
                    }

                    // ====== SIMPAN NOMINAL ======
                    if (extractedId) {
                        motionMap[extractedId] = nominal ? formatNumber(nominal) : "";
                    }
                }

                filesProcessed++;

                if (filesProcessed === file2List.length) {
                    compareResults(idnMap, motionMap, dateMismatchList);
                }
            });
        }
    });
}

function compareResults(idnMap, motionMap, dateMismatchList) {

    let onlyInIDN = [];
    let onlyInMotion = [];

    const allIDs = new Set([
        ...Object.keys(idnMap),
        ...Object.keys(motionMap)
    ]);

    allIDs.forEach(id => {
        const nomIDN = idnMap[id];
        const nomMotion = motionMap[id];

        if (nomIDN && !nomMotion) {
            onlyInIDN.push({ id, idn: nomIDN, motion: "-" });

        } else if (!nomIDN && nomMotion) {
            onlyInMotion.push({ id, idn: "-", motion: nomMotion });
        }
    });

    showResult(onlyInIDN, onlyInMotion, dateMismatchList);
}

function showResult(miss1, miss2, dateMismatch) {
    let html = "<h3>Hasil Anomali Deposit</h3>";

    html += "<h4>ID Ada di IDN tapi Tidak Ada di Motion</h4>";
    html += arrayToTable(miss1);

    html += "<h4>ID Ada di Motion tapi Tidak Ada di IDN</h4>";
    html += arrayToTable(miss2);

    // ====== TABEL BARU: TANGGAL TIDAK SAMA ======
    html += "<h4>Perbedaan Tanggal Diproses</h4>";
    html += dateMismatchToTable(dateMismatch);

    document.getElementById("result").innerHTML = html;
}

function arrayToTable(arr) {
    if (arr.length === 0) return "<p><i>Tidak ada</i></p>";

    let html = "<table><tr><th>ID</th><th>IDN</th><th>Motion</th></tr>";
    arr.forEach(a => {
        html += `<tr>
            <td>${a.id}</td>
            <td>${a.idn}</td>
            <td>${a.motion}</td>
        </tr>`;
    });
    html += "</table>";
    return html;
}

function dateMismatchToTable(arr) {
    if (arr.length === 0) return "<p><i>Tidak ada</i></p>";

    let html = "<table><tr><th>ID</th><th>Tanggal Dibuat</th><th>Tanggal Dibayar</th></tr>";

    arr.forEach(a => {
        html += `<tr>
            <td>${a.id}</td>
            <td>${a.tanggalA}</td>
            <td>${a.tanggalP}</td>
        </tr>`;
    });

    html += "</table>";
    return html;
}

function formatNumber(num) {
    if (!num) return "";
    num = String(num).replace(/,/g, "").trim();
    if (num === "" || isNaN(num)) return num;
    return Number(num).toLocaleString("en-US");
}


// ========== Fungsi Withdraw ==========
function processWithdraw() {
    const file1 = document.getElementById("wfile1").files[0];
    const file2 = document.getElementById("wfile2").files;

    if (!file1 || file2.length === 0) {
        alert("Harap upload File Pembukuan dan File PGA Motion!");
        return;
    }

    // ========== BACA FILE 1 (XLSX) ==========
    readXLSX(file1, sheet1 => {
        let idnData = {};

        for (let i = 1; i < sheet1.length; i++) {
            const row = sheet1[i];
            const username = row[2];   // kolom C
            const nominal = row[7];    // kolom H

            if (!username) continue;

            const u = String(username).trim();
            if (u.toLowerCase() === "username") continue; // skip header

            // Bersihkan jadi angka saja
            const clean = String(nominal).replace(/[^0-9]/g, "");
            if (!clean) continue; // jangan masukkan nominal kosong → menghindari 0 bug

            if (!idnData[u]) idnData[u] = [];
            idnData[u].push(Number(clean));
        }

        // ========== BACA FILE 2 (XLSX) ==========
        let motionData = {};
        let processed = 0;

        for (let f = 0; f < file2.length; f++) {
            readXLSX(file2[f], sheet2 => {

                for (let i = 1; i < sheet2.length; i++) {
                    const row = sheet2[i];

                    const desc = row[7];   // kolom H
                    const nominal = row[9]; // kolom J (nominal motion)

                    if (!desc) continue;

                    const firstWord = String(desc).trim().split(" ")[0];
                    if (!firstWord) continue;

                    // Bersihkan nominal
                    const clean2 = String(nominal).replace(/[^0-9]/g, "");
                    if (!clean2) continue;

                    if (!motionData[firstWord]) motionData[firstWord] = [];
                    motionData[firstWord].push(Number(clean2));
                }

                processed++;

                if (processed === file2.length) {
                    compareWithdraw(idnData, motionData);
                }
            });
        }
    });
}

function compareWithdraw(idnData, motionData) {
    let allIDs = new Set([...Object.keys(idnData), ...Object.keys(motionData)]);
    let anomalies = [];

    allIDs.forEach(id => {
        const list1 = idnData[id] || [];
        const list2 = motionData[id] || [];

        if (list1.length !== list2.length) {

            // copy list utk saling hapus nominal yang match
            let temp1 = [...list1];
            let temp2 = [...list2];

            // hapus nominal yg cocok
            for (let i = temp1.length - 1; i >= 0; i--) {
                const idx = temp2.indexOf(temp1[i]);
                if (idx !== -1) {
                    temp1.splice(i, 1);
                    temp2.splice(idx, 1);
                }
            }

            anomalies.push({
                id: id,
                f1: list1.length,
                f2: list2.length,
                missingFromFile2: temp1, // nominal lebih di File1
                missingFromFile1: temp2  // nominal lebih di File2
            });
        }
    });

    showWithdrawResult(anomalies);
}

function showWithdrawResult(list) {
    let html = "<h3>Hasil Anomali Withdraw</h3>";

    if (list.length === 0) {
        html += "<p><i>Tidak ada anomali</i></p>";
        document.getElementById("wresult").innerHTML = html;
        return;
    }

    html += `
    <table>
        <tr>
            <th>ID</th>
            <th>Jumlah di Pembukuan</th>
            <th>Jumlah di Motion</th>
            <th>Nominal lebih di Pembukuan</th>
            <th>Nominal lebih di Motion</th>
        </tr>
    `;

    list.forEach(a => {
        html += `
        <tr>
            <td>${a.id}</td>
            <td>${a.f1}</td>
            <td>${a.f2}</td>
            <td>${a.missingFromFile2.length ? a.missingFromFile2.map(formatNominal).join("<br>") : "-"}</td>
            <td>${a.missingFromFile1.length ? a.missingFromFile1.map(formatNominal).join("<br>") : "-"}</td>
        </tr>
        `;
    });

    html += "</table>";

    document.getElementById("wresult").innerHTML = html;
}

function formatNominal(n) {
    if (!n || isNaN(n)) return "-";
    return Number(n).toLocaleString("en-US"); 
}

// ================= HALAMAN SWITCHER ===================
function showPage(page) {
    document.getElementById("page-deposit").style.display = "none";
    document.getElementById("page-withdraw").style.display = "none";

    if (page === "deposit") {
        document.getElementById("page-deposit").style.display = "block";
    } else {
        document.getElementById("page-withdraw").style.display = "block";
    }
}
// ======================================================

// ========== POPUP HELP ==========
function openHelp() {
    document.getElementById("helpModal").style.display = "block";
}

function closeHelp() {
    document.getElementById("helpModal").style.display = "none";
}

window.onclick = function(event) {
    const modal = document.getElementById("helpModal");
    if (event.target === modal) {
        modal.style.display = "none";
    }
};
