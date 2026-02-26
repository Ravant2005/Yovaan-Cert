/**
 * AI Service — Text extraction (OCR) + Ollama LLM integration
 *
 * extractCertificateText(filePath, mimetype, originalname)
 *   1. If the file is an image → OCR directly with Tesseract.js using filePath.
 *   2. If the file is a PDF   → try pdf-parse first; if text < 50 chars
 *      (scanned image), convert to PNGs via pdf-to-png-converter,
 *      OCR every page, clean up generated temp files.
 *
 * sendToOllama(rawText)
 *   Sends extracted text to a local Ollama model and returns a
 *   parsed JSON object with certificate metadata.
 */

import fs from "fs";
import path from "path";
import os from "os";
import Tesseract from "tesseract.js";
import { pdfToPng } from "pdf-to-png-converter";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

// ── Text Extraction ──────────────────────────────────────

/**
 * Extract text from a physical file.
 * @param {string} filePath    – Physical file path on disk
 * @param {string} mimetype    – e.g. "application/pdf", "image/png"
 * @param {string} originalname – Original filename
 * @returns {Promise<string>} Raw text
 */
export async function extractCertificateText(filePath, mimetype, originalname = "upload") {
    try {
        // ── Direct image upload → OCR straight away ──────────
        if (mimetype.startsWith("image/")) {
            console.log("🖼️  Image detected — running Tesseract OCR...");
            return await ocrFromImagePath(filePath);
        }

        // ── PDF upload → try text-layer first ────────────────
        if (mimetype === "application/pdf") {
            console.log("📄 PDF detected — attempting text extraction with pdf-parse...");
            let textLayerText = "";
            try {
                const buffer = fs.readFileSync(filePath);
                const parsed = await pdfParse(buffer);
                textLayerText = (parsed.text || "").trim();
            } catch (err) {
                console.warn("⚠️  pdf-parse failed:", err.message);
            }

            // If we got enough text from the text layer, use it.
            if (textLayerText.length >= 50) {
                console.log(`✅ pdf-parse returned ${textLayerText.length} chars — using text layer.`);
                return textLayerText;
            }

            // ── Fallback: scanned PDF → convert to images → OCR ─
            console.log("🔄 Text too short (<50 chars). Falling back to OCR...");
            return await ocrFromPdfPath(filePath, originalname);
        }

        throw new Error(`Unsupported file type: ${mimetype}`);
    } catch (err) {
        console.error("[extractCertificateText Error]", err);
        throw err;
    }
}

// ── Helpers ──────────────────────────────────────────────

function getTempFilePath(originalname) {
    const safeName = originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    return path.join(os.tmpdir(), `certichain-page-${Date.now()}-${safeName}`);
}

function cleanupFile(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (err) {
        console.warn(`  ⚠️  Failed to clean up ${filePath}:`, err.message);
    }
}

/**
 * OCR a single image file with Tesseract.js.
 */
async function ocrFromImagePath(filePath) {
    console.log("  ⏳ Tesseract: recognising image...");
    const { data } = await Tesseract.recognize(filePath, "eng", {
        logger: (m) => {
            if (m.status) console.log(`  🔤 Tesseract: ${m.status} ${Math.round((m.progress || 0) * 100)}%`);
        },
    });
    return (data.text || "").trim();
}

/**
 * Convert a physical PDF into PNG pages, OCR each page, and concatenate.
 */
async function ocrFromPdfPath(pdfPath, originalname) {
    const generatedImagePaths = [];

    try {
        console.log("  📸 Converting PDF pages to PNG (viewportScale: 2.0) ...");

        // pdf-to-png-converter strictly supports path strings
        const pages = await pdfToPng(pdfPath, {
            viewportScale: 2.0,
        });

        console.log(`  📄 ${pages.length} page(s) converted. Starting OCR...`);
        const texts = [];

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            if (page.path) generatedImagePaths.push(page.path);

            // Write page content to a temporary PNG so Tesseract has a physical path
            const tempPngPath = getTempFilePath(`page-${i + 1}.png`);
            generatedImagePaths.push(tempPngPath);
            fs.writeFileSync(tempPngPath, page.content);

            console.log(`  ⏳ OCR page ${i + 1}/${pages.length}...`);
            const { data } = await Tesseract.recognize(tempPngPath, "eng", {
                logger: (m) => {
                    if (m.status) console.log(`    🔤 Page ${i + 1}: ${m.status} ${Math.round((m.progress || 0) * 100)}%`);
                },
            });
            texts.push((data.text || "").trim());
        }

        const combined = texts.join("\n\n");
        console.log(`  ✅ OCR complete — ${combined.length} chars extracted from ${pages.length} page(s).`);
        return combined;
    } finally {
        // Clean up all generated PNG pages
        for (const imgPath of generatedImagePaths) {
            cleanupFile(imgPath);
        }
    }
}

// ── Ollama Integration ───────────────────────────────────

export async function sendToOllama(rawText) {
    const model = process.env.OLLAMA_MODEL || "llama3";
    const url = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";

    const prompt = `You are a precise data extraction API. You receive raw, messy OCR text from a certificate and output ONLY valid JSON. Absolutely no markdown formatting, no conversational filler, no backticks.

Rules:
1. Date Formatting (CRITICAL): You must find the date the certificate was issued and convert it to strict YYYY-MM-DD format.
   - Example 1: if the text says "05th September 2022", output "2022-09-05".
   - Example 2: if the text says "October 12, 2023", output "2023-10-12".
   - NEVER use the current date unless no date exists in the text.
   - If no issue date exists in the text, output an empty string "".
2. Organization Name: Find the issuing organization or company name. This is usually the largest text at the top, or associated with the CEO/Director signature at the bottom. Do not confuse the student's name or course name with the organization.
3. JSON Schema: Force exactly this structure: { "studentName": "", "courseName": "", "grade": "", "issueDate": "", "organizationName": "" }.
4. If a field is not found in the text, set its value to an empty string "".
5. Do NOT include any conversational text, explanation, or filler. Return ONLY the JSON object.

Raw text:
"""
${rawText.slice(0, 4000)}
"""`;

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model,
            prompt,
            stream: false,
            format: "json",
        }),
    });

    if (!res.ok) {
        throw new Error(`Ollama returned HTTP ${res.status}`);
    }

    const body = await res.json();
    let responseText = (body.response || "").trim();

    // Strip markdown fences if model ignored instructions
    responseText = responseText
        .replace(/```(?:json)?\s*/gi, "")
        .replace(/```/g, "")
        .trim();

    // Robust extraction: find the first { ... } block to ignore conversational filler
    const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
    let parsed = {};

    try {
        if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
        } else {
            parsed = JSON.parse(responseText); // Fallback: try parsing the whole thing
        }
    } catch (parseErr) {
        console.error("❌ Failed to parse Ollama JSON response:", responseText);
        throw new Error("AI returned invalid data format");
    }

    const allowed = ["studentName", "courseName", "grade", "organizationName", "issueDate"];
    const cleaned = {};
    for (const key of allowed) {
        cleaned[key] = typeof parsed[key] === "string" ? parsed[key].trim() : "";
    }

    return cleaned;
}
