/**
 * student-crypto.js  (v3)
 * 학생 PIN 처리 — 해시 파생과 게이트 인증
 *
 * v2에서 달라진 점
 *   1. verifyProofViaGate() 추가 — 이미 만들어 둔 증명값으로 확인합니다.
 *      덕분에 자동 로그인 때 PIN 평문을 브라우저에 보관할 필요가 없습니다.
 *      (v2는 localStorage에 PIN을 그대로 두고 매번 다시 해시했습니다)
 *   2. deriveDeviceFingerprint() 추가 — student_auth 공개 문서에 기기 원본 id를
 *      적지 않습니다. 원본 id는 RTDB 게임에서 '내 기록 이어받기' 판정에 쓰이므로,
 *      공개 문서에 그대로 두면 남의 기록을 가로채는 열쇠가 됩니다.
 *
 * 핵심 두 가지 (v2와 동일)
 *   · PIN 평문을 DB에 저장하지 않습니다. PBKDF2로 늘린 해시만 남깁니다.
 *   · 클라이언트는 그 해시조차 읽지 못합니다. "이 값이 맞나요?"를
 *     보안 규칙에 물어보고 성공/실패만 돌려받습니다.
 *
 * 한계를 먼저 적어 둡니다
 *   4자리 PIN은 경우의 수가 1만 개뿐이라 어떤 방법으로도 '강하게' 만들 수 없습니다.
 *   PBKDF2 10만 회는 한 번 시도에 수백 ms를 걸어, 1초면 끝나던 전수 대입을
 *   수십 분짜리로 바꿉니다. 막는 게 아니라 비싸게 만드는 겁니다.
 *   그래서 해시가 절대 클라이언트로 내려오지 않는 것이 더 중요합니다.
 */

// 반복 횟수. 늘릴수록 안전하지만 학생 기기에서 입장이 느려집니다.
// 저사양 교실 태블릿 기준 0.3~0.8초를 목표로 잡은 값입니다.
export const PBKDF2_ITERATIONS = 100000;

// 다른 서비스에서 같은 PIN을 써도 값이 겹치지 않도록 하는 고정 문자열
const DOMAIN = 'mathdongdong|student-pin|v1';
const DEVICE_DOMAIN = 'mathdongdong|device-fp|v1';

/**
 * crypto.subtle 사용 가능 여부.
 * ★ https 또는 localhost에서만 동작합니다. file://로 열면 실패합니다.
 */
export function isCryptoAvailable() {
    return typeof crypto !== 'undefined'
        && crypto.subtle
        && typeof crypto.subtle.deriveBits === 'function'
        && typeof crypto.subtle.digest === 'function';
}

function toHex(buffer) {
    return [...new Uint8Array(buffer)]
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * PIN + 학생키 → 증명값(64자 hex)
 *
 * 학생키를 솔트로 쓰기 때문에, 같은 PIN을 쓰는 두 학생의 해시가 서로 다릅니다.
 * 한 명을 깨도 다른 학생에게 재사용할 수 없습니다.
 *
 * @param {string} pin        4자리 숫자
 * @param {string} studentKey makeStudentKey(school, studentId)
 */
export async function derivePinProof(pin, studentKey) {
    if (!isCryptoAvailable()) throw new Error('CRYPTO_UNAVAILABLE');

    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey(
        'raw', enc.encode(String(pin ?? '')), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: enc.encode(DOMAIN + '|' + String(studentKey ?? '')),
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256'
        },
        base, 256
    );
    return toHex(bits);
}

/**
 * 기기 id → 공개 문서에 적어도 안전한 지문(16자 hex)
 *
 * PBKDF2가 아니라 단순 SHA-256입니다. 비밀번호가 아니라 임의의 긴 문자열이라
 * 사전 대입이 통하지 않기 때문입니다. 목적은 '원본 id를 숨기는 것' 하나뿐입니다.
 */
export async function deriveDeviceFingerprint(deviceId) {
    if (!isCryptoAvailable()) return 'nofp_' + String(deviceId ?? '').slice(-8);
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256',
        enc.encode(DEVICE_DOMAIN + '|' + String(deviceId ?? '')));
    return toHex(buf).slice(0, 16);
}

/**
 * 이미 만들어 둔 증명값을 게이트에 제출해 맞는지 확인합니다.
 *
 * 동작 원리
 *   student_auth/{key}/gate/{지문} 에 { proof } 를 씁니다.
 *   보안 규칙이 서버에서 private/auth 문서의 pinHash와 비교해,
 *   같을 때만 쓰기를 허용합니다. 규칙의 get()은 클라이언트 읽기 권한과
 *   무관하게 동작하므로, 해시가 브라우저로 내려오는 일이 없습니다.
 *
 * 반환: true(일치) | false(불일치 또는 초기화된 계정)
 * 그 외 오류(네트워크 등)는 그대로 throw 합니다 — "PIN이 틀렸다"와
 * "인터넷이 끊겼다"를 학생에게 같은 말로 안내하면 안 되기 때문입니다.
 *
 * @param {object} deps { db, doc, setDoc, serverTimestamp }
 */
export async function verifyProofViaGate(deps, studentKey, deviceFp, proof) {
    const { db, doc, setDoc, serverTimestamp } = deps;
    try {
        await setDoc(doc(db, 'student_auth', studentKey, 'gate', String(deviceFp)), {
            proof,
            at: serverTimestamp()
        });
        return true;
    } catch (err) {
        const code = String(err?.code || err?.message || '').toLowerCase();
        if (code.includes('permission-denied') || code.includes('permission_denied')) {
            return false;   // 규칙이 거부 = PIN 불일치 (또는 해시가 아직 없음)
        }
        throw err;          // 네트워크·설정 오류는 위로 올립니다
    }
}

/** PIN 평문으로 확인 (사용자가 방금 입력한 경우) */
export async function verifyPinViaGate(deps, studentKey, deviceFp, pin) {
    const proof = await derivePinProof(pin, studentKey);
    return verifyProofViaGate(deps, studentKey, deviceFp, proof);
}

/**
 * 최초 등록 / PIN 재설정용 해시 문서 내용
 * private/auth 문서에 그대로 저장합니다.
 */
export function buildPinRecordFromProof(proof) {
    return {
        pinHash: proof,
        algo: 'PBKDF2-SHA256',
        iterations: PBKDF2_ITERATIONS,
        version: 1
    };
}

export async function buildPinRecord(pin, studentKey) {
    return buildPinRecordFromProof(await derivePinProof(pin, studentKey));
}
