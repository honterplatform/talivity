import mongoose, { Schema, model, models, type InferSchemaType } from 'mongoose';

const AuditSchema = new Schema(
  {
    companyName: { type: String, required: true },
    companyUrl: { type: String, default: null },
    industry: { type: String, required: true },
    email: { type: String, required: true, index: true },
    status: { type: String, enum: ['running', 'complete', 'failed'], default: 'running' },
    score: { type: Number, default: null },
    citationsOwned: { type: Number, default: 0 },
    citationsTotal: { type: Number, default: 0 },
    totalResponses: { type: Number, default: 0 },
    platformsUsed: { type: Number, default: 0 },
    sourceMix: { type: Schema.Types.Mixed, default: {} },
    sampleResponses: { type: [Schema.Types.Mixed], default: [] },
    competitors: { type: Schema.Types.Mixed, default: {} },
    sentiment: { type: String, enum: ['positive', 'neutral', 'negative', null], default: null },
    notRecognized: { type: Boolean, default: false },
    errorMessage: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { minimize: false }
);

AuditSchema.index({ email: 1, createdAt: -1 });

export type AuditDoc = InferSchemaType<typeof AuditSchema> & { _id: mongoose.Types.ObjectId };

export const Audit = (models.Audit as mongoose.Model<AuditDoc>) || model<AuditDoc>('Audit', AuditSchema);
