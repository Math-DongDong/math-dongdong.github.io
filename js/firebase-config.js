import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBmbTg1WKo53_dsjoZsF991LC8WEMPjnlg",
  authDomain: "mathdongdong-db.firebaseapp.com",
  projectId: "mathdongdong-db",
  storageBucket: "mathdongdong-db.firebasestorage.app",
  messagingSenderId: "1047361095956",
  appId: "1:1047361095956:web:58634f39a5334095125a01",
  measurementId: "G-NMRCVLP3ZD"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

export { app, analytics, db };
