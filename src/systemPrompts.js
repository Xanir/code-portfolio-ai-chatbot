'use strict';

const fs = require('fs');
const path = require('path');

const RESUME_DIR = process.env.RESUME_DIR || path.join(__dirname, 'data');

// ---------------------------------------------------------------------------
// Resume data loader
// ---------------------------------------------------------------------------

/**
 * Reads every `.txt` file in `dir` and returns their combined content as a
 * single string.  Files are sorted by name for deterministic ordering.
 * Returns an empty string if the directory does not exist or contains no
 * `.txt` files; logs a warning in either case.
 */
function loadResumeData(dir) {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    console.warn(`RESUME_DIR "${dir}" could not be read – proceeding without resume data.`);
    return '';
  }

  const txtFiles = files.filter((f) => f.toLowerCase().endsWith('.txt')).sort();

  if (txtFiles.length === 0) {
    console.warn(`No .txt files found in RESUME_DIR "${dir}" – proceeding without resume data.`);
    return '';
  }

  return txtFiles
    .map((file) => {
      const fullPath = path.join(dir, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      return `### FILE: ${file} ###\n${content.trim()}`;
    })
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Base system prompts
// ---------------------------------------------------------------------------

const BASE_SYSTEM_PROMPT_FIRST_PERSON = `
You are Jo. Use the following resume data as your own personal history.
Always respond in the first person ("I", "my").

If the question is outside the scope of the provided resume data steer the question back to topics related the career and their experience.
`;

const BASE_SYSTEM_PROMPT_THIRD_PERSON = `
You are an AI assistant for Jo. Use the following resume data to answer questions about Jo's career. 
Always respond in the third person ("Jo", "They", "He/She").
Keep answers to 1-2 sentences. Do not mention headers or metadata.
`;

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

/**
 * Builds the full system prompt by appending loaded resume data (if any) to
 * the provided base prompt.
 */
function buildSystemPrompt(resumeData, basePrompt = BASE_SYSTEM_PROMPT_FIRST_PERSON) {
  if (!resumeData) return basePrompt;
  return `
${basePrompt}

<RESUME>
${resumeData}
</RESUME>
`;
}

// ---------------------------------------------------------------------------
// Build and export prompts
// ---------------------------------------------------------------------------

const RESUME_DATA = loadResumeData(RESUME_DIR);

const SYSTEM_PROMPT_FIRST_PERSON = buildSystemPrompt(RESUME_DATA, BASE_SYSTEM_PROMPT_FIRST_PERSON);
const SYSTEM_PROMPT_THIRD_PERSON = buildSystemPrompt(RESUME_DATA, BASE_SYSTEM_PROMPT_THIRD_PERSON);

module.exports = {
  SYSTEM_PROMPT_FIRST_PERSON,
  SYSTEM_PROMPT_THIRD_PERSON,
  loadResumeData,
  buildSystemPrompt,
};
