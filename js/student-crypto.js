/**
 * student-crypto.js
 * 학생 PIN 처리 — 해시 파생과 게이트 인증
 *
 * 핵심 두 가지
 *   1. PIN 평문을 DB에 저장하지 않습니다. PBKDF2로 늘린 해시(proof)만 남깁니다.
 *   2. 클라이언트는 그 해시조차 읽지 못합니다. "이 값이 맞나요?"를
 *      보안 규칙에 물어보고 성공/실패만 돌려받습니다.
 *
 * 왜 이렇게까지 하나
 *   예전에는 클라이언트가 student_auth 문서를 통째로 받아 PIN을 비교했습니다.
 *   화면에는 "인증 실패"만 떴지만 PIN은 이미 브라우저 메모리에 들어와 있었고,
 *   F12로 중단점만 걸면 그대로 보였습니다. 규칙으로는 막을 수 없는 구조였습니다.
 *
 * 한계를 먼저 적어 둡니다
 *   4자리 PIN은 경우의 수가 1만 개뿐이라 어떤 방법으로도 '강하게' 만들 수 없습니다.
 *   PBKDF2 10만 회는 한 번 시도에 수백 ms를 걸어, 1초면 끝나던 전수 대입을
 *   수십 분짜리로 바꿉니다. 막는 게 아니라 비싸게 만드는 겁니다.
 */

// 반복 횟수. 늘릴수록 안전하지만 학생 기기에서 입장이 느려집니다.
// 저사양 교실 태블릿 기준 0.3~0.8초를 목표로 잡은 값입니다.
export const PBKDF2_ITERATIONS = 100000;

// 다른 서비스에서 같은 PIN을 써도 값이 겹치지 않도록 하는 고정 문자열
const DOMAIN = 'mathdongdong|student-pin|v1';

/**
 * crypto.subtle 사용 가능 여부.
 * ★ https 또는 localhost에서만 동작합니다. file://로 열면 실패합니다.
 */
export function isCryptoAvailable() {
    return typeof crypto !== 'undefined'
        && crypto.subtle
        && typeof crypto.subtle.deriveBits === 'function';
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
    if (!isCryptoAvailable()) {
        throw new Error('CRYPTO_UNAVAILABLE');
    }
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
 * 게이트에 PIN을 제출해 맞는지 확인합니다.
 *
 * 동작 원리
 *   student_auth/{key}/gate/{기기id} 에 { proof } 를 씁니다.
 *   보안 규칙이 서버에서 private/auth 문서의 pinHash와 비교해,
 *   같을 때만 쓰기를 허용합니다. 규칙의 get()은 클라이언트 읽기 권한과
 *   무관하게 동작하므로, 해시가 브라우저로 내려오는 일이 없습니다.
 *
 * 반환: true(일치) | false(불일치)
 * 그 외 오류(네트워크 등)는 그대로 throw 합니다 — "PIN이 틀렸다"와
 * "인터넷이 끊겼다"를 학생에게 같은 말로 안내하면 안 되기 때문입니다.
 *
 * @param {object} deps { db, doc, setDoc, serverTimestamp }
 */
export async function verifyPinViaGate(deps, studentKey, deviceId, pin) {
    const { db, doc, setDoc, serverTimestamp } = deps;
    const proof = await derivePinProof(pin, studentKey);
    try {
        await setDoc(doc(db, 'student_auth', studentKey, 'gate', String(deviceId)), {
            proof,
            at: serverTimestamp()
        });
        return true;
    } catch (err) {
        const code = String(err?.code || err?.message || '').toLowerCase();
        if (code.includes('permission-denied') || code.includes('permission_denied')) {
            return false;   // 규칙이 거부 = PIN 불일치
        }
        throw err;          // 네트워크·설정 오류는 위로 올립니다
    }
}

/**
 * 최초 등록 / PIN 재설정용 해시 문서 내용
 * private/auth 문서에 그대로 저장합니다.
 */
export async function buildPinRecord(pin, studentKey) {
    return {
        pinHash: await derivePinProof(pin, studentKey),
        algo: 'PBKDF2-SHA256',
        iterations: PBKDF2_ITERATIONS,
        version: 1
    };
}