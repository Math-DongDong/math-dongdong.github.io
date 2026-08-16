const CACHE_NAME = 'dongdong-cache-v2';

// 설치 시 즉시 활성화
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// 네트워크 요청 가로채기 (오프라인 통과 필수 요건)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => {
            // 오프라인일 때 임시 응답을 반환하여 설치 조건(Installability) 통과
            return new Response("인터넷 연결이 끊어졌습니다. 네트워크를 확인해주세요.");
        })
    );
});