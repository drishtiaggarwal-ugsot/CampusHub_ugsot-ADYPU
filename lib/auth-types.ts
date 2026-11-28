export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'organizer';
  githubUsername?: string | null;
  skills?: string[];
  bio?: string | null;
  courseYear?: string | null;
  interests?: string[];
  goals?: string[];
  onboardingCompleted?: boolean;
  isProfilePrivate?: boolean;
  lookingForTeam?: boolean;
  isSuspended?: boolean;
  warningCount?: number;
};

export type VerifiedFirebaseUser = {
  uid: string;
  email: string;
  name: string;
  picture: string | null;
  emailVerified: boolean;
};

export class AuthServiceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'AuthServiceError';
  }
}
