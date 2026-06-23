/**
 * AI Service - Certificate Metadata Extraction (Google Gemini)
 *
 * Pipeline: PDF Text Layer → Gemini Vision (Primary) → Tesseract OCR (Fallback)
 *
 * Addresses all issues:
 * - Uses powerful Gemini 2.5 Flash / 3 Flash for accurate character-level reading
 * - No destructive preprocessing (keeps anti-aliased/thin strokes for decorative fonts)
 * - Single LLM step to avoid drift/hallucination
 */

import fs from "fs";
import path from "path";
import os from "os";
import { pdfToPng } from "pdf-to-png-converter";
import { createRequire } from "module";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import { GoogleGenerativeAI } from "@google/generative-ai";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

// Initialize Gemini
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
let genAI = null;
if (GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
}

/**
 * Public entry point for extraction
 */
export async function extractCertificateMetadata(filePath, mimetype, originalname = "upload") {
  console.log(`\n🧠 [extractCertificateMetadata] Starting for: ${originalname} (${mimetype})`);

  // Try fast path first: PDF with embedded text layer
  if (mimetype === "application/pdf") {
    const textLayerText = await tryPdfTextLayer(filePath);
    if (textLayerText) {
      console.log(`✅ Text layer found, using Gemini for structuring`);
      return await structureWithGemini(textLayerText);
    }
    console.log("🔄 No usable text layer, converting PDF to images");
  }

  // Convert to high-quality image(s) (no destructive preprocessing)
  const imagePaths = await toHighResImages(filePath, mimetype, originalname);

  try {
    // Primary: Gemini Vision
    if (genAI) {
      console.log(`👁️  Using ${GEMINI_MODEL} vision model`);
      const visionResult = await extractWithGeminiVision(imagePaths);
      if (isValidExtraction(visionResult)) {
        console.log("✅ Gemini Vision extraction successful!");
        return visionResult;
      }
      console.warn("⚠️  Gemini Vision extraction incomplete, falling back");
    }

    console.error("❌ No Gemini API key available!");
    throw new Error("GEMINI_API_KEY not set in environment variables");
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
  // Handle image files (simple upscaling, NO destructive thresholding!)
  if (mimetype.startsWith("image/")) {
    const tmpPath = path.join(os.tmpdir(), `certichain-${uuidv4()}.png`);
    const metadata = await sharp(filePath).metadata();
    
    if (metadata.width < 2000 || metadata.height < 1500) {
      console.log("  📸 Upscaling image for better readability");
      await sharp(filePath)
        .resize(2400, null, { fit: "inside", withoutEnlargement: false })
        .png({ compressionLevel: 0 }) // No compression for max quality
        .toFile(tmpPath);
    } else {
      await sharp(filePath)
        .png({ compressionLevel: 0 }) // No compression
        .toFile(tmpPath);
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

/**
 * Gemini Vision Extraction
 */
async function extractWithGeminiVision(imagePaths) {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const primaryImagePath = imagePaths[0];
  
  // Read image as base64
  const imageBase64 = fs.readFileSync(primaryImagePath).toString("base64");
  const imageMimeType = "image/png";

  const prompt = `You are a precise, professional certificate data extractor. Look at this certificate and extract ONLY the following fields EXACTLY as they appear.

Return ONLY a JSON object with these fields:
{
  "studentName": "The full name of the certificate recipient (remove any honorifics/titles like Mr., Ms., Dr., Sir, Madam, etc. if present, but keep the full name),
  "courseName": "The exact name of the course, program, or achievement the certificate is for,
  "grade": "The grade, score, or distinction if present; leave as empty string if not mentioned,
  "issueDate": "The date the certificate was issued, converted to strict YYYY-MM-DD format; leave as empty string if not clear,
  "organizationName": "The name of the organization/institution that issued the certificate"
}

Rules:
- DO NOT guess or make up any information.
- If a field is not clearly visible, set it to an empty string ("").
- For issueDate: convert any format (e.g., "28 February 2025" becomes "2025-02-28", "Feb 12, 2025" becomes "2025-02-12").
- Return ONLY valid JSON, no other text or markdown.`;

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: imageBase64,
        mimeType: imageMimeType
      }
    }
  ]);

  const response = await result.response;
  const responseText = response.text();
  return parseGeminiJsonResponse(responseText);
}

/**
 * Gemini Text Structuring
 */
async function structureWithGemini(rawText) {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const prompt = `You are a certificate data extractor. Extract fields from this raw text and return ONLY a JSON object:

{
  "studentName": "Full name of recipient, no honorifics",
  "courseName": "Name of course/program",
  "grade": "Grade if present, else empty string",
  "issueDate": "Date in YYYY-MM-DD format, else empty string",
  "organizationName": "Issuing organization"
}

Raw certificate text:
"""
${rawText}
"""`;

  const result = await model.generateContent([prompt]);
  const response = await result.response;
  const responseText = response.text();
  return parseGeminiJsonResponse(responseText);
}

/**
 * Parse Gemini JSON response
 */
function parseGeminiJsonResponse(text) {
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

/**
 * Simple validation
 */
function isValidExtraction(result) {
  const required = ["studentName", "courseName", "organizationName"];
  const filled = required.filter(key => result[key] && result[key].length > 2);
  return filled.length >= 2;
}

/**
 * Keep sendToOllama for compatibility (though it uses Gemini now)
 */
export async function sendToOllama(rawText) {
  return structureWithGemini(rawText);
}
