// PWA 설치 요건을 충족하기 위한 기본 서비스 워커 로직
const CACHE_NAME = 'dongdong-app-cache-v1';

self.addEventListener('install', (event) => {
    // 즉시 서비스 워커를 활성화
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // 네트워크 요청을 그대로 통과 (필요 시 추후 오프라인 캐싱 기능 추가 가능)
    event.respondWith(fetch(event.request));
});