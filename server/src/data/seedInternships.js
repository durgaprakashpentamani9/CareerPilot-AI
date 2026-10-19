const seedDefinitions = [
  ['Frontend Engineering Intern', 'NovaLearn', ['javascript', 'react', 'html', 'css', 'git']],
  ['Backend Developer Intern', 'SkillBridge Labs', ['node.js', 'express', 'mongodb', 'rest api', 'git']],
  ['AI Product Intern', 'CareerCraft AI', ['python', 'machine learning', 'communication', 'product management']],
  ['Full Stack MERN Intern', 'ApplyFlow', ['javascript', 'react', 'node.js', 'mongodb']],
  ['UX Research Intern', 'MapleWorks', ['figma', 'communication', 'data analysis']],
  ['Junior React Developer', 'BrightLabs', ['javascript', 'react', 'typescript', 'testing']],
  ['Data Analyst Intern', 'Northstar Data', ['python', 'sql', 'data analysis']],
  ['QA Automation Intern', 'QualityWorks', ['javascript', 'testing', 'git']],
  ['Cloud Support Trainee', 'CloudNest', ['aws', 'docker']],
  ['Product Design Intern', 'Studio Grove', ['figma', 'communication', 'html', 'css']],
];

export function createSeedInternships(makeRecord) {
  if (typeof makeRecord !== 'function') throw new TypeError('A record factory is required to create seed internships.');
  return seedDefinitions.map(([title, company, skillsRequired]) => makeRecord({
    title,
    company,
    description: `Work with ${company} on real projects and collaborate with experienced mentors.`,
    skillsRequired: [...skillsRequired],
    location: 'Remote',
    applyLink: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(title)}`,
    source: 'CareerPilot curated',
    deadline: new Date(Date.now() + 45 * 864e5).toISOString(),
    postedDate: new Date().toISOString(),
    embedding: [],
  }));
}

export { seedDefinitions };
