/**
 * teacher-cleanup.js  (v1)
 * 교사가 만든 방과 담당 학생 정리 — 두 곳이 함께 씁니다.
 *   · 관리자가 계정 관리에서 교사를 삭제할 때   (pages/admin/account_manager.html)
 *   · 교사 본인이 정보수정에서 회원 탈퇴할 때    (js/teacher-auth.js — 탈퇴할 때만 불러옵니다)
 *
 * 정리 내용
 *   · 방: room_registry 에서 createdBy == uid 인 방을 저장 위치마다 지웁니다 (room-registry.js의 purgeRoomParts)
 *   · 학생: 같은 학교 + 담당 선생님(teachers)에 이 교사 이름
 *       - 담당 선생님이 이 교사뿐이면 학생 정보를 모두 지웁니다 (PIN · 기기 인증 포함)
 *       - 다른 담당 선생님이 있으면 담당 선생님 목록에서 이름만 뺍니다
 *
 * ★ 담당 선생님은 이름으로 저장됩니다. 같은 학교에 같은 이름의 승인 교사가 또 있으면
 *   다른 선생님의 학생을 건드리지 않도록 학생 정리를 건너뜁니다 (plan.nameConflict).
 * ★ 권한: 관리자는 모두 정리할 수 있고, 승인 교사는 자기 방 · 자기 학생만 정리할 수 있습니다 (보안 규칙).
 *   승인 전(pending) 교사는 방 목록 · 학생 목록을 읽을 수 없으므로 부르지 마세요 — 만든 방도 학생도 없습니다.
 */
import { db } from './firebase-config.js';
import {
    collection, doc, getDoc, getDocs, deleteDoc, updateDoc, query, where, arrayRemove, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { REGISTRY_COLLECTION, purgeRoomParts } from './room-registry.js';
import { purgeStudent } from './room-auth.js?v=4.3';   // 다른 페이지와 같은 버전 (모듈을 한 번만 불러오도록)

/**
 * 정리 대상 수집 → { uid, name, school, rooms, studentsToDelete, studentsToDetach, nameConflict }
 */
export async function collectTeacherCleanupPlan(uid) {
    const teacherSnap = await getDoc(doc(db, "teachers", uid));
    const data = teacherSnap.exists() ? (teacherSnap.data() || {}) : {};
    const name = String(data.name || '').trim();
    const school = String(data.school || '').trim();

    const roomSnap = await getDocs(query(collection(db, REGISTRY_COLLECTION), where('createdBy', '==', uid)));
    const rooms = roomSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const plan = { uid, name, school, rooms, studentsToDelete: [], studentsToDetach: [], nameConflict: false };
    if (!name || !school) return plan;

    const sameNameSnap = await getDocs(query(collection(db, "teacher_directory"),
        where("school", "==", school), where("name", "==", name)));
    plan.nameConflict = sameNameSnap.docs.some(d => d.id !== uid);
    if (plan.nameConflict) return plan;

    const studentSnap = await getDocs(query(collection(db, "student_auth"),
        where("school", "==", school), where("teachers", "array-contains", name)));
    studentSnap.forEach((d) => {
        const teachers = Array.isArray(d.data()?.teachers) ? d.data().teachers : [];
        const others = teachers.map(t => String(t || '').trim()).filter(t => t && t !== name);
        (others.length ? plan.studentsToDetach : plan.studentsToDelete).push(d.id);
    });
    return plan;
}

/** 정리할 항목 수 */
export function countCleanupTargets(plan) {
    return plan.rooms.length + plan.studentsToDetach.length + plan.studentsToDelete.length;
}

/**
 * 방 → 담당 제외 → 학생 삭제 순으로 정리합니다.
 * 항목마다 따로 시도하고, 실패한 항목 목록을 돌려줍니다 (지운 방 · 학생은 다음 수집에서 빠지므로 다시 부르면 남은 것만 지웁니다).
 * @param {Function} onProgress (done, total) => void
 */
export async function runTeacherCleanup(plan, onProgress = () => { }) {
    const failures = [];
    const total = countCleanupTargets(plan);
    let done = 0;
    const step = () => onProgress(++done, total);

    for (const room of plan.rooms) {
        try {
            await purgeRoomParts(room.code, room.parts);
            await deleteDoc(doc(db, REGISTRY_COLLECTION, room.id));
        } catch (e) {
            console.error('방 삭제 실패', room.id, e);
            failures.push(`방 ${room.code}`);
        }
        step();
    }
    for (const id of plan.studentsToDetach) {
        try {
            await updateDoc(doc(db, "student_auth", id), { teachers: arrayRemove(plan.name), updatedAt: serverTimestamp() });
        } catch (e) {
            console.error('담당 교사 제외 실패', id, e);
            failures.push(`학생 ${id} (담당 제외)`);
        }
        step();
    }
    for (const id of plan.studentsToDelete) {
        try {
            await purgeStudent(id);
        } catch (e) {
            console.error('학생 삭제 실패', id, e);
            failures.push(`학생 ${id} (삭제)`);
        }
        step();
    }
    return failures;
}

/** 실패 목록을 안내 문구로 (8개까지, 나머지는 '외 n건') */
export function formatCleanupFailures(failures) {
    const shown = failures.slice(0, 8).join('\n· ');
    return `· ${shown}${failures.length > 8 ? `\n· 외 ${failures.length - 8}건` : ''}`;
}
