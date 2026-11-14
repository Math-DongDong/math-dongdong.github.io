import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app-check.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAKsWMTwBY8gPGTB0Q8xWTbxgCHIuGkw9I",
  authDomain: "mathdongdong.firebaseapp.com",
  projectId: "mathdongdong",
  storageBucket: "mathdongdong.firebasestorage.app",
  messagingSenderId: "714302394309",
  appId: "1:714302394309:web:9eb03d26f36eceadb705ac"
};

const app = initializeApp(firebaseConfig);

const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('6LcldW4tAAAAAHZBALIPn8CeB0uhuLII_6nZbinh'),
  isTokenAutoRefreshEnabled: true
});

const db = getFirestore(app);
const rtdbBlotto = getDatabase(app, "https://blottogame.asia-southeast1.firebasedatabase.app/");
const rtdbSentiment = getDatabase(app, "https://sentimentanalysis.asia-southeast1.firebasedatabase.app/");
const rtdbGridGomoku = getDatabase(app, "https://gridgomoku.asia-southeast1.firebasedatabase.app/");
const rtdbRelativeFrequency = getDatabase(app, "https://relativefrequency.asia-southeast1.firebasedatabase.app/");
// 접속 상태 전용 — 진행에 RTDB를 쓰지 않는 게임(유형 A)의 접속중·다른화면·접속 끊김 (game-kit의 startRoomPresence)
const rtdbPresence = getDatabase(app, "https://mathdongdong-default-rtdb.asia-southeast1.firebasedatabase.app/");

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { app, db, rtdbBlotto, rtdbSentiment, rtdbGridGomoku, rtdbRelativeFrequency, rtdbPresence, auth, googleProvider };

