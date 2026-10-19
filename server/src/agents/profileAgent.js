import pdf from 'pdf-parse';

const skillNames = [
  'javascript', 'typescript', 'react', 'node.js', 'express', 'mongodb', 'python', 'java',
  'html', 'css', 'tailwind', 'git', 'sql', 'aws', 'docker', 'machine learning',
  'data analysis', 'communication', 'problem solving', 'figma', 'rest api', 'next.js',
  'testing', 'leadership', 'product management',
];

const headingGroups = {
  projects: ['projects', 'project', 'project experience', 'selected projects', 'personal projects', 'academic projects', 'key projects', 'relevant projects', 'project portfolio'],
  experience: ['experience', 'work experience', 'professional experience', 'employment history', 'work history', 'career history', 'internship experience', 'internships', 'professional background', 'work and leadership experience', 'work & leadership experience'],
  education: ['education', 'educational background', 'academic background', 'academic qualifications', 'education and training', 'education & training'],
  skills: ['skills', 'technical skills', 'core skills', 'key skills', 'skills and tools', 'skills & tools', 'tools and technologies', 'tools & technologies', 'technologies', 'technical proficiencies', 'technical expertise', 'competencies'],
};
const otherHeadings = ['summary', 'professional summary', 'profile', 'objective', 'career objective', 'certifications', 'certificates', 'awards', 'publications', 'leadership', 'volunteer experience', 'languages', 'interests', 'additional information', 'references', 'contact'];
const allHeadings = Object.entries(headingGroups).flatMap(([section, values]) => values.map(value => [value, section]))
  .concat(otherHeadings.map(value => [value, null])).sort((a, b) => b[0].length - a[0].length);

function normalizeHeading(value) {
  return value.toLowerCase().replace(/^#+\s*/, '').replace(/[|:\u2013\u2014-]+\s*$/, '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
}

function headingMatch(line) {
  const cleaned = line.trim().replace(/^#+\s*/, '').replace(/^[\u2022\u25cf\u25aa\u2023*\-\u2013\u2014]+\s*/, '').trim();
  const normalized = normalizeHeading(cleaned);
  for (const [heading, section] of allHeadings) {
    if (normalized === heading) return { section, content: '' };
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const inline = new RegExp(`^${escaped}\\s*[:|\\-\\u2013\\u2014]\\s*(.+)$`, 'i').exec(cleaned);
    if (inline) return { section, content: inline[1].trim() };
  }
  return null;
}

function cleanResumeText(raw) {
  return String(raw || '').replace(/\r\n?/g, '\n').replace(/[\u00a0\u200b\ufeff]/g, ' ')
    .split('\n').map(line => line.replace(/[\t ]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function extractSections(resumeText) {
  const sections = { projects: [], experience: [], education: [], skills: [] };
  let current = null;
  for (const line of resumeText.split('\n')) {
    const heading = headingMatch(line);
    if (heading) {
      current = heading.section;
      if (current && heading.content) sections[current].push(heading.content);
    } else if (current && line) {
      sections[current].push(line.replace(/^[\u2022\u25cf\u25aa\u2023*\-\u2013\u2014]+\s*/, '').trim());
    }
  }
  for (const key of Object.keys(sections)) sections[key] = [...new Set(sections[key].map(s => s.trim()).filter(Boolean))].slice(0, 8);
  return sections;
}

function extractSkills(resumeText) {
  const searchable = resumeText.toLowerCase();
  return skillNames.filter(skill => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(searchable);
  });
}

export function parseResumeText(rawText) {
  const resumeText = cleanResumeText(rawText);
  const sections = extractSections(resumeText);
  return {
    resumeText,
    skills: extractSkills(resumeText),
    projects: sections.projects,
    experience: sections.experience,
    education: sections.education,
    summary: resumeText.replace(/\s+/g, ' ').slice(0, 220),
    embedding: [],
  };
}

export async function parseResume(buffer) {
  const parsedPdf = await pdf(buffer);
  return parseResumeText(parsedPdf?.text || '');
}
