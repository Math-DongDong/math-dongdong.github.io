/**
 * ui-dialog.js  (v1)
 * 사이트 공용 알림 · 확인 · 입력 모달 (Bootstrap 5)
 *
 * 쓰는 곳
 *   · room-auth.js 의 customAlert · customConfirm · customPrompt (모든 게임 · 설문 · 관계지도 · 소감문 입장 화면)
 *   · teacher-auth.js (교사 로그인 · 정보수정 · 회원 탈퇴), 계정 관리, aimath · 아하! 수학 · 작도 페이지, 교사 업무 도구
 *   한 곳만 고치면 사이트 전체 모달의 모양 · 동작이 함께 바뀝니다.
 *
 * 사용법
 *   모듈:      import { uiAlert, uiConfirm, uiPrompt } from '../../js/ui-dialog.js';
 *   일반 스크립트: import('../../js/ui-dialog.js').then(m => m.uiAlert('알림', '내용'));
 *              (교사 로그인 모듈이 불러온 뒤에는 window.uiDialog.alert(...) 로도 쓸 수 있습니다)
 *
 *   uiAlert(title, message, opts)   → 닫히면 끝 (true)
 *   uiConfirm(title, message, opts) → 확인 버튼이면 true, 그 외(취소 · X · 바깥 클릭 · Esc)는 false
 *   uiPrompt(title, message, opts)  → 입력값 문자열, 취소하면 null
 *
 *   opts
 *     type        Bootstrap 색상 (primary · success · danger · warning …) — 제목 글자색 · 확인 버튼 색
 *     confirmText 확인 버튼 글자 (기본 '확인')
 *     cancelText  취소 버튼 글자 (기본 '취소')
 *     html        true면 title · message를 HTML로 넣습니다. ★ 개발자가 쓴 문자열만 — 사용자 입력은 escape 하세요.
 *                 false(기본)면 글자 그대로 넣고 줄바꿈(\n)을 살립니다.
 *     password    (uiPrompt) 비밀번호 칸
 *     defaultValue (uiPrompt) 처음 값
 *     inputFilter (uiPrompt) 입력값을 실시간으로 바꾸는 함수 (예: 영어 대문자만). 한글 조합 중에는 건드리지 않습니다.
 *     inputAttrs  (uiPrompt) 입력칸에 붙일 속성 (예: { maxlength: 4, lang: 'en' })
 *
 * ★ DOM id(customModal · customModalTitle · customModalBody · customModalInput · customModalCancel · customModalConfirm)는
 *   예전 room-auth.js 모달과 같습니다. 설문 · 관계지도 · 소감문 관리 페이지가 이 id로 자기 디자인 CSS를 입힙니다.
 */

let queue = Promise.resolve();   // 모달을 하나씩 순서대로 띄웁니다

