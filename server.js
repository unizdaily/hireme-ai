require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  BorderStyle, LevelFormat, WidthType
} = require('docx');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Base profile ──────────────────────────────────────────────────────────
// Replace this with your own details. The more complete your profile,
// the better the AI can tailor your CV to each job posting.
const BASE_PROFILE = `
NAME: Your Full Name
CONTACT: City, Country | +xx xxx xxx xxxx | email@example.com | linkedin.com/in/yourprofile | github.com/yourusername

CURRENT TITLE: Your Current or Target Job Title

EXPERIENCE:

1. Job Title — Company Name, Location
   Month Year – Month Year | Full-time / Part-time / Contract
   - Key achievement with measurable result (e.g. reduced processing time by 40%)
   - Key achievement with measurable result
   - Key achievement with measurable result

2. Job Title — Company Name, Location
   Month Year – Month Year | Full-time
   - Key achievement with measurable result
   - Key achievement with measurable result

EDUCATION:
- Degree Name, Field of Study — Institution Name, Location | Year – Year

SKILLS:
Category 1: skill1, skill2, skill3
Category 2: skill1, skill2, skill3

LANGUAGES: English (Fluent), Language2 (Level), Language3 (Level)

GUARDRAILS FOR CV GENERATION:
- Only use tools, skills, and experience listed above — never invent anything
- All achievements must be truthful — only reframe real experience, never inflate
- Keep bullet points as achievements, not duties
- Use standard sentence case for all prose; only section headers should be uppercase
`;

// ── Smart filename generator ──────────────────────────────────────────────
// Format: YourName_JobTitle_Company_Date (name is extracted from the CV)
function smartFilename(cvText, jobPosting, aiJobTitle = '', aiCompany = '') {
  // Clean strings for filename: TitleCase_Words, max 30 chars
  const clean = (s) => s
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('_')
    .slice(0, 30);

  // Prefer AI-extracted values (more accurate than regex)
  let jobTitle = aiJobTitle.trim();
  let company  = aiCompany.trim();

  // Fallback regex for job title
  if (!jobTitle) {
    const titlePatterns = [
      /(?:applying for|position:|role:|job title:)\s*([^\n]+)/i,
      /^([A-Z][a-zA-Z\s]+(?:Engineer|Analyst|Developer|Manager|Specialist|Coordinator|Designer|Consultant|Lead|Officer))/m,
    ];
    for (const pattern of titlePatterns) {
      const match = jobPosting.match(pattern);
      if (match) { jobTitle = match[1].trim(); break; }
    }
  }

  // Fallback regex for company
  if (!company) {
    const companyPatterns = [
      /(?:at|@|company:|employer:)\s*([A-Z][a-zA-Z\s&.,]+?)(?:\s*[-–|,\n])/i,
      /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\s+is (?:looking|hiring|seeking)/i,
      /Join\s+([A-Z][a-zA-Z\s]+?)(?:\s*[-–!,\n])/i,
    ];
    for (const pattern of companyPatterns) {
      const match = jobPosting.match(pattern);
      if (match) { company = match[1].trim(); break; }
    }
  }

  // Extract name from first line of CV
  const firstLine = cvText.split('\n').find(l => l.trim().length > 0) || '';
  const nameClean = clean(firstLine.trim()) || 'CV';

  const date        = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const titleClean  = clean(jobTitle)  || 'Application';
  const companyClean = clean(company)  || 'Company';

  return `${nameClean}_${titleClean}_${companyClean}_${date}`;
}

