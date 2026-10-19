import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSkillGapReport } from '../src/agents/skillGapAgent.js';

const internship = { _id: 'role-1', skillsRequired: [' React ', 'Node   JS', 'GraphQL', 'GraphQL'] };
const match = { userId: 'user-1', internshipId: 'role-1', missingSkills: ['GraphQL'] };
const webInternship = { _id: 'web-role', skillsRequired: ['JavaScript', 'React', 'HTML', 'CSS', 'Git'] };
const webMatch = { userId: 'fixture-user', internshipId: 'web-role', missingSkills: ['Git'] };

test('controlled profile omitting Git receives a prioritized Git recommendation', () => {
  const profile = { userId: 'fixture-user', resumeText: 'Controlled test resume', skills: ['JavaScript', 'React', 'HTML', 'CSS'] };
  const report = buildSkillGapReport(webMatch, profile, webInternship);
  assert.deepEqual(report.requiredSkills, ['JavaScript', 'React', 'HTML', 'CSS', 'Git']);
  assert.deepEqual(report.matchedSkills, ['JavaScript', 'React', 'HTML', 'CSS']);
  assert.deepEqual(report.missingSkills, ['Git']);
  assert.equal(report.skillGap.length, 1);
  assert.equal(report.skillGap[0].skill, 'Git');
  assert.equal(report.skillGap[0].priority, 'High');
  assert.match(report.skillGap[0].suggestedAction, /Git/);
  assert.match(report.skillGap[0].miniProject, /Git/);
});

test('controlled profile with all five web skills returns zero missing skills', () => {
  const profile = { userId: 'fixture-user', resumeText: 'Controlled test resume', skills: ['JavaScript', 'React', 'HTML', 'CSS', 'Git'] };
  const report = buildSkillGapReport(webMatch, profile, webInternship);
  assert.deepEqual(report.matchedSkills, ['JavaScript', 'React', 'HTML', 'CSS', 'Git']);
  assert.deepEqual(report.missingSkills, []);
  assert.deepEqual(report.skillGap, []);
});

test('creates a prioritized plan from saved profile skills with case and whitespace normalization', () => {
  const report = buildSkillGapReport(match, { resumeText: 'Saved resume', skills: ['react', ' NODE JS '] }, internship);
  assert.equal(report.internshipId, 'role-1');
  assert.deepEqual(report.matchedSkills, [' React ', 'Node   JS']);
  assert.deepEqual(report.missingSkills, ['GraphQL']);
  assert.equal(report.priorities[0].skill, 'GraphQL');
  assert.equal(report.priorities[0].priority, 'High');
  assert.match(report.priorities[0].suggestedAction, /GraphQL/);
  assert.match(report.priorities[0].miniProject, /GraphQL/);
  assert.deepEqual(report.skillGap, report.priorities);
});

test('returns an honest empty plan when the saved profile covers all required skills', () => {
  const report = buildSkillGapReport(match, { resumeText: 'Saved resume', skills: ['react', 'node js', 'graphql'] }, internship);
  assert.deepEqual(report.missingSkills, []);
  assert.deepEqual(report.priorities, []);
  assert.deepEqual(report.skillGap, []);
  assert.deepEqual(report.matchedSkills, [' React ', 'Node   JS', 'GraphQL']);
});

test('distinguishes an internship with no listed requirements', () => {
  const report = buildSkillGapReport(match, { resumeText: 'Saved resume', skills: [] }, { _id: 'role-1', skillsRequired: [] });
  assert.deepEqual(report.requiredSkills, []);
  assert.deepEqual(report.missingSkills, []);
  assert.deepEqual(report.skillGap, []);
});

test('rejects broken profile, internship, and cross-internship inputs instead of fabricating results', () => {
  assert.throws(() => buildSkillGapReport(match, { skills: 'React' }, internship), /Saved profile skills must be an array/);
  assert.throws(() => buildSkillGapReport(match, { skills: ['React'] }, { ...internship, skillsRequired: ['GraphQL', 1] }), /Internship required skills must be an array/);
  assert.throws(() => buildSkillGapReport(match, { skills: ['React'] }, { ...internship, _id: 'other' }), /does not belong to the selected internship/);
});
