/**
 * room-registry.js  (v1)
 * 모든 앱의 방을 한 곳(Firestore room_registry)에 적어 두는 목록
 *
 * ─────────────────────────────────────────────────────────────────────
 *  왜 만들었나
 *
 *  방은 앱마다 다른 Firestore 컬렉션·RTDB 데이터베이스에 흩어져 있습니다.
 *  선생님이 학교를 바꿀 때 이전 학교로 만든 방을 지우려면 그 위치를 전부 알아야 하는데,
 *  앱이 늘 때마다 목록을 손으로 고치면 언젠가 빠뜨립니다.
 *  그래서 방을 만들 때 '어디에 무엇을 만들었는지'를 여기에 함께 적고,
 *  지울 때는 이 목록만 읽습니다.
 *
 *  · game-kit의 firestoreRoom()·rtdbRoom()으로 만든 방은 자동으로 등록됩니다.
 *  · 방을 직접 만드는 페이지(설문·관계지도·블로토)는 registerRoom()/unregisterRoom()을 부릅니다.
 *  · 등록에 실패해도 방 만들기는 막지 않습니다 (규칙 배포 전에도 게임은 돌아가야 합니다).
 * ─────────────────────────────────────────────────────────────────────
 *
 *  parts — 방 하나를 이루는 저장 위치 (적힌 순서대로 지웁니다)
 *    { fs: '컬렉션', subs: ['students', ...] }          Firestore {컬렉션}/{코드} 문서 + 하위 컬렉션
 *      + storage: '폴더'                                  (선택) Storage {폴더}/{코드} 아래 파일 — Firestore보다 먼저 지웁니다
 *    { rtdb: 'https://…', paths: ['rooms', 'room_index'] }  RTDB {경로}/{코드}
 */
import { app, db, auth } from './firebase-config.js';
import {
    collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getDatabase, ref, remove } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

export const REGISTRY_COLLECTION = 'room_registry';

/** 유형 A 게임 방의 하위 컬렉션 (game-kit firestoreRoom 기본값) */
export const GAME_SUBS = ['students', 'records', 'nicknames', 'guests'];

/** RTDB 인스턴스의 주소 — 목록에는 인스턴스 대신 이 문자열을 적습니다. */
export function rtdbUrl(rtdb) {
    return ref(rtdb).toString();
}

/** 문서 ID — 첫 번째 저장 위치 + 방 코드. 같은 방은 늘 같은 ID라 다시 등록해도 겹치지 않습니다. */
function registryId(code, parts) {
    const first = parts[0] || {};
    const store = first.fs || `${new URL(first.rtdb).hostname.split('.')[0]}.${first.paths[0]}`;
    return `${store}__${code}`;
}

/**
 * 방 등록. 방을 만든 직후에 부릅니다.
 * @param {object} info { creatorSchool, memo }
 */
export async function registerRoom(code, parts, { creatorSchool = '', memo = '' } = {}) {
    const uid = auth.currentUser?.uid;
    if (!uid || !code || !parts?.length) return;
    try {
        await setDoc(doc(db, REGISTRY_COLLECTION, registryId(code, parts)), {
            code,
            parts,
            createdBy: uid,
            creatorSchool: String(creatorSchool || '').trim(),
            memo: String(memo || '').slice(0, 40),
            createdAt: serverTimestamp()
        });
    } catch (e) {
        console.warn('[room-registry] 방 목록 등록 실패:', e);
    }
}

/** 방 등록 해제. 방을 지운 직후에 부릅니다 (목록에 없던 옛 방이어도 괜찮습니다). */
export async function unregisterRoom(code, parts) {
    if (!code || !parts?.length) return;
    try {
        await deleteDoc(doc(db, REGISTRY_COLLECTION, registryId(code, parts)));
    } catch (e) {
        console.warn('[room-registry] 방 목록 해제 실패:', e);
    }
}

/**
 * 방 하나를 저장 위치마다 지웁니다.
 * ★ Firestore는 하위 컬렉션 → 방 문서 순서입니다 (하위 규칙이 방 문서를 읽습니다).
 * ★ 방 문서가 없는 위치(이름표만 두는 유형 D)도 있어, 있을 때만 지웁니다.
 * ★ Storage 파일은 규칙이 방 문서로 소유자를 확인하므로 Firestore보다 먼저 지웁니다.
 */
export async function purgeRoomParts(code, parts) {
    for (const part of parts || []) {
        if (part.storage) {
            const { deleteStorageFolder } = await import('./firebase-storage.js');
            await deleteStorageFolder(`${part.storage}/${code}`);
        }
        if (part.fs) {
            for (const sub of part.subs || []) {
                const snap = await getDocs(collection(db, part.fs, code, sub));
                await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
            }
            const roomRef = doc(db, part.fs, code);
            if ((await getDoc(roomRef)).exists()) await deleteDoc(roomRef);
        } else if (part.rtdb) {
            const rtdb = getDatabase(app, part.rtdb);
            for (const path of part.paths || []) await remove(ref(rtdb, `${path}/${code}`));
        }
    }
}

/** 지금 로그인한 선생님이 만든 방 목록 */
export async function findMyRooms() {
    const uid = auth.currentUser?.uid;
    if (!uid) return [];
    const snap = await getDocs(query(collection(db, REGISTRY_COLLECTION), where('createdBy', '==', uid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * 목록의 방을 차례로 지웁니다. 중간에 실패하면 그 자리에서 멈춥니다.
 * 이미 지운 방은 목록에서도 빠지므로 다시 부르면 남은 방만 지웁니다.
 * @param {Function} onProgress (done, total) => void
 */
export async function purgeRooms(entries, onProgress) {
    for (let i = 0; i < entries.length; i++) {
        await purgeRoomParts(entries[i].code, entries[i].parts);
        await deleteDoc(doc(db, REGISTRY_COLLECTION, entries[i].id));
        if (typeof onProgress === 'function') onProgress(i + 1, entries.length);
    }
}
