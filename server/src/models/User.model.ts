import mongoose, { Document, Model, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserRole } from '@shared/types/user.types';
import { ALLOWED_EMAIL_DOMAINS } from '@shared/constants/defaults';

export interface IUserDocument extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  department?: string;
  employeeId?: string;
  isEmailVerified: boolean;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  assignedBuildings: mongoose.Types.ObjectId[];
  assignedCampuses: mongoose.Types.ObjectId[];
  refreshTokens: Array<{ token: string; createdAt: Date }>;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

interface IUserModel extends Model<IUserDocument> {
  findByEmail(email: string): Promise<IUserDocument | null>;
}

const userSchema = new Schema<IUserDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: (val: string) => ALLOWED_EMAIL_DOMAINS.some((d) => val.endsWith(d)),
        message:
          'Only IIT BHU email addresses are allowed (@itbhu.ac.in, @iitbhu.ac.in, @bhu.ac.in)',
      },
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.MEMBER,
    },
    department: {
      type: String,
      trim: true,
    },
    employeeId: {
      type: String,
      trim: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
      select: false,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    assignedBuildings: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Building',
      },
    ],
    assignedCampuses: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Campus',
      },
    ],
    refreshTokens: {
      type: [
        {
          token: { type: String, required: true },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      select: false,
      default: [],
    },
    lastLogin: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ emailVerificationToken: 1 }, { sparse: true });
userSchema.index({ passwordResetToken: 1 }, { sparse: true });

// Pre-save: hash password + enforce max 5 refresh tokens
userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  if (this.refreshTokens && this.refreshTokens.length > 5) {
    this.refreshTokens.splice(0, this.refreshTokens.length - 5);
  }
  next();
});

// Instance method
userSchema.methods.comparePassword = function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

// Static method — also selects password + refreshTokens
userSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email }).select('+password +refreshTokens');
};

const User = mongoose.model<IUserDocument, IUserModel>('User', userSchema);
export default User;
