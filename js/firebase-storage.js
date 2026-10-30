/**
 * firebase-storage.js
 * Firebase Storage 연결 + 폴더 삭제 도우미
 *
 *  · 파일 첨부를 쓰는 페이지(설문조사 Form)만 불러옵니다.
 *    firebase-config.js에 넣지 않은 이유: 모든 페이지가 Storage SDK를 내려받지 않도록 하기 위해서입니다.
 *  · 보안 규칙(Storage › Rules)은 custom_forms/{방코드}/{학번}/{문항ID}/{슬롯} 경로만 허용합니다.
 */
import { app } from './firebase-config.js';
import { getStorage, ref, listAll, deleteObject } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";

const storage = getStorage(app);

/**
 * 폴더(접두어) 아래의 모든 파일을 하위 폴더까지 지웁니다.
 * ★ 규칙이 Firestore 방 문서로 소유자를 확인하므로, 방 문서를 지우기 전에 불러야 합니다.
 */
async function deleteStorageFolder(path) {
    const { items, prefixes } = await listAll(ref(storage, path));
    await Promise.all(items.map(item => deleteObject(item)));
    for (const prefix of prefixes) await deleteStorageFolder(prefix.fullPath);
}

export { storage, deleteStorageFolder };
