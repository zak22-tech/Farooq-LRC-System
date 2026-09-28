import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { initializeFirestore, doc, getDoc, setDoc, onSnapshot, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

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
export const auth = getAuth(app);
const stateRef = doc(db, "learning_resources_app", "main");
const DEFAULT_HALL = "مركز مصادر التعلم";
const DEFAULT_SUBJECTS = ["اللغة العربية","اللغة الإنجليزية","الرياضيات","العلوم والبيئة","الفيزياء","الأحياء","الكيمياء","تقنية المعلومات","الدراسات الاجتماعية","التربية الإسلامية","الفنون التشكيلية","المهارات الموسيقية","الرياضة المدرسية"];

const cleanBooking = item => ({ ...item, hall: String(item?.hall || DEFAULT_HALL).trim() });
const normalize = (state = {}) => ({
  bookings: Array.isArray(state.bookings) ? state.bookings.filter(Boolean).map(cleanBooking) : [],
  subjects: Array.isArray(state.subjects) && state.subjects.length ? state.subjects : DEFAULT_SUBJECTS,
  schoolName: "مدرسة الفاروق",
  blocks: Array.isArray(state.blocks) ? state.blocks.filter(Boolean) : [],
  managers: state.managers && typeof state.managers === "object" ? state.managers : {}
});
const sanitize = value => JSON.parse(JSON.stringify(value));
const normalizeHall = value => String(value || DEFAULT_HALL).trim();
const bookingSlotKey = item => `${normalizeHall(item?.hall)}|${String(item?.date || "").trim()}|${Number(item?.period)}`;
const sameSlot = (a, b) => bookingSlotKey(a) === bookingSlotKey(b);

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
  const source = booking && typeof booking === "object" ? booking : {};
  const item = cleanBooking({
    id: String(source.id || "").trim(),
    hall: String(source.hall || DEFAULT_HALL).trim(),
    teacher: String(source.teacher || "").trim(),
    subject: String(source.subject || "").trim(),
    grade: String(source.grade || "").trim(),
    section: Number(source.section),
    period: Number(source.period),
    date: String(source.date || "").trim()
  });
  if (!item.id || !item.hall || !item.teacher || !item.subject || !item.grade || !Number.isInteger(item.section) || !Number.isInteger(item.period) || !item.date) {
    const error = new Error("بيانات الحجز غير مكتملة أو غير صالحة");
    error.code = "invalid-booking-data";
    throw error;
  }
  const allowedSections = { "10": 7, "11": 11, "12": 11 };
  if (!allowedSections[item.grade] || item.section < 1 || item.section > allowedSections[item.grade]) {
    const error = new Error("الصف أو الشعبة غير صحيحة");
    error.code = "invalid-grade-section";
    throw error;
  }
  let result;
  try {
    result = await runTransaction(db, async tx => {
    const snap = await tx.get(stateRef);
    const remote = normalize(snap.exists() ? snap.data() : {});
    if (remote.bookings.some(existing => String(existing.id) !== String(item.id) && sameSlot(existing, item))) {
      const error = new Error("الفترة المحددة محجوزة مسبقاً لهذه القاعة");
      error.code = "booking-conflict";
      throw error;
    }
    const blocked = remote.blocks.some(block => {
      const hallMatch = !block.hall || normalizeHall(block.hall) === normalizeHall(item.hall);
      const dateMatch = !block.date || String(block.date) === item.date;
      const periodMatch = !block.period || Number(block.period) === Number(item.period);
      return block.active !== false && hallMatch && dateMatch && periodMatch;
    });
    if (blocked) { const error = new Error("هذه القاعة أو الفترة مغلقة بواسطة الإدارة"); error.code = "booking-blocked"; throw error; }
    const merged = { ...remote, schoolName: "مدرسة الفاروق", bookings: [...remote.bookings, item] };
    tx.set(stateRef, { ...sanitize(merged), updatedAt: serverTimestamp() }, { merge: true });
      return merged;
    });
  } catch (error) {
    console.error("Firebase booking commit failed", {
      code: error?.code || "unknown",
      message: error?.message || String(error),
      booking: item
    });
    throw error;
  }
  publish(result, { syncStatus: "saved", savedBookingId: String(item.id) });
  return result;
}

window.firebaseBookingAPI = Object.freeze({ createBooking });
