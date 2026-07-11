/**
 * matchstick.js
 * 성냥개비 퍼즐 보드게임의 드로잉 캔버스 및 게임 진행 로직을 담당하는 스크립트
 */

document.addEventListener('DOMContentLoaded', () => {
    // 성냥개비 퍼즐 이미지 목록 생성 (1.PNG ~ 52.PNG)
    const originalProblems = [];
    for (let i = 1; i <= 52; i++) {
        originalProblems.push(`../../assets/images/matchstickpuzzle/${i}.PNG`);
    }

    let problemPool = [];      
    let solvedCount = 0;
    let unknownCount = 0;
    let currentProblemUrl = null;

    // DOM 요소 가져오기
    const gameSection = document.getElementById('game-section');
    const endSection = document.getElementById('end-section');
    
    const totalCntEl = document.getElementById('total-cnt');
    const solvedCntEl = document.getElementById('solved-cnt');
    const unknownCntEl = document.getElementById('unknown-cnt');
    const remainCntEl = document.getElementById('remain-cnt');

    // 캔버스 요소 및 컨텍스트 초기화
    const canvas = document.getElementById('drawCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    let drawing = false;
    let startX = 0, startY = 0;
    let lastX = 0, lastY = 0;
    let currentTool = 'line';
    let savedImageData = null;

    /**
     * 배열을 랜덤하게 섞는 셔플 함수
     */
    function shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    /**
     * 게임 재시작 함수
     */
    window.restartGame = function() {
        problemPool = [...originalProblems];
        shuffle(problemPool);
        solvedCount = 0;
        unknownCount = 0;
        
        endSection.classList.add('d-none');
        gameSection.classList.remove('d-none');

        nextProblem();
    };

    /**
     * 다음 문제로 넘어가는 함수
     */
    function nextProblem() {
        if (problemPool.length === 0) {
            gameSection.classList.add('d-none');
            endSection.classList.remove('d-none');
            return;
        }

        currentProblemUrl = problemPool.shift();
        
        // 배경 이미지 설정
        canvas.style.backgroundImage = `url('${encodeURI(currentProblemUrl)}')`;
        clearCanvas(); 
        updateDashboard();
    }

    /**
     * 문제를 해결했을 때 호출되는 함수
     */
    window.markSolved = function() {
        solvedCount++;
        nextProblem();
    };

    /**
     * 나중에 풀기 버튼을 눌렀을 때 호출되는 함수 (문제를 섞어서 다시 풀이에 투입)
     */
    window.markUnknown = function() {
        unknownCount++;
        problemPool.push(currentProblemUrl);
        shuffle(problemPool); 
        nextProblem();
    };

    /**
     * 대시보드 스코어 업데이트 함수
     */
    function updateDashboard() {
        totalCntEl.innerText = originalProblems.length;
        solvedCntEl.innerText = solvedCount;
        unknownCntEl.innerText = unknownCount;
        remainCntEl.innerText = problemPool.length + 1; 
    }

    /**
     * 그리기 도구 설정 함수
     */
    window.setTool = function(tool) {
        currentTool = tool;
        
        // 모든 툴 버튼 비활성화 상태로 스타일 변경
        ['line', 'pen', 'eraser'].forEach(t => {
            const btn = document.getElementById('btn-' + t);
            if (btn) {
                btn.classList.remove('btn-primary', 'text-white');
                btn.classList.add('btn-outline-secondary');
            }
        });
        
        // 선택한 툴 버튼 활성화 스타일 변경
        const activeBtn = document.getElementById('btn-' + tool);
        if (activeBtn) {
            activeBtn.classList.remove('btn-outline-secondary');
            activeBtn.classList.add('btn-primary', 'text-white');
        }
    };

    // 초기 그리기 도구 설정
    setTool('line');

    /**
     * 마우스/터치 위치를 고해상도 캔버스 좌표로 변환하는 함수
     */
    function setPosition(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        let clientX = e.clientX;
        let clientY = e.clientY;

        // 터치 이벤트 대응
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }

        return { 
            x: (clientX - rect.left) * scaleX, 
            y: (clientY - rect.top) * scaleY 
        };
    }

    /**
     * 그리기를 시작하는 이벤트 핸들러
     */
    function startDraw(e) {
        drawing = true;
        const pos = setPosition(e);
        startX = pos.x; startY = pos.y;
        lastX = pos.x; lastY = pos.y;

        // 직선 그리기일 경우 이전 캔버스 상태 저장
        if (currentTool === 'line') {
            savedImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
    }

    /**
     * 마우스/터치를 움직이는 동안 그리는 이벤트 핸들러
     */
    function draw(e) {
        if (!drawing) return;
        e.preventDefault(); // 스크롤 등 기본 동작 방지
        const pos = setPosition(e);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (currentTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = 50; 
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
            lastX = pos.x; lastY = pos.y;
            
        } else if (currentTool === 'pen') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)'; // 반투명 빨간색 자유선
            ctx.lineWidth = 12;
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
            lastX = pos.x; lastY = pos.y;
            
        } else if (currentTool === 'line') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = '#2563eb'; // 파란색 직선
            ctx.lineWidth = 15;
            
            ctx.putImageData(savedImageData, 0, 0); // 직선을 그릴 때 실시간 잔상 초기화
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        }
    }

    /**
     * 그리기 완료 핸들러
     */
    function stopDraw() { 
        drawing = false; 
    }

    /**
     * 캔버스 초기화 함수
     */
    window.clearCanvas = function() { 
        ctx.clearRect(0, 0, canvas.width, canvas.height); 
    };

    // 이벤트 리스너 추가 (마우스)
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseout', stopDraw);
    
    // 이벤트 리스너 추가 (터치 - 모바일)
    canvas.addEventListener('touchstart', startDraw, {passive: false});
    canvas.addEventListener('touchmove', draw, {passive: false});
    canvas.addEventListener('touchend', stopDraw);
    canvas.addEventListener('touchcancel', stopDraw);

    // 게임 시작
    restartGame();
});