// ── Build DOCX from plain text CV ─────────────────────────────────────────
async function buildDocx(cvText) {
  const ACCENT = '2563EB';
  const DARK   = '111827';
  const MID    = '374151';
  const LIGHT  = '6B7280';

  function sectionHeader(title) {
    return new Paragraph({
      spacing: { before: 280, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 4 } },
      children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 22, color: ACCENT, font: 'Arial' })]
    });
  }

  const lines = cvText.split('\n');
  const children = [];
  let lineIdx = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    lineIdx++;
    if (!line) { children.push(new Paragraph({ spacing: { before: 0, after: 60 }, children: [] })); continue; }

    // Name
    if (lineIdx <= 4 && /^[A-Z][a-z]+ [A-Z][a-z]+/.test(line) && !line.includes(':') && line.length < 40) {
      children.push(new Paragraph({
        spacing: { before: 0, after: 60 },
        children: [new TextRun({ text: line, bold: true, size: 96, color: DARK, font: 'Arial' })]
      }));
    }
    // Contact
    else if ((line.includes('@') || line.includes('|')) && lineIdx < 8) {
      children.push(new Paragraph({
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: line, size: 19, color: LIGHT, font: 'Arial' })]
      }));
    }
    // Section headers
    else if (/^(PROFESSIONAL SUMMARY|EXPERIENCE|SKILLS|EDUCATION|CORE COMPETENCIES|LANGUAGES)(?!\s*:)/i.test(line)) {
      children.push(sectionHeader(line));
    }
    // Bullets
    else if (/^[-–•*]/.test(line)) {
      children.push(new Paragraph({
        numbering: { reference: 'bullets', level: 0 },
        spacing: { before: 30, after: 30 },
        children: [new TextRun({ text: line.replace(/^[-–•*]\s*/, ''), size: 20, color: MID, font: 'Arial' })]
      }));
    }
    // Numbered job entries
    else if (/^\d+\./.test(line)) {
      children.push(new Paragraph({
        spacing: { before: 180, after: 0 },
        children: [new TextRun({ text: line.replace(/^\d+\.\s*/, ''), bold: true, size: 23, color: DARK, font: 'Arial' })]
      }));
    }
    // Skill rows Label: value
    else if (/^[A-Za-z &\/]+:\s/.test(line) && !/^\d{4}/.test(line)) {
      const col = line.indexOf(':');
      children.push(new Paragraph({
        spacing: { before: 60, after: 60 },
        children: [
          new TextRun({ text: line.slice(0, col) + ': ', bold: true, size: 20, color: DARK, font: 'Arial' }),
          new TextRun({ text: line.slice(col + 1).trim(), size: 20, color: MID, font: 'Arial' })
        ]
      }));
    }
    // Meta/date lines
    else if (/\d{4}/.test(line) && line.length < 120) {
      children.push(new Paragraph({
        spacing: { before: 0, after: 60 },
        children: [new TextRun({ text: line, size: 19, color: LIGHT, font: 'Arial' })]
      }));
    }
    // Default
    else {
      children.push(new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [new TextRun({ text: line, size: 21, color: MID, font: 'Arial' })]
      }));
    }
  }

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '–',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 480, hanging: 240 } } }
        }]
      }]
    },
    styles: {
      default: { document: { run: { font: 'Arial', size: 21 } } }
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
        }
      },
      children
    }]
  });

  return await Packer.toBuffer(doc);
}

