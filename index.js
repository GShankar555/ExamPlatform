import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { db } from "./firebase.js";
import { runCode } from "./piston.js";
import mustache from "mustache";
import he from "he";

dotenv.config();
const app = express();
app.use(cors({origin: "*"}));
app.use(express.json());

const versionMap = {
  python: "3.10.0",
  java: "15.0.2",
  c: "10.2.0",
  cpp: "10.2.0",
};

app.get("/api/user/getProblems", async (req, res) => {
  try {
    const snapshot = await db.collection("exams").get();
    const problems = [];
    snapshot.forEach((doc) => {
      problems.push(doc.data());
    });
    res.send(problems);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Server Error" });
  }
});

app.post("/api/user/runCode", async (req, res) => {
  const { examId, problemId, code, language } = req.body;

  if (!examId || !problemId || !language || !code)
    return res.status(400).send({ error: "Missing required fields" });

  try {
    console.log("Running code for Exam:", examId, "Problem:", problemId);
    const examDoc = await db.collection("exams").doc(String(examId)).get();
    if (!examDoc.exists)
      return res.status(404).send({ error: "Exam not found" });
    const examData = examDoc.data();
    if (!examData || !Array.isArray(examData.questions)) {
      return res.status(400).send({ error: "Malformed exam data" });
    }
    const problem = examData.questions.find((q) => q.id === problemId);
    if (!problem) {
      return res.status(404).send({ error: "Problem not found in exam" });
    }
    if (problem.type !== "coding") {
      return res
        .status(400)
        .send({ error: "Problem is not a coding question" });
    }
    const testCases = (problem.testCases || []).slice(0, 95);
    const funcName = problem.functionName;
    const templateObj = problem.languageTemplates?.[language];
    if (!templateObj || !templateObj.template) {
      return res
        .status(400)
        .send({ error: "Language not supported for this problem" });
    }
    const decodedCode = he.decode(code);
    const testRuns = testCases.map((test, i) => ({
      id: i,
      inputs: Array.isArray(test.input) ? test.input : [test.input],
    }));
    const script = mustache.render(templateObj.template, {
      code: decodedCode,
      functionName: funcName,
      testRuns,
    });
    const start = Date.now();
    const result = await runCode(language, versionMap[language], script);
    const end = Date.now();
    const durationMs = end - start;

    const rawOutput = result.output || "";
    const outputLines = rawOutput.trim().split("\n");
    const testResults = testCases.map((test, i) => {
      const outputLine = outputLines.find((l) => l.startsWith(`${i}:`)) || "";
      const actualOutput = outputLine
        .substring(outputLine.indexOf(":") + 1)
        .trim();
      const passed = actualOutput === test.expectedOutput.trim();
      return {
        id: i,
        name: test.name || `Test ${i + 1}`,
        input: test.input,
        expectedOutput: test.expectedOutput,
        actualOutput,
        status: passed ? "passed" : "failed",
        executionTime: result.time || durationMs,
        memoryUsed: result.memory || 0,
      };
    });

    const overallStatus = testResults.every((t) => t.status === "passed")
      ? "passed"
      : testResults.some((t) => t.status === "passed")
      ? "partial"
      : "failed";

    const totalExecutionTime = result.time || durationMs;
    const totalMemoryUsed = result.memory || 0;

    res.send({
      testCases: testResults,
      overallStatus,
      totalExecutionTime,
      totalMemoryUsed,
      rawOutput,
    });
  } catch (error) {
    console.error("Error during code execution:", error);
    res.status(500).send({ error: "Internal server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));