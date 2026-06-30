export enum UserRole {
  VIEWER = 'viewer',
  MEMBER = 'member',
  REVIEWER = 'reviewer',
  ADMIN = 'admin',
}

export interface IUser {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  employeeId?: string;
  isEmailVerified: boolean;
  assignedBuildings: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IAuthTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
}
