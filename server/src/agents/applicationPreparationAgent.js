const SECTION_HEADINGS = [
  ['professional summary', 'summary'], ['summary', 'summary'], ['profile', 'summary'], ['objective', 'summary'],
  ['technical proficiencies', 'skills'], ['technical skills', 'skills'], ['core skills', 'skills'], ['key skills', 'skills'], ['skill set', 'skills'],
  ['skills and tools', 'skills'], ['skills & tools', 'skills'], ['technologies', 'skills'], ['skills', 'skills'],
  ['selected projects', 'projects'], ['personal projects', 'projects'], ['academic projects', 'projects'], ['relevant projects', 'projects'], ['key projects', 'projects'],
  ['project experience', 'projects'], ['projects', 'projects'], ['project', 'projects'],
  ['professional experience', 'experience'], ['work experience', 'experience'], ['employment history', 'experience'],
  ['experience', 'experience'], ['education and training', 'education'], ['education & training', 'education'],
  ['education', 'education'], ['certifications', 'other'], ['awards', 'other'], ['publications', 'other'],
];
SECTION_HEADINGS.sort((a, b) => b[0].length - a[0].length);

const normalizeSkill = value => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const normalizeText = value => String(value ?? '').replace(/\s+/g, ' ').trim();

function matchHeading(line) {
  const cleaned = line.trim().replace(/^[#*•\-–—]+\s*/, '');
  const normalized = cleaned.replace(/[:|–—-]+\s*$/, '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  for (const [heading, section] of SECTION_HEADINGS) {
    if (normalized === heading) return { section, label: cleaned.replace(/[:|–—-]+\s*$/, '').trim(), content: '' };
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const inline = new RegExp(`^${escaped}\\s*[:|–—-]\\s*(.*)$`, 'i').exec(cleaned);
    if (inline) return { section, label: cleaned.slice(0, cleaned.length - inline[1].length).replace(/[:|–—-]+\s*$/, '').trim(), content: inline[1].trim() };
  }
  return null;
}

function splitInlineHeadings(text) {
  const aliases = SECTION_HEADINGS.map(([heading]) => heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const marker = new RegExp(`(?:${aliases})\\s*[:|–—-]`, 'ig');
  return text.split('\n').flatMap(line => {
    const boundaries = [];
    for (const match of line.matchAll(marker)) {
      if (match.index > 0 && /:\s*\S/.test(line.slice(0, match.index))) boundaries.push(match.index);
    }
    if (!boundaries.length) return [line];
    const pieces = [];
    let start = 0;
    for (const boundary of boundaries) {
      const before = line.slice(start, boundary).trimEnd();
      if (before) pieces.push(before);
      start = boundary;
    }
    pieces.push(line.slice(start));
    return pieces;
  });
}

function formatResume(text) {
  const lines = splitInlineHeadings(String(text).replace(/\r\n?/g, '\n').replace(/[\u00a0\u200b\ufeff]/g, ' '))
    .map(line => line.replace(/[\t ]+/g, ' ').trim())
    .filter((line, index, all) => line || (index > 0 && index < all.length - 1 && all[index - 1]));
  const output = [];
  for (const original of lines) {
    if (!original) {
      if (output.length && output.at(-1) !== '') output.push('');
      continue;
    }
    const heading = matchHeading(original);
    const line = /^[•●▪◦*\-–—]\s*/.test(original) ? `• ${original.replace(/^[•●▪◦*\-–—]+\s*/, '')}` : original;
    if (heading && output.length && output.at(-1) !== '') output.push('');
    output.push(line);
  }
  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function sectionRange(lines, section) {
  const start = lines.findIndex(line => matchHeading(line)?.section === section);
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const found = matchHeading(lines[i]);
    if (found) { end = i; break; }
  }
  return { start, end, heading: matchHeading(lines[start]) };
}

function listSkills(lines, range) {
  const values = [];
  const first = range.heading.content;
  if (first) values.push(first);
  for (let i = range.start + 1; i < range.end; i++) {
    if (lines[i].trim()) values.push(lines[i].replace(/^[•●▪◦*\-–—]+\s*/, ''));
  }
  const seen = new Set();
  return values.join(',').split(/[,|/;•●▪◦\n]/).map(value => value.trim()).filter(value => {
    const key = normalizeSkill(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function reorderProjects(lines, requiredSkills) {
  const range = sectionRange(lines, 'projects');
  if (!range) return lines;
  const original = lines.slice(range.start + 1, range.end);
  const groups = [];
  let current = [];
  for (const line of original) {
    if (!line.trim()) {
      if (current.length) groups.push(current);
      current = [];
    } else if (/^[•●▪◦*\-–—]\s*/.test(line) && current.length) {
      groups.push(current);
      current = [line];
    } else current.push(line);
  }
  if (current.length) groups.push(current);
  const ordered = groups.map((lines, index) => ({ lines, index, score: requiredSkills.reduce((score, skill) => {
    const needle = normalizeSkill(skill);
    const content = normalizeSkill(lines.join(' '));
    return score + (needle && content.includes(needle) ? 1 : 0);
  }, 0) })).sort((a, b) => b.score - a.score || a.index - b.index)
    .flatMap((group, index) => {
      const lines = [...group.lines];
      if (!/^[•●▪◦*\-–—]\s*/.test(lines[0])) lines[0] = `• ${lines[0]}`;
      return index ? ['', ...lines] : lines;
    });
  if (groups.length < 2) return lines;
  return [...lines.slice(0, range.start + 1), ...ordered, ...lines.slice(range.end)];
}

export function generateResumeVariant(profile, internship) {
  if (!profile || typeof profile.resumeText !== 'string' || !profile.resumeText.trim()) {
    throw new TypeError('A saved resume is required to generate a tailored version.');
  }
  if (!internship || typeof internship !== 'object') {
    throw new TypeError('A selected internship is required to tailor this resume.');
  }
  const requiredSkills = [...new Map((Array.isArray(internship.skillsRequired) ? internship.skillsRequired : []).filter(skill => typeof skill === 'string' && skill.trim())
    .map(skill => [normalizeSkill(skill), skill.trim().replace(/\s+/g, ' ')])).values()];
  const profileSkills = Array.isArray(profile.skills) ? profile.skills.filter(skill => typeof skill === 'string' && skill.trim()) : [];
  const source = formatResume(profile.resumeText);
  let lines = source.split('\n');
  const range = sectionRange(lines, 'skills');
  const originalSkills = range ? listSkills(lines, range) : [];
  const originalKeys = new Set(originalSkills.map(normalizeSkill));
  const profileSeen = new Set();
  const profileUnique = profileSkills.map(skill => skill.trim().replace(/\s+/g, ' ')).filter(skill => {
    const key = normalizeSkill(skill);
    if (profileSeen.has(key)) return false;
    profileSeen.add(key);
    return true;
  });
  const skillPool = new Map();
  for (const skill of [...originalSkills, ...profileUnique]) {
    const key = normalizeSkill(skill);
    if (!skillPool.has(key)) skillPool.set(key, skill);
  }
  const requiredKeys = new Set(requiredSkills.map(normalizeSkill));
  const matchedSkills = requiredSkills.map(skill => skillPool.get(normalizeSkill(skill))).filter(Boolean);
  const missingSkills = requiredSkills.filter(skill => !skillPool.has(normalizeSkill(skill)));
  const remainingOriginal = originalSkills.filter(skill => !requiredKeys.has(normalizeSkill(skill)));
  const addedMatched = requiredSkills.map(skill => profileUnique.find(saved => normalizeSkill(saved) === normalizeSkill(skill)))
    .filter(skill => skill && !originalKeys.has(normalizeSkill(skill)));
  const skillOrder = [...matchedSkills, ...addedMatched, ...remainingOriginal];
  const dedupedSkillOrder = [...new Map(skillOrder.map(skill => [normalizeSkill(skill), skill])).values()];

  if (range) {
    const line = `${range.heading.label}: ${dedupedSkillOrder.join(', ')}`.trimEnd();
    lines = [...lines.slice(0, range.start), line, ...lines.slice(range.end)];
  } else if (dedupedSkillOrder.length) {
    const nameLine = lines.findIndex(line => line.trim());
    const insertAt = nameLine < 0 ? 0 : nameLine + 1;
    lines.splice(insertAt, 0, '', `Skills: ${dedupedSkillOrder.join(', ')}`);
  }

  lines = reorderProjects(lines, requiredSkills);
  const content = formatResume(lines.join('\n'));
  const changeSummary = [
    requiredSkills.length ? `Reordered existing skills for ${internship.title || 'this internship'} requirements.` : 'No required skills were listed for this internship.',
    `Skills to strengthen: ${missingSkills.length ? missingSkills.join(', ') : 'None identified.'}`,
    'Human approval required before applying.',
  ];
  return { content, changeSummary, matchedSkills, missingSkills, approved: false };
}
