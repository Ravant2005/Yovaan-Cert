/**
 * AI Service - Certificate Metadata Extraction
 *
 * Pipeline: PDF Text Layer → Vision Model → OCR Fallback → Verification
 */

import fs from "fs";
import path from "path";
import os from "os";
import Tesseract from "tesseract.js";
import { pdfToPng } from "pdf-to-png-converter";
import { createRequire } from "module";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

/**
 * Public entry point for extraction
 */
export async function extractCertificateMetadata(filePath, mimetype, originalname = "upload") {
  console.log(`\n🧠 [extractCertificateMetadata] Starting for: ${originalname} (${mimetype})`);

  // Try fast path first: PDF with embedded text layer
  if (mimetype === "application/pdf") {
    const textLayerText = await tryPdfTextLayer(filePath);
    if (textLayerText) {
      console.log(`✅ Text layer found, using LLM for structuring`);
      return await structureWithOllamaText(textLayerText);
    }
    console.log("🔄 No usable text layer, converting PDF to images");
  }

  // Convert to high-quality image(s)
  const imagePaths = await toHighResImages(filePath, mimetype, originalname);

  try {
    // Try vision model first (LLaVA-Phi3 is better, but llava:7b is fallback)
    const visionAvailable = await checkOllamaModelAvailable("llava-phi3") || await checkOllamaModelAvailable("llava:7b");
    if (visionAvailable) {
      const visionModel = await checkOllamaModelAvailable("llava-phi3") ? "llava-phi3" : "llava:7b";
      console.log(`👁️  Using vision model: ${visionModel}`);
      const visionResult = await extractWithVisionModel(imagePaths, visionModel);
      
      // Verify against OCR (even if OCR fails, vision might still work but be more cautious)
      const ocrText = await tryOcrOnly(imagePaths);
      const isHallucinated = ocrText ? checkHallucination(visionResult, ocrText) : false;

      if (isValidExtraction(visionResult) && !isHallucinated) {
        console.log("✅ Vision extraction verified and valid");
        return visionResult;
      }

      console.warn("⚠️  Vision extraction failed validation, falling back to OCR + LLM");
    }

    // Fallback to OCR + LLM pipeline
    console.log("🔤 Running OCR + LLM pipeline");
    const ocrText = await tryOcrOnly(imagePaths);
    if (!ocrText || ocrText.trim().length < 50) {
      throw new Error("Could not extract meaningful text from certificate");
    }

    console.log(`📝 OCR extracted ${ocrText.length} chars`);
    return await structureWithOllamaText(ocrText);

  } finally {
    // Cleanup temp files
    for (const p of imagePaths) {
      try {
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
        }
      } catch (err) {
        console.warn(`⚠️  Failed to clean up ${p}:`, err.message);
      }
    }
  }
}

/**
 * Backward compatibility with old API
 */
export async function extractCertificateText(filePath, mimetype, originalname) {
  return extractCertificateMetadata(filePath, mimetype, originalname);
}

// -------------- HELPER FUNCTIONS --------------

async function tryPdfTextLayer(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(buffer);
    const text = (parsed.text || "").trim();
    return text.length >= 100 ? text : null;
  } catch (err) {
    console.warn("⚠️  pdf-parse failed:", err.message);
    return null;
  }
}

async function toHighResImages(filePath, mimetype, originalname) {
  // Handle image files first
  if (mimetype.startsWith("image/")) {
    const tmpPath = path.join(os.tmpdir(), `certichain-${uuidv4()}.png`);
    const metadata = await sharp(filePath).metadata();
    
    if (metadata.width < 2000 || metadata.height < 1500) {
      console.log("  📸 Upscaling image for better readability");
      await sharp(filePath)
        .resize(2400, null, { fit: "inside", withoutEnlargement: false })
        .png()
        .toFile(tmpPath);
    } else {
      await sharp(filePath).png().toFile(tmpPath);
    }
    return [tmpPath];
  }

  // Handle PDFs
  console.log("  📸 Rendering PDF at high resolution");
  const pages = await pdfToPng(filePath, { viewportScale: 3.0 });
  console.log(`  📄 ${pages.length} page(s) rendered`);
  
  const paths = [];
  for (let i = 0; i < pages.length; i++) {
    const tmpPath = path.join(os.tmpdir(), `certichain-${uuidv4()}.png`);
    fs.writeFileSync(tmpPath, pages[i].content);
    paths.push(tmpPath);
  }
  return paths;
}

async function checkOllamaModelAvailable(modelName) {
  try {
    const baseUrl = (process.env.OLLAMA_URL || "http://localhost:11434/api/generate").replace("/api/generate", "");
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const body = await res.json();
    const models = (body.models || []).map((m) => m.name.toLowerCase());
    return models.some((m) => m.includes(modelName.toLowerCase().replace(":7b", "").replace(":latest", "")));
  } catch {
    return false;
  }
}

