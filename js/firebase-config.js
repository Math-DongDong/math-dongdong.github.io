import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app-check.js";

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

export { app, db, rtdbBlotto, rtdbSentiment, rtdbGridGomoku, rtdbRelativeFrequency };

