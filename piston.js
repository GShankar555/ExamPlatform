import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const extensionMap = {
  python: "py",
  cpp: "cpp",
  c: "c",
  java: "java",
  javascript: "js",
};
export async function runCode(language, version, code) {
  const ext = extensionMap[language] || "txt";

  const res = await axios.post(process.env.PISTON_API, {
    language,
    version,
    files: [
      {
        name: `Main.${ext}`,
        content: code,
      },
    ],
  });

  return res.data.run;
}