async function extractWithVisionModel(imagePaths, model) {
  const url = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
  const primaryImagePath = imagePaths[0];
  const imageBase64 = fs.readFileSync(primaryImagePath).toString("base64");

  const prompt = `You are an expert certificate data extractor. Look at this certificate and return ONLY a valid JSON object with these fields:
{
  "studentName": "The exact full name of the person receiving the certificate (remove titles like Mr./Ms. if present but preserve actual name)",
  "courseName": "The exact name of the course/program/achievement",
  "grade": "The grade, score, or distinction (leave empty string if not present)",
  "issueDate": "The date of issuance, formatted strictly as YYYY-MM-DD",
  "organizationName": "The exact name of the organization/issuing body"
}

Rules:
- Do NOT guess or make up any information
- If a field is not clearly visible, leave it as an empty string
- For issueDate: convert any date format (e.g., "28 February 2025" → "2025-02-28")
- Return ONLY the JSON, no other text`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      images: [imageBase64],
      stream: false,
      format: "json",
      options: { temperature: 0.05, num_predict: 1024, top_p: 0.1 }
    }),
    signal: AbortSignal.timeout(90000)
  });

  if (!res.ok) {
    throw new Error(`Ollama returned status ${res.status}`);
  }

  const body = await res.json();
  return parseOllamaJsonResponse(body.response);
}

async function tryOcrOnly(imagePaths) {
  const texts = [];
  for (const imgPath of imagePaths) {
    const processedPath = await preprocessImage(imgPath);
    try {
      console.log("  🔤 OCR processing...");
      const { data } = await Tesseract.recognize(processedPath, "eng", {
        tessedit_pageseg_mode: "6",
        tessedit_ocr_engine_mode: "1",
        logger: (m) => {
          if (m.status === "recognizing text") {
            process.stdout.write(`\r    ${Math.round((m.progress || 0) * 100)}%`);
          }
        }
      });
      const pageText = (data.text || "").trim();
      if (pageText.length > 0) texts.push(pageText);
      console.log();
    } catch (err) {
      console.warn("  ⚠️  OCR failed for a page:", err.message);
    } finally {
      if (processedPath && processedPath !== imgPath) {
        try { fs.unlinkSync(processedPath); } catch {}
      }
    }
  }
  return texts.join("\n\n--- PAGE BREAK ---\n\n");
}

async function preprocessImage(inputPath) {
  const outputPath = path.join(os.tmpdir(), `certichain-ocr-${uuidv4()}.png`);
  await sharp(inputPath)
    .grayscale()
    .normalize()
    .sharpen({ sigma: 2 })
    .threshold(150)
    .png({ compressionLevel: 1 })
    .toFile(outputPath);
  return outputPath;
}

function checkHallucination(visionResult, ocrText) {
  if (!ocrText) return false;
  const normalizedOcr = ocrText.toLowerCase();
  
  const name = (visionResult.studentName || "").toLowerCase();
  const nameParts = name.split(/\s+/).filter(p => p.length > 2);
  if (nameParts.length > 0) {
    const found = nameParts.filter(part => normalizedOcr.includes(part)).length;
    if (found === 0) {
      console.warn(`🕵️  Hallucination: Student name "${name}" not found in OCR text`);
      return true;
    }
  }

  const org = (visionResult.organizationName || "").toLowerCase();
  const orgParts = org.split(/\s+/).filter(p => p.length > 3);
  if (orgParts.length > 0) {
    const found = orgParts.filter(part => normalizedOcr.includes(part)).length;
    if (found === 0) {
      console.warn(`🕵️  Hallucination: Organization "${org}" not found in OCR text`);
      return true;
    }
  }

  return false;
}

export async function sendToOllama(rawText) {
  return structureWithOllamaText(rawText);
}

async function structureWithOllamaText(rawText) {
  const model = process.env.OLLAMA_MODEL || "llama3";
  const url = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";

  const prompt = `You are a certificate data extractor. Return ONLY valid JSON:
{
  "studentName": "Full name of recipient",
  "courseName": "Name of course/achievement",
  "grade": "Grade/score/distinction (empty string if none)",
  "issueDate": "Date in YYYY-MM-DD format",
  "organizationName": "Issuing organization name"
}

Convert dates (like "28 February 2025" to "2025-02-28"). If a field is missing, use empty string. Return ONLY JSON, no other text.

Text: """${rawText}"""`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      format: "json",
      options: { temperature: 0.1, num_predict: 1024 }
    }),
    signal: AbortSignal.timeout(60000)
  });

  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const body = await res.json();
  return parseOllamaJsonResponse(body.response);
}

function parseOllamaJsonResponse(text) {
  let cleaned = text
    .replace(/```(?:json)?/gi, "")
    .trim();

  const match = cleaned.match(/\{[\s\S]*\}/);
  let parsed = {};
  try {
    parsed = match ? JSON.parse(match[0]) : JSON.parse(cleaned);
  } catch (err) {
    console.error("❌ JSON parse failed:", err.message);
    throw new Error("AI returned invalid JSON");
  }

  const result = {
    studentName: (parsed.studentName || "").trim(),
    courseName: (parsed.courseName || "").trim(),
    grade: (parsed.grade || "A").trim(),
    issueDate: (parsed.issueDate || "").trim(),
    organizationName: (parsed.organizationName || "").trim()
  };

  if (result.issueDate && !/^\d{4}-\d{2}-\d{2}$/.test(result.issueDate)) {
    result.issueDate = "";
  }

  return result;
}

function isValidExtraction(result) {
  const required = ["studentName", "courseName", "organizationName"];
  const filled = required.filter(key => result[key] && result[key].length > 2);
  return filled.length >= 2;
}
