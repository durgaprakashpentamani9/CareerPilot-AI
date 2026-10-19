export function assertInternshipsResponse(payload, context = 'Internship API') {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.internships)) {
    throw new Error(`${context} returned an invalid response: expected an internships array.`);
  }
  payload.internships.forEach((item, index) => {
    const label = ` at position ${index + 1}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`${context} returned an invalid internship${label}.`);
    }
    for (const field of ['_id', 'title', 'company', 'description', 'location', 'source', 'applyLink']) {
      if (typeof item[field] !== 'string') {
        throw new Error(`${context} returned an invalid internship${label}: missing ${field}.`);
      }
    }
    if (!Array.isArray(item.skillsRequired) || item.skillsRequired.some(skill => typeof skill !== 'string')) {
      throw new Error(`${context} returned an invalid internship${label}: skillsRequired must be an array.`);
    }
    for (const field of ['deadline', 'postedDate']) {
      if (!Number.isFinite(new Date(item[field]).getTime())) {
        throw new Error(`${context} returned an invalid internship${label}: ${field} must be a valid date.`);
      }
    }
    if (item.embedding !== undefined && (!Array.isArray(item.embedding) || item.embedding.some(value => typeof value !== 'number' || !Number.isFinite(value)))) {
      throw new Error(`${context} returned an invalid internship${label}: embedding must be an array of finite numbers.`);
    }
    if (item.match !== undefined && item.match !== null && typeof item.match !== 'object') {
      throw new Error(`${context} returned an invalid match value${label}.`);
    }
  });
  return payload;
}

export function assertMatchesResponse(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.matches)) {
    throw new Error('Match API returned an invalid response: expected a matches array.');
  }
  return payload;
}

export function assertSkillGapResponse(payload, internshipId) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.internshipId !== internshipId) {
    throw new Error('Skill-gap API returned a report for an unexpected internship.');
  }
  for (const field of ['requiredSkills', 'missingSkills', 'matchedSkills', 'skillGap']) {
    if (!Array.isArray(payload[field])) throw new Error(`Skill-gap API returned an invalid ${field} list.`);
  }
  if ([...payload.missingSkills, ...payload.matchedSkills].some(skill => typeof skill !== 'string')) {
    throw new Error('Skill-gap API returned an invalid skill name.');
  }
  if (payload.skillGap.some(item => !item || typeof item !== 'object' || Array.isArray(item) ||
    typeof item.skill !== 'string' || !['High', 'Medium'].includes(item.priority) ||
    typeof item.suggestedAction !== 'string' || typeof item.miniProject !== 'string')) {
    throw new Error('Skill-gap API returned an invalid learning recommendation.');
  }
  return payload;
}

export function skillGapErrorMessage(error) {
  return error?.response?.data?.message || error?.message || 'Could not load a skill-gap plan.';
}

export function filterInternships(internships, searchTerm = '', source = 'All') {
  if (!Array.isArray(internships)) throw new Error('Cannot filter internships: response is not an array.');
  const term = String(searchTerm).trim().toLowerCase();
  const selectedSource = normalizeSource(source);
  return internships.filter(item =>
    (`${item.title} ${item.company} ${item.description}`).toLowerCase().includes(term) &&
    (selectedSource === 'all' || selectedSource === 'all sources' || normalizeSource(item.source) === selectedSource));
}

function normalizeSource(source) {
  return String(source ?? '').trim().toLocaleLowerCase();
}

export function getInternshipSources(internships) {
  if (!Array.isArray(internships)) throw new Error('Cannot list internship sources: response is not an array.');
  const sources = new Map();
  for (const internship of internships) {
    const displayName = internship.source.trim();
    const key = normalizeSource(displayName);
    if (key && !sources.has(key)) sources.set(key, displayName);
  }
  return [...sources.values()];
}

export function rankInternships(internships) {
  if (!Array.isArray(internships)) throw new Error('Cannot rank internships: response is not an array.');
  return [...internships].sort((a, b) => (b.match?.score || 0) - (a.match?.score || 0));
}