function ensureDom() {
    if (document.getElementById('customModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="customModal" tabindex="-1" aria-labelledby="customModalTitle" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content rounded-4 border-0 shadow">
                <div class="modal-header border-0 pb-0">
                    <h5 class="modal-title fw-bold" id="customModalTitle">알림</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="닫기"></button>
                </div>
                <div class="modal-body pb-0" id="customModalBody"></div>
                <div class="modal-footer border-0 pt-3">
                    <button type="button" class="btn btn-secondary rounded-3 px-4 d-none" id="customModalCancel">취소</button>
                    <button type="button" class="btn btn-primary rounded-3 px-4" id="customModalConfirm">확인</button>
                </div>
            </div>
        </div>
    </div>`);

    // 닫힐 때 모달 안에 포커스가 남아 있으면 접근성 경고가 나므로 먼저 놓습니다
    document.getElementById('customModal').addEventListener('hide.bs.modal', function () {
        if (document.activeElement && this.contains(document.activeElement)) document.activeElement.blur();
    });
}

function toPlain(text) {
    return String(text ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
}

function open(mode, title, message, opts = {}) {
    const {
        type = '', confirmText = '확인', cancelText = '취소',
        html = false, password = false, defaultValue = '',
        inputFilter = null, inputAttrs = null
    } = opts;
    const isPrompt = mode === 'prompt';
    const isConfirm = mode === 'confirm';

    // Bootstrap이 없는 환경(불러오기 실패 등)에서는 브라우저 기본창으로 대신합니다
    if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
        const text = `${toPlain(title)}\n${html ? toPlain(message) : String(message ?? '')}`;
        if (isPrompt) return Promise.resolve(window.prompt(text, defaultValue));
        if (isConfirm) return Promise.resolve(window.confirm(text));
        window.alert(text);
        return Promise.resolve(true);
    }

    ensureDom();
    return new Promise((resolve) => {
        const modalEl = document.getElementById('customModal');
        const instance = bootstrap.Modal.getOrCreateInstance(modalEl);
        const titleEl = document.getElementById('customModalTitle');
        const bodyEl = document.getElementById('customModalBody');
        const btnCancel = document.getElementById('customModalCancel');
        const btnConfirm = document.getElementById('customModalConfirm');

        // 제목 · 내용
        if (html) titleEl.innerHTML = title; else titleEl.textContent = String(title ?? '');
        titleEl.className = `modal-title fw-bold${type ? ` text-${type}` : ''}`;
        bodyEl.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'mb-0 fs-5';
        if (html) p.innerHTML = message;
        else { p.textContent = String(message ?? ''); p.style.whiteSpace = 'pre-line'; }
        bodyEl.appendChild(p);

        let input = null;
        if (isPrompt) {
            input = document.createElement('input');
            input.type = password ? 'password' : 'text';
            input.className = 'form-control form-control-lg mt-3 text-center fw-bold';
            input.id = 'customModalInput';
            input.autocomplete = 'off';
            Object.entries(inputAttrs || {}).forEach(([name, value]) => input.setAttribute(name, value));
            input.value = inputFilter ? inputFilter(String(defaultValue)) : defaultValue;
            bodyEl.appendChild(input);
        }

        // 버튼
        btnCancel.textContent = cancelText;
        btnCancel.classList.toggle('d-none', !(isPrompt || isConfirm));
        btnConfirm.textContent = confirmText;
        btnConfirm.className = `btn btn-${type || 'primary'} rounded-3 px-4`;

        let result = isPrompt ? null : (isConfirm ? false : true);
        let settled = false;
        // 열리는 애니메이션 중에는 Bootstrap이 hide()를 무시하므로, 다 열린 뒤에 닫습니다
        let isShown = false, hidePending = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            result = value;
            if (document.activeElement && modalEl.contains(document.activeElement)) document.activeElement.blur();
            if (isShown) instance.hide(); else hidePending = true;
        };
        const onConfirm = () => finish(isPrompt ? (input?.value ?? '') : true);
        const onCancel = () => finish(isPrompt ? null : (isConfirm ? false : true));
        // 한글 조합을 끝내는 Enter는 확인으로 치지 않습니다
        const onKey = (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); onConfirm(); } };
        const onFilter = (e) => {
            if (!inputFilter || e.isComposing) return;
            const filtered = inputFilter(input.value);
            if (filtered !== input.value) input.value = filtered;
        };
        const onShown = () => {
            isShown = true;
            if (hidePending) { instance.hide(); return; }
            if (input) { input.focus(); input.select(); } else btnConfirm.focus();
        };
        const onHidden = () => {
            btnConfirm.removeEventListener('click', onConfirm);
            btnCancel.removeEventListener('click', onCancel);
            if (input) {
                input.removeEventListener('keydown', onKey);
                input.removeEventListener('input', onFilter);
                input.removeEventListener('compositionend', onFilter);
            }
            modalEl.removeEventListener('shown.bs.modal', onShown);
            modalEl.removeEventListener('hidden.bs.modal', onHidden);
            setTimeout(() => resolve(result), 0);
        };

        btnConfirm.addEventListener('click', onConfirm);
        btnCancel.addEventListener('click', onCancel);
        if (input) {
            input.addEventListener('keydown', onKey);
            input.addEventListener('input', onFilter);
            input.addEventListener('compositionend', onFilter);
        }
        modalEl.addEventListener('shown.bs.modal', onShown);
        modalEl.addEventListener('hidden.bs.modal', onHidden);
        instance.show();
    });
}

function enqueue(mode, title, message, opts) {
    const run = () => open(mode, title, message, opts);
    const result = queue.then(run, run);
    queue = result.catch(() => { });
    return result;
}

export const uiAlert = (title, message, opts) => enqueue('alert', title, message, opts);
export const uiConfirm = (title, message, opts) => enqueue('confirm', title, message, opts);
export const uiPrompt = (title, message, opts) => enqueue('prompt', title, message, opts);

if (typeof window !== 'undefined') {
    window.uiDialog = { alert: uiAlert, confirm: uiConfirm, prompt: uiPrompt };
}
