import mongoose from 'mongoose';

// A string id keeps the existing API identifiers compatible in both storage
// modes. Schemas stay flexible while existing route payloads are migrated.
const schema = new mongoose.Schema({}, {
  strict: false,
  timestamps: true,
  versionKey: false,
  minimize: false,
  collection: undefined,
});

const definitions = {
  users: 'User',
  profiles: 'Profile',
  internships: 'Internship',
  matches: 'Match',
  resumeVersions: 'ResumeVersion',
  resumeHistory: 'ResumeHistory',
  applications: 'Application',
  notifications: 'Notification',
};

export const collectionNames = Object.keys(definitions);
export const models = Object.fromEntries(Object.entries(definitions).map(([collection, name]) => {
  const collectionSchema = schema.clone();
  collectionSchema.add({ _id: { type: String, required: true } });
  return [collection, mongoose.models[name] || mongoose.model(name, collectionSchema, collection)];
}));
