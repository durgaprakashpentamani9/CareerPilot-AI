import test from 'node:test';
import assert from 'node:assert/strict';
import { generateResumeVariant } from '../src/agents/applicationPreparationAgent.js';

const resumeText = [
  'Avery Candidate',
  'Email: avery.candidate@example.com',
  'Technical Skills: React, CSS, JavaScript, Git, React, CSS',
  'Projects:',
  'Portfolio dashboard built with React and CSS.',
  '',
  'Git workflow helper written with Git and JavaScript.',
  'Education: North State University — B.S. Computer Science, 2022–2026',
].join('\n');

const profile = {
  resumeText,
  skills: ['JavaScript', 'React', 'HTML', 'CSS', 'Git', 'react'],
  projects: ['Portfolio dashboard built with React and CSS.', 'Git workflow helper written with Git and JavaScript.'],
};

test('preserves contact details and resume facts while normalizing duplicate skills and presentation', () => {
  const version = generateResumeVariant(profile, { title: 'Frontend Intern', skillsRequired: ['JavaScript', 'React', 'HTML', 'CSS', 'Git'] });
  assert.ok(version.content.includes('Email: avery.candidate@example.com'));
  assert.ok(version.content.includes('North State University — B.S. Computer Science, 2022–2026'));
  assert.ok(version.content.includes('Portfolio dashboard built with React and CSS.'));
  assert.ok(version.content.includes('Git workflow helper written with Git and JavaScript.'));
  assert.equal((version.content.match(/\bReact\b/gi) || []).length, 2); // One skills token and its factual project mention.
  assert.match(version.content, /Technical Skills: JavaScript, React, HTML, CSS, Git/);
  assert.match(version.content, /Education: North State University/);
  assert.match(version.content, /\n\nProjects:\n/);
  assert.match(version.content, /\n\nEducation:/);
  assert.equal(version.approved, false);
  assert.ok(version.changeSummary.includes('Human approval required before applying.'));
});

test('orders existing projects and skills for the selected role without changing project facts', () => {
  const frontend = generateResumeVariant(profile, { title: 'Frontend Intern', skillsRequired: ['React', 'CSS', 'JavaScript', 'HTML'] });
  const versionControl = generateResumeVariant(profile, { title: 'Version Control Intern', skillsRequired: ['Git', 'JavaScript'] });
  const portfolio = 'Portfolio dashboard built with React and CSS.';
  const gitTool = 'Git workflow helper written with Git and JavaScript.';
  assert.ok(frontend.content.indexOf(portfolio) < frontend.content.indexOf(gitTool));
  assert.ok(versionControl.content.indexOf(gitTool) < versionControl.content.indexOf(portfolio));
  assert.match(frontend.content, /Technical Skills: React, CSS, JavaScript, HTML, Git/);
  assert.match(versionControl.content, /Technical Skills: Git, JavaScript, React, CSS/);
  for (const version of [frontend, versionControl]) {
    assert.ok(version.content.includes(portfolio));
    assert.ok(version.content.includes(gitTool));
    assert.ok(version.content.includes('North State University — B.S. Computer Science, 2022–2026'));
    assert.ok(version.content.includes('avery.candidate@example.com'));
  }
});

test('reorders consecutive bullet projects even when the source has no blank separators', () => {
  const source = {
    resumeText: 'Casey\nSkills: React, Git\nProjects:\n• Built a React dashboard.\n• Created a Git workflow tool.',
    skills: ['React', 'Git'],
  };
  const report = generateResumeVariant(source, { title: 'Git Intern', skillsRequired: ['Git'] });
  assert.ok(report.content.indexOf('• Created a Git workflow tool.') < report.content.indexOf('• Built a React dashboard.'));
});

test('handles a missing skills heading, absent profile skills, and empty requirements without trailing commas', () => {
  const minimal = { resumeText: 'Jordan Candidate\njordan@example.org\nEducation: City College, B.A.\nProjects: No project details supplied.' };
  const withSkills = generateResumeVariant(minimal, { title: 'Intern', skillsRequired: ['React'] });
  assert.ok(!withSkills.content.includes('Skills:'), 'a role requirement absent from the saved profile must not be added as a candidate skill');
  assert.ok(withSkills.content.includes('jordan@example.org'));
  assert.ok(!withSkills.content.includes(',,') && !withSkills.content.includes(',\n'));
  assert.ok(withSkills.content.includes('Education: City College, B.A.'));
  const noRequirements = generateResumeVariant(minimal, { title: 'Intern' });
  assert.ok(noRequirements.content.includes('Jordan Candidate'));
  assert.ok(!noRequirements.content.includes('Skills:'));
  assert.deepEqual(noRequirements.matchedSkills, []);
  assert.deepEqual(noRequirements.missingSkills, []);
});

test('splits run-together section headings while keeping education and project facts', () => {
  const source = { resumeText: 'Taylor\nEducation: City College, B.A. Projects: Built a scheduling app.' };
  const version = generateResumeVariant(source, { title: 'Web Intern', skillsRequired: [] });
  assert.match(version.content, /Education: City College, B\.A\.\n\nProjects: Built a scheduling app\./);
});

test('rejects missing source resume rather than generating replacement facts', () => {
  assert.throws(() => generateResumeVariant({ skills: ['React'] }, { skillsRequired: ['React'] }), /saved resume is required/);
});
