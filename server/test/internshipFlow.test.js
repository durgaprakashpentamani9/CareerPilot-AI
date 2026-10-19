import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertInternshipList,
  discoverForProfile,
  generateProfileMatches,
  scoreInternship,
} from '../src/services/internshipFlow.js';
import { createSeedInternships, seedDefinitions } from '../src/data/seedInternships.js';

const internships = [
  { _id: 'frontend', title: 'Frontend Engineering Intern', company: 'Northstar', description: 'Build web apps.', location: 'Remote', source: 'Curated', applyLink: 'https://jobs.example.test/frontend', skillsRequired: ['javascript', 'react'], deadline: '2026-12-15T00:00:00.000Z', postedDate: '2026-10-01T00:00:00.000Z' },
  { _id: 'data', title: 'Data Analyst Intern', company: 'Data House', description: 'Analyze data.', location: 'Remote', source: 'Curated', applyLink: 'https://jobs.example.test/data', skillsRequired: ['python', 'sql'], deadline: '2026-12-15T00:00:00.000Z', postedDate: '2026-10-01T00:00:00.000Z' },
];

test('rejects missing or malformed internship response arrays and skill lists', () => {
  assert.throws(() => assertInternshipList(undefined), /expected an array/);
  assert.throws(() => assertInternshipList({ internships }), /expected an array/);
  assert.throws(() => assertInternshipList([{ ...internships[0], skillsRequired: undefined }]), /skillsRequired must be an array/);
  assert.throws(() => assertInternshipList([{ ...internships[0], skillsRequired: ['react', 42] }]), /skillsRequired must be an array/);
  assert.throws(() => assertInternshipList([{ ...internships[0], postedDate: 'invalid date' }]), /postedDate must be a valid date/);
});

test('regresses Sync returning raw seed tuples from the empty Mongo fallback', () => {
  const profile = { skills: ['react'], preferences: { roles: [] }, resumeText: 'Saved resume' };
  assert.throws(() => discoverForProfile(seedDefinitions, profile), /expected an object/);
});

test('regresses Generate matches failing on raw seed tuples and validates the normalized fallback', () => {
  const profile = { skills: ['react'], preferences: { roles: [] }, resumeText: 'Saved resume' };
  assert.throws(() => generateProfileMatches('user-1', profile, seedDefinitions, () => 'match-id'), /expected an object/);

  let id = 0;
  const hydrated = createSeedInternships(record => ({ _id: `seed-${++id}`, ...record }));
  assert.equal(hydrated.length, seedDefinitions.length);
  assert.doesNotThrow(() => assertInternshipList(hydrated));
  assert.equal(typeof hydrated[0].deadline, 'string');
  assert.deepEqual(discoverForProfile(hydrated, profile).map(item => item.title), ['Frontend Engineering Intern', 'Full Stack MERN Intern', 'Junior React Developer']);
  assert.equal(generateProfileMatches('user-1', profile, hydrated, () => `match-${++id}`).length, hydrated.length);
});

test('sync discovery follows saved profile skills and returns curated fallback without a profile', () => {
  const profile = { skills: ['react'], preferences: { roles: [] } };
  assert.deepEqual(discoverForProfile(internships, profile).map(item => item._id), ['frontend']);
  assert.deepEqual(discoverForProfile(internships, null).map(item => item._id), ['frontend', 'data']);
});

test('generated match scores use the saved profile and are sorted by score', () => {
  const profile = { resumeText: 'Resume text', skills: ['react'] };
  const matches = generateProfileMatches('user-1', profile, internships, () => 'match-id');
  assert.deepEqual(matches.map(match => match.internshipId), ['frontend', 'data']);
  assert.equal(matches[0].score, 50);
  assert.deepEqual(matches[0].matchedSkills, ['react']);
  assert.deepEqual(matches[0].missingSkills, ['javascript']);
  assert.equal(matches[1].score, 0);
  assert.deepEqual(scoreInternship(profile, internships[0]).matchedSkills, ['react']);
});
