/**
 * 이미지 행렬 및 픽셀 데이터 처리를 위한 공통 유틸리티 모듈
 */

// 1. 2차원 배열을 HTML 테이블로 변환 (과부하 방지를 위해 최대치 설정)
function renderMatrixToTable(matrix, containerId, maxRows = 50, maxCols = 50) {
    const container = document.getElementById(containerId);
    let html = '<table class="table table-matrix table-striped table-hover mb-0"><tbody>';

    const rCount = Math.min(matrix.length, maxRows);
    const cCount = matrix.length > 0 ? Math.min(matrix[0].length, maxCols) : 0;

    for (let r = 0; r < rCount; r++) {
        html += '<tr>';
        for (let c = 0; c < cCount; c++) {
            html += `<td>${matrix[r][c]}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';

    // 데이터가 너무 많을 경우 하단에 안내 메시지 추가
    if (matrix.length > maxRows || (matrix[0] && matrix[0].length > maxCols)) {
        html += `<div class="text-center text-muted small p-2 bg-light border-top">데이터가 너무 커서 좌상단 ${rCount}x${cCount} 영역만 표시됩니다.</div>`;
    }
    container.innerHTML = html;
}

// 2. 2차원 그레이스케일 배열을 캔버스에 픽셀로 그리기
function renderMatrixToCanvas(matrix, canvasId) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');
    const rows = matrix.length;
    const cols = matrix[0].length;

    canvas.width = cols;
    canvas.height = rows;

    const imgData = ctx.createImageData(cols, rows);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            // 값 제한(Clipping)
            let val = Math.round(matrix[r][c]);
            if (val < 0) val = 0;
            if (val > 255) val = 255;

            const idx = (r * cols + c) * 4;
            imgData.data[idx] = val;     // R
            imgData.data[idx + 1] = val; // G
            imgData.data[idx + 2] = val; // B
            imgData.data[idx + 3] = 255; // Alpha
        }
    }
    ctx.putImageData(imgData, 0, 0);
}

// 3. 엑셀 파일을 읽어 2차원 배열로 반환하는 Promise 함수
function readExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            // header: 1 옵션으로 2차원 배열 형태로 추출
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: 0 });
            resolve(json);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}