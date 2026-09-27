import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { initializeFirestore, doc, getDoc, setDoc, onSnapshot, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCTqGF08fB0nqvEanqbs62VOL11aZETjls",
  authDomain: "al-farooq-school-hall-booking.firebaseapp.com",
  projectId: "al-farooq-school-hall-booking",
  storageBucket: "al-farooq-school-hall-booking.firebasestorage.app",
  messagingSenderId: "392364390397",
  appId: "1:392364390397:web:110fbd6ff5f19304510b94",
  measurementId: "G-579H6X2H6M"
};

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
const stateRef = doc(db, "learning_resources_app", "main");
const DEFAULT_HALL = "مركز مصادر التعلم";
const DEFAULT_SUBJECTS = ["اللغة العربية","اللغة الإنجليزية","الرياضيات","العلوم والبيئة","الفيزياء","الأحياء","الكيمياء","تقنية المعلومات","الدراسات الاجتماعية","التربية الإسلامية","الفنون التشكيلية","المهارات الموسيقية","الرياضة المدرسية"];

const cleanBooking = item => ({ ...item, hall: item?.hall || DEFAULT_HALL });
const normalize = (state = {}) => ({
  bookings: Array.isArray(state.bookings) ? state.bookings.filter(Boolean).map(cleanBooking) : [],
  subjects: Array.isArray(state.subjects) && state.subjects.length ? state.subjects : DEFAULT_SUBJECTS,
  schoolName: "مدرسة الفاروق"
});
const sanitize = value => JSON.parse(JSON.stringify(value));
const sameSlot = (a, b) => String(a?.hall || DEFAULT_HALL) === String(b?.hall || DEFAULT_HALL) && String(a?.date || "") === String(b?.date || "") && Number(a?.period) === Number(b?.period);

function publish(state, extra = {}) {
  window.dispatchEvent(new CustomEvent("firebase-state-updated", { detail: { ...normalize(state), ...extra } }));
}

async function initializeSync() {
  try {
    const first = await getDoc(stateRef);
    if (first.exists()) {
      const state = normalize(first.data());
      publish(state);
      const needsMigration = (first.data().bookings || []).some(item => item && !item.hall) || first.data().schoolName !== "مدرسة الفاروق";
      if (needsMigration) await setDoc(stateRef, { ...state, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      const initial = normalize({});
      await setDoc(stateRef, { ...initial, updatedAt: serverTimestamp() });
      publish(initial);
    }
    onSnapshot(stateRef, snap => {
      if (snap.exists()) publish(snap.data());
    }, error => {
      console.error("Firebase live sync failed:", error);
      publish(normalize({}), { syncStatus: "error", errorCode: error.code });
    });
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    publish(normalize({}), { syncStatus: "error", errorCode: error.code });
  }
}

const syncReady = initializeSync();

async function createBooking(booking) {
  await syncReady;
  const item = cleanBooking(sanitize(booking));
  if (!item.id || !item.hall || !item.teacher || !item.subject || !item.grade || !item.period || !item.date) throw new Error("بيانات الحجز غير مكتملة");
  const result = await runTransaction(db, async tx => {
    const snap = await tx.get(stateRef);
    const remote = normalize(snap.exists() ? snap.data() : {});
    if (remote.bookings.some(existing => String(existing.id) !== String(item.id) && sameSlot(existing, item))) {
      const error = new Error("الفترة المحددة محجوزة مسبقاً لهذه القاعة");
      error.code = "booking-conflict";
      throw error;
    }
    const merged = { ...remote, schoolName: "مدرسة الفاروق", bookings: [...remote.bookings, item] };
    tx.set(stateRef, { ...sanitize(merged), updatedAt: serverTimestamp() }, { merge: true });
    return merged;
  });
  publish(result, { syncStatus: "saved", savedBookingId: String(item.id) });
  return result;
}

window.firebaseBookingAPI = Object.freeze({ createBooking });
