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
    let html = "<h3>Hasil Perbandingan</h3>";

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
