import mongoose, { Document, Schema } from 'mongoose';

export interface IAuditLogDocument extends Document {
  action: string;
  entityType: string;
  entityId?: mongoose.Types.ObjectId;
  performedBy?: mongoose.Types.ObjectId;
  changes?: unknown;
  ipAddress?: string;
  timestamp: Date;
}

const auditLogSchema = new Schema<IAuditLogDocument>({
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: { type: Schema.Types.ObjectId },
  performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  changes: Schema.Types.Mixed,
  ipAddress: String,
  timestamp: { type: Date, default: Date.now },
});

// No timestamps plugin — has its own timestamp field
auditLogSchema.index({ performedBy: 1, timestamp: 1 });

export const AuditLog = mongoose.model<IAuditLogDocument>('AuditLog', auditLogSchema);
