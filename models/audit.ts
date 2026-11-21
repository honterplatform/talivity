import mongoose, { Schema, model, models, type InferSchemaType } from 'mongoose';

const AuditSchema = new Schema(
  {
    /**
     * Unguessable id used in public URLs. ObjectIds are partly sequential, so
     * exposing them let anyone walk the collection. No default on purpose:
     * legacy documents simply lack the field (sparse unique index).
     */
    publicId: { type: String },
    companyName: { type: String, required: true },
    companyUrl: { type: String, default: null },
    companyDomain: { type: String, default: null },
    aliases: { type: [String], default: [] },
    industry: { type: String, required: true },
    competitorSet: { type: [String], default: [] },
    profileSource: { type: String, default: null },
    email: { type: String, required: true, index: true },
    /** Salted hash — used for per-IP rate limiting without storing raw IPs. */
    ipHash: { type: String, default: null },
    status: { type: String, enum: ['running', 'complete', 'failed'], default: 'running' },
    progress: { type: Schema.Types.Mixed, default: null },
    /** Set every 20s by the process that owns a queued/running audit. */
    heartbeatAt: { type: Date, default: null },
    score: { type: Number, default: null },
    citationsOwned: { type: Number, default: 0 },
    citationsTotal: { type: Number, default: 0 },
    totalResponses: { type: Number, default: 0 },
    substantiveResponses: { type: Number, default: null },
    platformsUsed: { type: Number, default: 0 },
    platforms: { type: [String], default: [] },
    sourceMix: { type: Schema.Types.Mixed, default: {} },
    sampleResponses: { type: [Schema.Types.Mixed], default: [] },
    competitors: { type: Schema.Types.Mixed, default: {} },
    sentiment: { type: String, enum: ['positive', 'neutral', 'negative', null], default: null },
    sentimentBreakdown: { type: Schema.Types.Mixed, default: null },
    scoreBreakdown: { type: Schema.Types.Mixed, default: null },
    platformStats: { type: Schema.Types.Mixed, default: null },
    analysisMethod: { type: String, default: null },
    queries: { type: [String], default: [] },
    /** Every answer collected (admin/debugging; not shown on the public report). */
    responses: { type: [Schema.Types.Mixed], default: [] },
    notRecognized: { type: Boolean, default: false },
    /** Shown to the prospect. */
    errorMessage: { type: String, default: null },
    /** Admin-only diagnostics (provider errors etc.). */
    internalError: { type: String, default: null },
    /** First click on "Book your strategy session" — a hot lead. */
    ctaClickedAt: { type: Date, default: null },
    ctaClicks: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  // updatedAt doubles as the job heartbeat for stale-audit detection.
  { minimize: false, timestamps: { createdAt: false, updatedAt: true } }
);

AuditSchema.index({ publicId: 1 }, { unique: true, sparse: true });
AuditSchema.index({ email: 1, createdAt: -1 });
AuditSchema.index({ ipHash: 1, createdAt: -1 });
AuditSchema.index({ createdAt: -1 });

export type AuditDoc = InferSchemaType<typeof AuditSchema> & {
  _id: mongoose.Types.ObjectId;
  updatedAt?: Date;
};

export const Audit = (models.Audit as mongoose.Model<AuditDoc>) || model<AuditDoc>('Audit', AuditSchema);
