import test from 'node:test';
import assert from 'node:assert/strict';
import { assertInternshipsResponse, assertMatchesResponse, assertSkillGapResponse, skillGapErrorMessage, filterInternships, getInternshipSources, rankInternships } from '../src/internshipData.js';

const listing = { _id: 'role-1', title: 'Web Intern', company: 'Example Co', description: 'Build a web app.', location: 'Remote', source: 'CareerPilot curated', applyLink: 'https://jobs.example.test/role-1', skillsRequired: ['react'], deadline: '2026-12-15T00:00:00.000Z', postedDate: '2026-10-01T00:00:00.000Z', embedding: [], match: null };

test('accepts the internship list response used by GET and Sync', () => {
  assert.deepEqual(assertInternshipsResponse({ internships: [listing] }).internships, [listing]);
  assert.deepEqual(assertInternshipsResponse({ count: 1, internships: [listing] }, 'POST /internships/sync').internships, [listing]);
});

test('surfaces malformed API response shapes instead of treating them as empty results', () => {
  assert.throws(() => assertInternshipsResponse(undefined), /expected an internships array/);
  assert.throws(() => assertInternshipsResponse({ internships: {} }), /expected an internships array/);
  assert.throws(() => assertInternshipsResponse({ internships: [{ ...listing, skillsRequired: undefined }] }), /skillsRequired must be an array/);
  assert.throws(() => assertInternshipsResponse({ internships: [['Frontend Engineering Intern', 'NovaLearn', ['react']]] }), /invalid internship at position 1/);
  assert.throws(() => assertMatchesResponse({ matches: undefined }), /expected a matches array/);
});

test('search and source filtering operate on validated internship records', () => {
  const rows = [
    { ...listing, match: { score: 40 } },
    { ...listing, _id: 'role-2', title: 'Data Intern', source: 'Remotive (live)', match: { score: 90 } },
    { ...listing, _id: 'role-3', title: 'Design Intern', source: ' careerpilot CURATED ', match: { score: 20 } },
  ];
  assert.deepEqual(filterInternships(rows, 'web intern').map(item => item._id), ['role-1']);
  const ranked = rankInternships(rows);
  assert.deepEqual(filterInternships(ranked, '', 'CAREERPILOT curated').map(item => item._id), ['role-1', 'role-3']);
  assert.deepEqual(filterInternships(ranked, '', 'Remotive (LIVE)').map(item => item._id), ['role-2']);
  assert.deepEqual(filterInternships(ranked, '', 'All sources').map(item => item._id), ['role-2', 'role-1', 'role-3']);
  assert.deepEqual(getInternshipSources(rows), ['CareerPilot curated', 'Remotive (live)']);
  assert.throws(() => filterInternships(undefined), /response is not an array/);
});

test('validates skill-gap reports for the selected internship and surfaces API failures', () => {
  const report = { internshipId: 'role-1', requiredSkills: ['React', 'GraphQL'], missingSkills: ['GraphQL'], matchedSkills: ['React'], skillGap: [{ skill: 'GraphQL', priority: 'High', suggestedAction: 'Practice GraphQL queries.', miniProject: 'Build a GraphQL API.' }] };
  assert.deepEqual(assertSkillGapResponse(report, 'role-1'), report);
  assert.throws(() => assertSkillGapResponse(report, 'role-2'), /unexpected internship/);
  assert.throws(() => assertSkillGapResponse({ ...report, skillGap: undefined }, 'role-1'), /invalid skillGap list/);
  assert.throws(() => assertSkillGapResponse({ ...report, skillGap: [{ skill: 'GraphQL' }] }, 'role-1'), /invalid learning recommendation/);
  assert.equal(skillGapErrorMessage({ response: { data: { message: 'Generate matches first' } } }), 'Generate matches first');
  assert.equal(skillGapErrorMessage({ message: 'Network unavailable' }), 'Network unavailable');
});
