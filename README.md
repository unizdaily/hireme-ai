# HireMe.ai — ATS CV & Cover Letter Generator

A full-stack web app that generates tailored, ATS-optimised CVs and cover letters from job postings using the Claude API.

Paste a job posting → get a CV with real-time keyword scoring, matched/missing keyword analysis, and downloads in `.docx`, `.pdf`, and `.txt`.

> **Free to use** — you just need a free [Anthropic API key](https://console.anthropic.com/) and your own profile details. No subscription, no paywall.

---

## Features

- **AI-powered CV generation** — uses the Claude API to tailor your CV to each job posting
- **ATS keyword scoring** — shows matched and missing keywords with a compatibility score
- **Cover letter generation** — writes a personalised cover letter based on your CV and the job posting
- **Multi-format downloads** — export as Word (.docx), PDF, or plain text (.txt)
- **Smart filename generation** — files auto-named as `Name_JobTitle_Company_Date`
- **Custom UI** — built with pure HTML/CSS/JS, no framework

## Tech Stack

- **Backend:** Node.js, Express
- **AI:** Claude API (Anthropic)
- **Document generation:** docx (npm)
- **Frontend:** HTML, CSS, JavaScript (no framework)

---

## Getting Started

### Prerequisites
- Node.js v18+
- A free [Anthropic API key](https://console.anthropic.com/) — create an account and generate one under API Keys

### 1. Clone & install

```bash
git clone https://github.com/unizdaily/hireme-ai.git
cd hireme-ai
npm install
```

### 2. Add your API key

```bash
cp .env.example .env
```

Open `.env` and paste your key:

```
ANTHROPIC_API_KEY=your_api_key_here
PORT=3000
```

### 3. Add your own profile

Open `server.js` and find the `BASE_PROFILE` section near the top (around line 18). Replace it with your own details:

```js
const BASE_PROFILE = `
NAME: Your Full Name
CONTACT: City, Country | phone | email | linkedin | github

CURRENT TITLE: Your current or target job title

EXPERIENCE:

1. Job Title — Company Name, Location
   Start – End | Full-time / Part-time
   - Achievement with numbers
   - Achievement with numbers

SKILLS:
Category: tool1, tool2, tool3

EDUCATION:
- Degree, Institution | Year

LANGUAGES: English (Fluent), ...
`;
```

The more detail you include, the better the CV output. Add all your real experience, skills, and achievements — the AI will selectively tailor it to each job posting.

### 4. Run

```bash
node server.js
```

Open [http://localhost:3000](http://localhost:3000)

---

## Usage

1. Paste a full job posting into the input panel
2. Click **Generate CV** — the AI tailors your CV to the role
3. Review the ATS keyword analysis on the right
4. Click **+ Cover Letter** to generate a matching cover letter
5. Download in your preferred format:
   - **ATS portal** (LinkedIn, Indeed, company site) → `.txt`
   - **Email to recruiter** → `.docx`
   - **Direct / startup apply** → `.pdf`

---

## Project Structure

```
hireme-ai/
├── server.js          # Express backend + Claude API integration + your profile
├── public/
│   └── index.html     # Single-page frontend
├── .env.example       # Environment variable template
└── package.json
```

---

## Author

**Juniza Magana** — [linkedin.com/in/maganajuniza](https://linkedin.com/in/maganajuniza) · [github.com/unizdaily](https://github.com/unizdaily)