// ── Build PDF from plain text (HTML-based) ────────────────────────────────
function buildPdfHtml(cvText) {
  const lines = cvText.split('\n');
  let html = '';
  let lineIdx = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    lineIdx++;
    if (!line) { html += '<div style="height:6px"></div>'; continue; }

    const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    if (lineIdx <= 4 && /^[A-Z][a-z]+ [A-Z][a-z]+/.test(line) && !line.includes(':') && line.length < 40) {
      html += `<div style="font-family:Arial;font-size:52px;font-weight:bold;color:#111827;margin-bottom:6px">${esc(line)}</div>`;
    } else if ((line.includes('@') || line.includes('|')) && lineIdx < 8) {
      html += `<div style="font-family:Arial;font-size:11px;color:#6B7280;margin-bottom:4px">${esc(line)}</div>`;
    } else if (/^(PROFESSIONAL SUMMARY|EXPERIENCE|SKILLS|EDUCATION|CORE COMPETENCIES|LANGUAGES)(?!\s*:)/i.test(line)) {
      html += `<div style="font-family:Arial;font-size:10px;font-weight:bold;color:#2563EB;letter-spacing:2px;text-transform:uppercase;border-bottom:2px solid #2563EB;padding-bottom:3px;margin:20px 0 8px">${esc(line)}</div>`;
    } else if (/^[-–•*]/.test(line)) {
      html += `<div style="font-family:Arial;font-size:11px;color:#374151;padding-left:14px;position:relative;margin-bottom:3px">– ${esc(line.replace(/^[-–•*]\s*/,''))}</div>`;
    } else if (/^\d+\./.test(line)) {
      html += `<div style="font-family:Arial;font-size:12px;font-weight:bold;color:#111827;margin-top:12px">${esc(line.replace(/^\d+\.\s*/,''))}</div>`;
    } else if (/^[A-Za-z &\/]+:\s/.test(line) && !/^\d{4}/.test(line)) {
      const col = line.indexOf(':');
      html += `<div style="font-family:Arial;font-size:11px;color:#374151;margin-bottom:4px"><strong>${esc(line.slice(0,col))}:</strong> ${esc(line.slice(col+1).trim())}</div>`;
    } else if (/\d{4}/.test(line) && line.length < 120) {
      html += `<div style="font-family:Arial;font-size:10px;color:#6B7280;margin-bottom:4px">${esc(line)}</div>`;
    } else {
      html += `<div style="font-family:Arial;font-size:11px;color:#374151;margin-bottom:3px">${esc(line)}</div>`;
    }
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { margin: 40px 50px; background: white; }
  @page { margin: 20mm; }
</style></head><body>${html}</body></html>`;
}

// ── API: Generate CV ──────────────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  const { jobPosting } = req.body;
  if (!jobPosting?.trim()) return res.status(400).json({ error: 'Job posting is required.' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in .env file.' });

  const prompt = `You are an expert ATS resume optimisation specialist. Generate a fully tailored, ATS-proof CV based on the profile below.

CANDIDATE PROFILE:
${BASE_PROFILE}

JOB POSTING:
${jobPosting}

INSTRUCTIONS:
1. Extract the top 15-20 keywords/phrases from the job posting.
2. Generate a complete ATS-optimised CV that:
   - Uses EXACT keywords from the job posting naturally woven in
   - Has a tailored Professional Summary (3-4 sentences) mirroring the job's language
   - Uses strong action verbs (Built, Engineered, Automated, Designed, Delivered)
   - Makes every bullet an achievement, not a duty
   - Writes the summary to make the hiring manager think "we need this person"
   - Keeps all facts truthful — only reframe existing experience, never invent
   - Uses ATS-safe formatting (no tables, no columns, plain text)
   - Includes measurable results (numbers, %, time saved)
   - Section headers: PROFESSIONAL SUMMARY / EXPERIENCE / SKILLS / EDUCATION
3. Also extract the job title and company name for the filename.
4. Provide: MATCHED_KEYWORDS, MISSING_KEYWORDS, ATS_SCORE, JOB_TITLE, COMPANY_NAME

FORMAT EXACTLY:

---CV_START---
[Full plain text CV]
---CV_END---

---ANALYSIS_START---
MATCHED_KEYWORDS: keyword1, keyword2
MISSING_KEYWORDS: keyword1, keyword2
ATS_SCORE: 85
JOB_TITLE: Operations Analyst
COMPANY_NAME: Acme Corp
---ANALYSIS_END---`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: 'Anthropic API error: ' + err });
    }

    const data = await response.json();
    const raw = data.content.map(b => b.text || '').join('');

    // Parse CV
    const cvMatch = raw.match(/---CV_START---([\s\S]*?)---CV_END---/);
    const cvText = cvMatch ? cvMatch[1].trim() : raw;

    // Parse analysis
    const aMatch = raw.match(/---ANALYSIS_START---([\s\S]*?)---ANALYSIS_END---/);
    let matched = [], missing = [], score = 75, jobTitle = '', companyName = '';
    if (aMatch) {
      const a = aMatch[1];
      const m1 = a.match(/MATCHED_KEYWORDS:\s*(.+)/);
      const m2 = a.match(/MISSING_KEYWORDS:\s*(.+)/);
      const m3 = a.match(/ATS_SCORE:\s*(\d+)/);
      const m4 = a.match(/JOB_TITLE:\s*(.+)/);
      const m5 = a.match(/COMPANY_NAME:\s*(.+)/);
      matched     = m1 ? m1[1].split(',').map(s=>s.trim()).filter(Boolean) : [];
      missing     = m2 ? m2[1].split(',').map(s=>s.trim()).filter(Boolean) : [];
      score       = m3 ? parseInt(m3[1]) : 75;
      jobTitle    = m4 ? m4[1].trim() : '';
      companyName = m5 ? m5[1].trim() : '';
    }

    // Smart filename
    const filename = smartFilename(cvText, jobPosting, jobTitle, companyName);

    res.json({ raw, cvText, matched, missing, score, filename });

  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── API: Download DOCX ────────────────────────────────────────────────────
app.post('/api/download/docx', async (req, res) => {
  const { cvText, filename } = req.body;
  if (!cvText) return res.status(400).json({ error: 'No CV text provided.' });

  try {
    const buffer = await buildDocx(cvText);
    const fname = (filename || 'CV') + '.docx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Download PDF (HTML-based) ────────────────────────────────────────
app.post('/api/download/pdf', async (req, res) => {
  const { cvText, filename } = req.body;
  if (!cvText) return res.status(400).json({ error: 'No CV text provided.' });

  try {
    const htmlContent = buildPdfHtml(cvText);
    const fname = (filename || 'CV') + '.pdf';

    // Use built-in print to PDF via HTML file
    const tmpHtml = path.join(__dirname, 'tmp_cv.html');
    fs.writeFileSync(tmpHtml, htmlContent);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}.html"`);
    res.setHeader('X-Filename', fname);
    res.send(htmlContent);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Download TXT ─────────────────────────────────────────────────────
app.post('/api/download/txt', (req, res) => {
  const { cvText, filename } = req.body;
  if (!cvText) return res.status(400).json({ error: 'No CV text provided.' });
  const fname = (filename || 'CV') + '.txt';
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.send(cvText);
});

