function assertInternship(internship, index = 0) {
  const label = ` at position ${index + 1}`;
  if (!internship || typeof internship !== 'object' || Array.isArray(internship)) {
    throw new Error(`Invalid internship record${label}: expected an object.`);
  }
  for (const field of ['_id', 'title', 'company', 'description', 'location', 'source', 'applyLink']) {
    if (typeof internship[field] !== 'string') {
      throw new Error(`Invalid internship record${label}: ${field} must be a string.`);
    }
  }
  if (!Array.isArray(internship.skillsRequired) || internship.skillsRequired.some(skill => typeof skill !== 'string')) {
    throw new Error(`Invalid internship record${label}: skillsRequired must be an array of strings.`);
  }
  for (const field of ['deadline', 'postedDate']) {
    if (!Number.isFinite(new Date(internship[field]).getTime())) {
      throw new Error(`Invalid internship record${label}: ${field} must be a valid date.`);
    }
  }
  if (internship.embedding !== undefined && (!Array.isArray(internship.embedding) || internship.embedding.some(value => typeof value !== 'number' || !Number.isFinite(value)))) {
    throw new Error(`Invalid internship record${label}: embedding must be an array of finite numbers.`);
  }
  return internship;
}

export function normalizeInternshipRecord(internship, index = 0) {
  assertInternship(internship, index);
  return {
    ...internship,
    _id: String(internship._id),
    skillsRequired: [...internship.skillsRequired],
    deadline: new Date(internship.deadline).toISOString(),
    postedDate: new Date(internship.postedDate).toISOString(),
    embedding: internship.embedding ? [...internship.embedding] : [],
  };
}

export function normalizeInternshipList(internships) {
  if (!Array.isArray(internships)) throw new Error('Internship data is invalid: expected an array.');
  return internships.map(normalizeInternshipRecord);
}

export function assertInternshipList(internships) {
  if (!Array.isArray(internships)) throw new Error('Internship data is invalid: expected an array.');
  internships.forEach(assertInternship);
  return internships;
}

export function discoverForProfile(internships, profile) {
  assertInternshipList(internships);
  if (!profile) return internships.slice(0, 5);
  const profileSkills = Array.isArray(profile.skills) ? profile.skills : [];
  const rolePreferences = Array.isArray(profile.preferences?.roles) ? profile.preferences.roles : [];
  const terms = [...profileSkills, ...rolePreferences]
    .filter(value => typeof value === 'string' && value.trim())
    .map(value => value.toLowerCase());
  const found = internships.filter(internship =>
    internship.skillsRequired.some(skill => terms.some(term => term.includes(skill.toLowerCase()) || skill.toLowerCase().includes(term))) ||
    terms.some(term => internship.title.toLowerCase().includes(term)));
  return found.length ? found : internships.slice(0, 5);
}

export function scoreInternship(profile, internship) {
  assertInternship(internship);
  const skills = Array.isArray(profile?.skills) ? profile.skills : [];
  const normalizedSkills = skills.filter(skill => typeof skill === 'string').map(skill => skill.toLowerCase());
  const matchedSkills = internship.skillsRequired.filter(skill => normalizedSkills.includes(skill.toLowerCase()));
  const missingSkills = internship.skillsRequired.filter(skill => !normalizedSkills.includes(skill.toLowerCase()));
  const score = internship.skillsRequired.length
    ? Math.round(matchedSkills.length / internship.skillsRequired.length * 100)
    : 0;
  return {
    score,
    matchedSkills,
    missingSkills,
    reason: matchedSkills.length
      ? `Your ${matchedSkills.join(', ')} align with this role.`
      : 'Build the listed core skills to strengthen your fit.',
  };
}

export function generateProfileMatches(userId, profile, internships, createId) {
  assertInternshipList(internships);
  return internships.map(internship => ({
    _id: createId(),
    userId,
    internshipId: internship._id,
    ...scoreInternship(profile, internship),
  })).sort((a, b) => b.score - a.score);
}
