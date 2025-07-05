import admin from "firebase-admin";
import fs from "fs";

const serviceAccount = JSON.parse(
  fs.readFileSync("./serviceAccountKey.json", "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const data = JSON.parse(fs.readFileSync("./data.json", "utf8"));
const mockExams = data.exams;

async function uploadExams() {
  const batch = db.batch();

  mockExams.forEach((exam) => {
    const ref = db.collection("exams").doc(exam.id);
    batch.set(ref, exam);
  });

  try {
    await batch.commit();
    console.log("✅ Mock exams uploaded to Firestore");
  } catch (error) {
    console.error("❌ Upload failed:", error);
  }
}

uploadExams();