// ── Build Cover Letter DOCX ───────────────────────────────────────────────
async function buildCoverLetterDocx(letterText) {
  const DARK  = '111827';
  const MID   = '374151';
  const LIGHT = '6B7280';

  const lines = letterText.split('\n');
  const children = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { children.push(new Paragraph({ spacing: { before: 0, after: 120 }, children: [] })); continue; }

    // Name header (first line, looks like a name)
    if (children.length === 0 && /^[A-Z][a-z]+ [A-Z][a-z]+/.test(line) && line.length < 40) {
      children.push(new Paragraph({
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: line, bold: true, size: 44, color: DARK, font: 'Arial' })]
      }));
    }
    // Contact line
    else if ((line.includes('@') || line.includes('|')) && children.length < 4) {
      children.push(new Paragraph({
        spacing: { before: 0, after: 200 },
        children: [new TextRun({ text: line, size: 19, color: LIGHT, font: 'Arial' })]
      }));
    }
    // Closing like "Sincerely," "Best regards,"
    else if (/^(sincerely|best regards|kind regards|yours truly|warm regards)/i.test(line)) {
      children.push(new Paragraph({
        spacing: { before: 240, after: 40 },
        children: [new TextRun({ text: line, size: 21, color: MID, font: 'Arial' })]
      }));
    }
    // Default paragraph line
    else {
      children.push(new Paragraph({
        spacing: { before: 0, after: 60 },
        children: [new TextRun({ text: line, size: 21, color: MID, font: 'Arial' })]
      }));
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 21 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1080, right: 1200, bottom: 1080, left: 1200 }
        }
      },
      children
    }]
  });

  return await Packer.toBuffer(doc);
}

// ── API: Generate Cover Letter ────────────────────────────────────────────
app.post('/api/generate-cover-letter', async (req, res) => {
  const { jobPosting, cvText } = req.body;
  if (!jobPosting?.trim()) return res.status(400).json({ error: 'Job posting is required.' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in .env file.' });

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // Extract name and contact from the first two lines of BASE_PROFILE for the letter header
  const profileLines = BASE_PROFILE.trim().split('\n').filter(l => l.trim());
  const profileName    = (profileLines[0]?.replace(/^NAME:\s*/i, '') || 'Your Name').trim();
  const profileContact = (profileLines[1]?.replace(/^CONTACT:\s*/i, '') || '').trim();

  const prompt = `You are an expert cover letter writer. Write a compelling, personalised cover letter based on the profile below.

CANDIDATE PROFILE:
${BASE_PROFILE}

${cvText ? `TAILORED CV (already generated for this role):\n${cvText}\n` : ''}

JOB POSTING:
${jobPosting}

INSTRUCTIONS:
- Write a professional cover letter, 3–4 short paragraphs
- Opening: hook the reader — connect the candidate's unique value to this specific role
- Middle: highlight 2–3 concrete achievements most relevant to this job (use numbers/impact from the profile)
- Closing: express genuine enthusiasm, invite next steps, confident but not pushy
- Tone: warm, direct, confident — not stiff corporate language
- Mirror keywords naturally from the job posting
- Keep it under 350 words
- NEVER invent achievements, tools, or experience not in the profile

FORMAT EXACTLY:

---LETTER_START---
${profileName}
${profileContact}

${today}

Dear Hiring Team,

[Letter body]

Sincerely,
${profileName}
---LETTER_END---`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: 'Anthropic API error: ' + err });
    }

    const data = await response.json();
    const raw = data.content.map(b => b.text || '').join('');

    const match = raw.match(/---LETTER_START---([\s\S]*?)---LETTER_END---/);
    const letterText = match ? match[1].trim() : raw.trim();

    res.json({ letterText });

  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── API: Download Cover Letter DOCX ──────────────────────────────────────
app.post('/api/download/cover-letter/docx', async (req, res) => {
  const { letterText, filename } = req.body;
  if (!letterText) return res.status(400).json({ error: 'No letter text provided.' });

  try {
    const buffer = await buildCoverLetterDocx(letterText);
    const fname = (filename || 'CoverLetter') + '_CoverLetter.docx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Download Cover Letter TXT ────────────────────────────────────────
app.post('/api/download/cover-letter/txt', (req, res) => {
  const { letterText, filename } = req.body;
  if (!letterText) return res.status(400).json({ error: 'No letter text provided.' });
  const fname = (filename || 'CoverLetter') + '_CoverLetter.txt';
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.send(letterText);
});

app.listen(PORT, () => {
  console.log(`\n✨ HireMe.ai running at http://localhost:${PORT}\n`);
});
