import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResumeText } from '../src/agents/profileAgent.js';

const completeResume = `Avery Example
avery@example.test | Remote

TECHNICAL SKILLS
React, Node.js, MongoDB, JavaScript, SQL

Selected Projects
- Career board: Built a React and Node.js internship tracker in 2024.
- Data dashboard (Jan 2022 - Mar 2023): analyzed internship trends.

Professional Experience
Software Intern | Acme Labs | June 2023 - Present
- Built internal tools using JavaScript.
Research Assistant | North University | 2021 - 2022

Education & Training
BS Computer Science, North University, September 2019 - May 2023

Certifications
AWS Cloud Practitioner`;

test('extracts skills, projects, experience and education across common heading/date formats', () => {
  const parsed = parseResumeText(completeResume);
  assert.deepEqual(parsed.skills, ['javascript', 'react', 'node.js', 'mongodb', 'sql', 'aws']);
  assert.equal(parsed.projects.length, 2);
  assert.match(parsed.projects[0], /Career board/);
  assert.match(parsed.projects[1], /Jan 2022 - Mar 2023/);
  assert.equal(parsed.experience.length, 3);
  assert.match(parsed.experience[0], /June 2023/);
  assert.match(parsed.experience[1], /Built internal tools/);
  assert.match(parsed.experience[2], /2021 - 2022/);
  assert.equal(parsed.education.length, 1);
  assert.match(parsed.education[0], /September 2019 - May 2023/);
  assert.match(parsed.resumeText, /Selected Projects\n- Career board/);
});

test('supports inline headings and returns empty arrays for sections that are absent', () => {
  const parsed = parseResumeText('Profile: Junior engineer with React and SQL experience.\nPROJECTS: Built a portfolio site in 2025.\nSkills & Tools: React, SQL');
  assert.deepEqual(parsed.projects, ['Built a portfolio site in 2025.']);
  assert.deepEqual(parsed.skills, ['react', 'sql']);
  assert.deepEqual(parsed.experience, []);
  assert.deepEqual(parsed.education, []);
});

test('preserves line boundaries and recognizes experience/education heading variations', () => {
  const parsed = parseResumeText('Work History\nProduct Intern | Studio | 03/2022 - 08/2022\nAcademic Background\nBA Design, State College | 2018-2022');
  assert.deepEqual(parsed.experience, ['Product Intern | Studio | 03/2022 - 08/2022']);
  assert.deepEqual(parsed.education, ['BA Design, State College | 2018-2022']);
});

