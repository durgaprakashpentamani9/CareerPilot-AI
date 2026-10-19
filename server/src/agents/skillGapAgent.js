const normalizeSkill = skill => skill.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

function validateSkills(skills, label) {
  if (!Array.isArray(skills) || skills.some(skill => typeof skill !== 'string' || !skill.trim())) {
    throw new TypeError(`${label} must be an array of non-empty skill names.`);
  }
}

/** Build a deterministic, profile-specific learning plan from the current match inputs. */
export function buildSkillGapReport(match, profile, internship) {
  if (!match || typeof match !== 'object' || typeof match.userId !== 'string' || typeof match.internshipId !== 'string') {
    throw new TypeError('A valid user and internship match is required.');
  }
  if (!profile || typeof profile !== 'object') throw new TypeError('A saved profile is required.');
  if (!internship || typeof internship !== 'object' || typeof internship._id !== 'string' || !Array.isArray(internship.skillsRequired)) {
    throw new TypeError('A valid internship with required skills is required.');
  }
  validateSkills(profile.skills, 'Saved profile skills');
  validateSkills(internship.skillsRequired, 'Internship required skills');
  if (match.internshipId !== internship._id) throw new TypeError('The match does not belong to the selected internship.');

  const candidateSkills = new Set(profile.skills.map(normalizeSkill));
  const seen = new Set();
  const requiredSkills = internship.skillsRequired.filter(skill => {
    const normalized = normalizeSkill(skill);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
  const matchedSkills = requiredSkills.filter(skill => candidateSkills.has(normalizeSkill(skill)));
  const missingSkills = requiredSkills.filter(skill => !candidateSkills.has(normalizeSkill(skill)));
  const priorities = missingSkills.map((skill, index) => ({
    skill,
    priority: index < 2 ? 'High' : 'Medium',
    suggestedAction: `Learn ${skill} fundamentals, then complete a hands-on tutorial and practice the core workflow without copying the example.`,
    miniProject: `Build a small portfolio project that uses ${skill} to solve a concrete problem, and document your decisions and results.`,
  }));

  return { internshipId: internship._id, requiredSkills, missingSkills, matchedSkills, priorities, skillGap: priorities };
}
